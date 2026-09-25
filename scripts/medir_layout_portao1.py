#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
medir_layout_portao1.py — medição do Portão 1 (Etapa 1 da extração visual).

NÃO altera foliant.py, NÃO altera o pipeline, NÃO decide nada. Só mede o
PP-DocLayout-S contra o corpus fixado na Etapa 0 (ver corpus_visual/README.md)
e despeja números.

Roda num venv PRÓPRIO, fora do .venv do projeto — de propósito. Por isso NÃO
importa `foliant` (calibrar_ocr.py importa; aqui seria acoplar a medição ao
ambiente que ela não pode tocar). `RENDER_DPI` é reafirmado abaixo e precisa
continuar igual ao de foliant.py.

    python3.11 -m venv venv_layout
    venv_layout/bin/pip install onnxruntime==1.23.2 "numpy<2.3" pillow pymupdf
    venv_layout/bin/python scripts/medir_layout_portao1.py --modelo PP-DocLayout-S.onnx

REGRAS DO PORTÃO, FIXADAS ANTES DE MEDIR (não mexer depois de ver resultado):

  * Limiar de decisão = 0,50 — o `draw_threshold` da configuração oficial
    (inference.yml). O grafo ONNX já traz NMS com score_threshold 0,30
    embutido, então 0,30 é o piso do que sai. Os limiares extras existem só
    como dado de relatório; o portão usa 0,50.
  * Acerto = IoU >= 0,50 com uma caixa do gabarito E tipo compatível.
    figura  <-> {image, chart}   (o modelo não tem classe "figure")
    tabela  <-> {table}
    Subtipo (foto/gráfico/line-art) não precisa bater — estratifica o
    relatório, não julga o acerto. Critério idêntico ao do README §5.
  * Legenda (figure_title, chart_title, table_title) NÃO conta para recall.
  * Falso positivo = detecção de {image, chart, table} em página negativa.
  * Recall sai SEMPRE separado por domínio (público <=1930 / local moderno),
    nunca somado, e sempre com intervalo de Wilson 95%.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import resource
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pymupdf
from PIL import Image, ImageDraw

ort.set_default_logger_severity(3)

REPO = Path(__file__).parent.parent

# Igual ao RENDER_DPI de foliant.py. Não importado por isolamento (ver docstring).
RENDER_DPI = 200

LIMIAR_PORTAO = 0.50          # draw_threshold oficial
LIMIARES_EXTRA = (0.30, 0.40, 0.60, 0.70)
IOU_ACERTO = 0.50

# Ordem exata do label_list de inference.yml (23 classes).
CLASSES = (
    "paragraph_title", "image", "text", "number", "abstract", "content",
    "figure_title", "formula", "table", "table_title", "reference",
    "doc_title", "footnote", "header", "algorithm", "footer", "seal",
    "chart_title", "chart", "formula_number", "header_image", "footer_image",
    "aside_text",
)
CLASSES_VISUAIS = {"image", "chart", "table"}
TIPO_PARA_CLASSES = {"figura": {"image", "chart"}, "tabela": {"table"}}

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
ENTRADA = 480


# ---------------------------------------------------------------- inferência

class Detector:
    def __init__(self, caminho: Path):
        t0 = time.perf_counter()
        self.sessao = ort.InferenceSession(
            str(caminho), providers=["CPUExecutionProvider"]
        )
        self.tempo_carga_s = time.perf_counter() - t0

    def __call__(self, img: Image.Image) -> list[dict]:
        """Pré-processo de inference.yml: Resize 480x480 sem keep_ratio,
        /255, normalização ImageNet, HWC->CHW. O NMS já vem no grafo."""
        w, h = img.size
        red = img.resize((ENTRADA, ENTRADA), Image.BILINEAR)
        arr = (np.asarray(red, dtype=np.float32) / 255.0 - MEAN) / STD
        entrada = np.transpose(arr, (2, 0, 1))[None]
        sf = np.array([[ENTRADA / h, ENTRADA / w]], dtype=np.float32)
        dets, n = self.sessao.run(None, {"image": entrada, "scale_factor": sf})
        saida = []
        for linha in dets[: int(n[0])]:
            cid, score, x1, y1, x2, y2 = linha
            if score <= 0:
                continue
            saida.append({
                "classe": CLASSES[int(cid)],
                "score": float(score),
                "caixa": [float(x1), float(y1), float(x2), float(y2)],
            })
        return saida


def renderizar(pdf: Path, idx: int) -> Image.Image:
    doc = pymupdf.open(pdf)
    pix = doc[idx].get_pixmap(dpi=RENDER_DPI)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


# ---------------------------------------------------------------- geometria

def iou(a: list[float], b: list[float]) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    aa = (a[2] - a[0]) * (a[3] - a[1])
    bb = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (aa + bb - inter)


def wilson(acertos: int, n: int, z: float = 1.96) -> tuple[float, float, float]:
    """Ponto e intervalo de Wilson 95%. Obrigatório junto de todo recall."""
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = acertos / n
    d = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / d
    meio = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (p, max(0.0, centro - meio), min(1.0, centro + meio))


def girar_caixa(caixa, graus, w0, h0):
    """Leva uma caixa da imagem original para o referencial já girado.

    O corpus_local foi corrigido com `Image.rotate(-rot, expand=True)`, que é
    rotação horária de `rot`. Aqui aplico a MESMA rotação nas caixas que o
    modelo achou na página torta, para poder compará-las com o gabarito.
    """
    x1, y1, x2, y2 = caixa
    if graus == 0:
        return [x1, y1, x2, y2]
    if graus == 90:
        pts = [(h0 - y1, x1), (h0 - y2, x2)]
    elif graus == 180:
        pts = [(w0 - x1, h0 - y1), (w0 - x2, h0 - y2)]
    elif graus == 270:
        pts = [(y1, w0 - x1), (y2, w0 - x2)]
    else:
        raise ValueError(graus)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]


# ---------------------------------------------------------------- casamento

def casar(objetos: list[dict], dets: list[dict], limiar: float):
    """Casa gabarito x detecções. Guloso por score, cada detecção usada uma vez."""
    cands = [d for d in dets if d["score"] >= limiar and d["classe"] in CLASSES_VISUAIS]
    cands.sort(key=lambda d: -d["score"])
    usados: set[int] = set()
    resultado = []
    for obj in objetos:
        alvo = TIPO_PARA_CLASSES[obj["tipo"]]
        melhor, melhor_iou, melhor_i = None, 0.0, -1
        # melhor IoU entre as detecções de classe compatível ainda livres
        for i, d in enumerate(cands):
            if i in usados or d["classe"] not in alvo:
                continue
            v = iou(obj["caixa"]["px_200dpi"], d["caixa"])
            if v > melhor_iou:
                melhor, melhor_iou, melhor_i = d, v, i
        # melhor IoU ignorando classe, só para diagnosticar o tipo de erro
        iou_livre, det_livre = 0.0, None
        for d in cands:
            v = iou(obj["caixa"]["px_200dpi"], d["caixa"])
            if v > iou_livre:
                iou_livre, det_livre = v, d
        acerto = melhor_iou >= IOU_ACERTO
        if acerto:
            usados.add(melhor_i)
        resultado.append({
            "tipo": obj["tipo"], "subtipo": obj.get("subtipo"),
            "nota": obj.get("nota"), "caixa_gabarito": obj["caixa"]["px_200dpi"],
            "acerto": acerto, "iou": melhor_iou,
            "det": melhor if melhor else None,
            "iou_sem_tipo": iou_livre,
            "classe_sem_tipo": det_livre["classe"] if det_livre else None,
            "caixa_sem_tipo": det_livre["caixa"] if det_livre else None,
        })
    return resultado


# ---------------------------------------------------------------- desenho

def desenhar(img, objetos, dets, destino, limiar=LIMIAR_PORTAO):
    d = ImageDraw.Draw(img)
    for o in objetos:
        b = o["caixa"]["px_200dpi"] if "caixa" in o else o
        d.rectangle(b, outline=(220, 0, 0), width=6)
        d.text((b[0] + 8, b[1] + 8), "GABARITO", fill=(220, 0, 0))
    for det in dets:
        if det["score"] < limiar or det["classe"] not in CLASSES_VISUAIS:
            continue
        b = det["caixa"]
        d.rectangle(b, outline=(0, 150, 0), width=6)
        d.text((b[0] + 8, b[1] + 34),
               f'{det["classe"]} {det["score"]:.2f}', fill=(0, 150, 0))
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.resize((img.width // 2, img.height // 2)).save(destino, quality=82)


# ---------------------------------------------------------------- ambiente

def ambiente() -> dict:
    def sh(cmd):
        try:
            return subprocess.run(cmd, shell=True, capture_output=True,
                                  text=True, timeout=20).stdout.strip()
        except Exception:
            return "?"
    return {
        "data": time.strftime("%Y-%m-%d %H:%M:%S"),
        "macos": sh("sw_vers -productVersion"),
        "arch": platform.machine(),
        "cpu": sh("sysctl -n machdep.cpu.brand_string"),
        "ncpu": sh("sysctl -n hw.ncpu"),
        "python": sys.version.split()[0],
        "onnxruntime": ort.__version__,
        "numpy": np.__version__,
        "pymupdf": pymupdf.__doc__.split(":")[0].strip(),
        "therm": sh("pmset -g therm | tail -n +2"),
    }


def pico_rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)


# ---------------------------------------------------------------- medição

def medir_positivos(det: Detector, anotacoes, pdf_de, saida, dominio):
    paginas, tempos = [], []
    for pg in anotacoes:
        pdf = pdf_de(pg)
        img = renderizar(pdf, pg["idx_pdf"])
        t0 = time.perf_counter()
        dets = det(img)
        tempos.append(time.perf_counter() - t0)
        casos = casar(pg["objetos"], dets, LIMIAR_PORTAO)
        extras = {
            f"{lim:.2f}": sum(c["acerto"] for c in casar(pg["objetos"], dets, lim))
            for lim in LIMIARES_EXTRA
        }
        nome = f'{dominio}_{Path(pdf).stem}_idx{pg["idx_pdf"]}'
        if any(not c["acerto"] for c in casos):
            desenhar(img.copy(), pg["objetos"], dets, saida / "falhas" / f"{nome}.jpg")
        paginas.append({
            "dominio": dominio, "arquivo": Path(pdf).name, "idx": pg["idx_pdf"],
            "origem": pg.get("origem"), "livro": pg.get("livro"),
            "rotacao": pg.get("rotacao_aplicada_graus"),
            "px": list(img.size), "casos": casos, "acertos_por_limiar": extras,
            "n_dets_visuais": sum(
                1 for d in dets
                if d["score"] >= LIMIAR_PORTAO and d["classe"] in CLASSES_VISUAIS
            ),
        })
    return paginas, tempos


def medir_negativos(det: Detector, fontes, saida):
    paginas, tempos = [], []
    for produtor, pdf, indices in fontes:
        for idx in indices:
            img = renderizar(pdf, idx)
            t0 = time.perf_counter()
            dets = det(img)
            tempos.append(time.perf_counter() - t0)
            fps = [d for d in dets
                   if d["score"] >= LIMIAR_PORTAO and d["classe"] in CLASSES_VISUAIS]
            if fps:
                desenhar(img.copy(), [], dets,
                         saida / "falsos_positivos" / f"{produtor}_idx{idx}.jpg")
            paginas.append({
                "produtor": produtor, "arquivo": Path(pdf).name, "idx": idx,
                "fps": fps, "n_fp": len(fps),
            })
    return paginas, tempos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", required=True)
    ap.add_argument("--saida", required=True,
                    help="diretório de saída (FORA do repo: contém render de corpus_local)")
    ap.add_argument("--etapa", choices=("positivos", "negativos", "tudo"),
                    default="tudo",
                    help="máquina lenta: dá para fatiar e juntar os JSONs depois")
    ap.add_argument("--fatia", default="1/1",
                    help="i/n — mede só a i-ésima fatia das páginas negativas")
    args = ap.parse_args()

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    det = Detector(Path(args.modelo))
    env = ambiente()
    env["tempo_carga_modelo_s"] = round(det.tempo_carga_s, 3)
    print(json.dumps(env, indent=2, ensure_ascii=False))

    rel = {"ambiente": env, "regras": {
        "limiar_portao": LIMIAR_PORTAO, "iou_acerto": IOU_ACERTO,
        "mapa_tipos": {k: sorted(v) for k, v in TIPO_PARA_CLASSES.items()},
        "legenda_nao_conta": ["figure_title", "chart_title", "table_title"],
    }}

    faz_pos = args.etapa in ("positivos", "tudo")
    faz_neg = args.etapa in ("negativos", "tudo")

    # ---- positivos, domínio público (<=1930)
    t_pub = t_loc = []
    pub = json.load(open(REPO / "corpus_visual/anotacoes.json")) if faz_pos else []
    if faz_pos:
      rel["publico"], t_pub = medir_positivos(
        det, pub, lambda p: REPO / "corpus_visual/pdf" / p["arquivo"], saida, "publico")

    # ---- positivos, domínio local (moderno, fora do git)
    loc_path = REPO / "corpus_local/anotacoes_local.json"
    if faz_pos and loc_path.exists():
        loc = json.load(open(loc_path))
        rel["local"], t_loc = medir_positivos(
            det, loc, lambda p: REPO / "corpus_local/pdf" / p["arquivo"], saida, "local")

        # ---- extra, fora do portão: a MESMA página, torta como veio do celular
        tortas = []
        for pg in loc:
            rot = pg.get("rotacao_aplicada_graus") or 0
            if rot == 0:
                continue
            orig = REPO / "corpus_local" / pg["origem"]
            if not orig.exists():
                continue
            img = Image.open(orig).convert("RGB")
            w0, h0 = img.size
            dets = det(img)
            # leva as detecções da página torta para o referencial do gabarito
            girada_w, girada_h = (h0, w0) if rot in (90, 270) else (w0, h0)
            ex, ey = pg["pagina_px_200dpi"][0] / girada_w, pg["pagina_px_200dpi"][1] / girada_h
            conv = []
            for d in dets:
                c = girar_caixa(d["caixa"], rot, w0, h0)
                conv.append({**d, "caixa": [c[0] * ex, c[1] * ey, c[2] * ex, c[3] * ey]})
            casos = casar(pg["objetos"], conv, LIMIAR_PORTAO)
            tortas.append({
                "origem": pg["origem"], "rotacao": rot,
                "acertos": sum(c["acerto"] for c in casos), "n": len(casos),
                "n_dets_visuais": sum(1 for d in dets if d["score"] >= LIMIAR_PORTAO
                                      and d["classe"] in CLASSES_VISUAIS),
                "casos": casos,
            })
        rel["local_torta"] = tortas

    # ---- negativos: 225 páginas, 5 produtores
    if faz_neg:
        gil = REPO / "samples/livro_completo_208pg.pdf"
        fontes = [
            ("gil208", gil, [i for i in range(208) if i not in (0, 178)]),
            ("portos", REPO / "corpus_visual/pdf_negativo/neg_os_portos_maritimos_v2.pdf", range(6)),
            ("tractado", REPO / "corpus_visual/pdf_negativo/neg_tractado_clinica.pdf", range(6)),
            ("viagem", REPO / "corpus_visual/pdf_negativo/neg_viagem_ao_redor_do_brasil.pdf", range(6)),
        ]
        negl = REPO / "corpus_local/pdf_negativo/local_negativa_prosa.pdf"
        if negl.exists():
            fontes.append(("local_prosa", negl, range(1)))
        i, n = (int(x) for x in args.fatia.split("/"))
        planas = [(prod, pdf, idx) for prod, pdf, idxs in fontes for idx in idxs]
        minha = planas[(i - 1) * len(planas) // n: i * len(planas) // n]
        agrupado = {}
        for prod, pdf, idx in minha:
            agrupado.setdefault((prod, pdf), []).append(idx)
        rel["negativos"], t_neg = medir_negativos(
            det, [(p, f, ix) for (p, f), ix in agrupado.items()], saida)
    else:
        rel["negativos"], t_neg = [], []

    # ---- sanidade, fora do portão: página-figura inteira (Fase 4.21)
    san = []
    if not faz_pos:
        alvos = []
    fde = REPO / ("samples/Fundamentals of Data Engineering "
                  "(Third Early Release) -- Joe Reis & Matt Housley - cópia.pdf")
    if faz_pos:
        alvos = [("gil_gantt_idx178", REPO / "samples/livro_completo_208pg.pdf", 178)]
        if fde.exists():
            alvos += [(f"fde_idx{i}", fde, i) for i in (27, 28)]
    for nome, pdf, idx in alvos:
        img = renderizar(pdf, idx)
        dets = det(img)
        vis = [d for d in dets if d["score"] >= LIMIAR_PORTAO and d["classe"] in CLASSES_VISUAIS]
        desenhar(img.copy(), [], dets, saida / "sanidade" / f"{nome}.jpg")
        san.append({"nome": nome, "px": list(img.size), "dets_visuais": vis})
    rel["sanidade"] = san

    # ---- desempenho
    todos = t_pub + t_loc + t_neg
    if todos:
        s = sorted(todos)
        rel["desempenho"] = {
            "n_paginas": len(s),
            "mediana_s": round(s[len(s) // 2], 3),
            "p90_s": round(s[int(len(s) * 0.9)], 3),
            "min_s": round(s[0], 3), "max_s": round(s[-1], 3),
            "media_s": round(sum(s) / len(s), 3),
            "carga_modelo_s": round(det.tempo_carga_s, 3),
            "pico_rss_mb": round(pico_rss_mb(), 1),
        }

    sufixo = args.etapa + ("" if args.fatia == "1/1" else "_" + args.fatia.replace("/", "de"))
    destino = saida / f"portao1_{sufixo}.json"
    destino.write_text(json.dumps(rel, indent=1, ensure_ascii=False))
    print("gravado:", destino)


if __name__ == "__main__":
    main()

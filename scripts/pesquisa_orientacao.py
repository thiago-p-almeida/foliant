#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pesquisa_orientacao.py — medição de candidatos a detecção de orientação de
página (0/90/180/270) ANTES do OCR. Etapa de pesquisa: NÃO altera foliant.py,
NÃO altera o pipeline, NÃO decide nada. Só mede e despeja CSV/JSON.

Roda no `.venv` do projeto, porque todos os candidatos medidos aqui usam
SÓ dependências que o pipeline já tem (pymupdf, Pillow, pytesseract). O
candidato 4 (PP-LCNet) exigiria onnxruntime e por isso não é medido — ver
o relatório.

ASSIMETRIA DE CUSTO (critério fixado ANTES de medir, não mexer depois):
  * não corrigir página torta = status quo, custo zero adicional;
  * girar página que estava certa = estraga página boa. Erro CARO.
  => a métrica decisiva é a TAXA DE ROTAÇÃO INDEVIDA no controle negativo,
     não o acerto nas tortas.

RENDER_DPI=200 reafirmado abaixo, igual a foliant.py (não importa `foliant`
de propósito: medição não pode depender do módulo que ela mede).
"""
from __future__ import annotations

import argparse, csv, json, math, random, statistics, sys, time
from dataclasses import dataclass, field, asdict
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SAIDA = REPO / "scripts" / "pesquisa_orientacao_resultados"
RENDER_DPI = 200          # idêntico a foliant.py
LANG = "por"              # idêntico ao default de --lang em foliant.py

MAT = pymupdf.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)


# ----------------------------------------------------------------- render

DPI_ATUAL = RENDER_DPI   # sobrescrito por --dpi; 200 = produção


def render(pdf: Path, idx: int, dpi: int | None = None) -> Image.Image:
    """Caminho de render de produção: pymupdf get_pixmap a 200 DPI."""
    d = pymupdf.open(pdf)
    pg = d.load_page(idx)
    dpi = dpi or DPI_ATUAL
    m = pymupdf.Matrix(dpi / 72, dpi / 72)
    px = pg.get_pixmap(matrix=m)
    img = Image.frombytes("RGB", [px.width, px.height], px.samples)
    d.close()
    return img


def gira(img: Image.Image, graus: int) -> Image.Image:
    """Rotação exata por múltiplo de 90° (permutação de pixels, sem reamostrar).
    Convenção: `graus` no sentido anti-horário, igual ao PIL."""
    if graus % 360 == 0:
        return img
    return img.transpose({90: Image.Transpose.ROTATE_90,
                          180: Image.Transpose.ROTATE_180,
                          270: Image.Transpose.ROTATE_270}[graus % 360])


# ----------------------------------------------------------------- gabarito

@dataclass
class Caso:
    """Uma página do gabarito, já no referencial que o pipeline veria."""
    id: str
    grupo: str            # rot_real | ctrl_local0 | ctrl_branca | ctrl_ia | ctrl_gil | sintetico
    verdade: int          # graus (anti-horário) a aplicar para deixar a página em pé
    origem: str
    _abre: object = field(default=None, repr=False, compare=False)

    def img(self) -> Image.Image:
        """Preguiçoso de propósito: o controle negativo tem 200+ páginas e
        segurar todas a 200 DPI estouraria a RAM da máquina de referência."""
        return self._abre()


def _casa_rotacao(torta: Image.Image, certa: Image.Image) -> tuple[int, float]:
    """Descobre EMPIRICAMENTE qual rotação leva `torta` a `certa`, em vez de
    confiar na convenção de sinal do manifesto. Correlação em cinza 64px."""
    alvo = certa.convert("L").resize((64, 64))
    av = list(alvo.getdata())
    amu = sum(av) / len(av)
    melhor, melhor_r = None, 0
    for g in (0, 90, 180, 270):
        c = gira(torta, g).convert("L").resize((64, 64))
        cv = list(c.getdata())
        cmu = sum(cv) / len(cv)
        num = sum((x - amu) * (y - cmu) for x, y in zip(av, cv))
        den = math.sqrt(sum((x - amu) ** 2 for x in av) * sum((y - cmu) ** 2 for y in cv)) or 1e-9
        r = num / den
        if melhor is None or r > melhor:
            melhor, melhor_r = r, g
    return melhor_r, melhor


def _torta(rel: str, it: dict, sz_certa: tuple[int, int]) -> Image.Image:
    """Reconstrói a página COMO SAIU DO CELULAR, no mesmo número de pixels em
    que produção a renderizaria: o JPG original reamostrado para o tamanho da
    página corrigida (permutado, quando a rotação é de 90°/270°)."""
    r = it.get("rotacao_aplicada_graus") or 0
    jpg = Image.open(REPO / "corpus_local" / it["origem"]).convert("RGB")
    alvo = sz_certa if r % 180 == 0 else (sz_certa[1], sz_certa[0])
    return jpg.resize(alvo, Image.LANCZOS)


def _escala_producao(origem: str, verdade: int) -> Image.Image:
    """JPG cru levado à escala em que produção o renderizaria: a página
    CORRIGIDA teria 432 pt de largura, que a 200 DPI dá 1200 px."""
    im = Image.open(REPO / "corpus_local" / origem).convert("RGB")
    w, h = im.size
    k = 1200 / (w if verdade % 180 == 0 else h)
    return im.resize((round(w * k), round(h * k)), Image.LANCZOS)


def monta_gabarito(n_gil: int, seed: int = 20260925) -> list[Caso]:
    man = json.loads((REPO / "corpus_local/manifesto_local.json").read_text())
    casos: list[Caso] = []

    # ---- grupo ROT_REAL: as 12 páginas tortas de verdade (foto de celular).
    # Reconstruídas por rotação EXATA (múltiplo de 90°, permutação de pixels)
    # da página corrigida renderizada a 200 DPI. Não é rotação sintética de
    # página de acervo: a inclinação leve, a sombra e a perspectiva da foto
    # original continuam lá — só o enquadramento de 90° é desfeito.
    fontes = [("corpus_local/pdf/local_positivas.pdf", man["positivas"]),
              ("corpus_local/pdf_negativo/local_negativa_prosa.pdf", man["negativa_extra"])]
    for rel, itens in fontes:
        for it in itens:
            r = it.get("rotacao_aplicada_graus") or 0
            if r == 0:
                casos.append(Caso(f"local0_{it['idx_pdf']}", "ctrl_local0", 0, it["origem"],
                                  (lambda rel=rel, i=it["idx_pdf"]: render(REPO / rel, i))))
                continue
            certa = render(REPO / rel, it["idx_pdf"])
            g, corr = _casa_rotacao(_torta(rel, it, certa.size), certa)
            casos.append(Caso(f"rot_{Path(rel).stem}_{it['idx_pdf']}", "rot_real", g,
                              f"{it['origem']} (manifesto={r}, medido={g}, corr={corr:.3f})",
                              (lambda rel=rel, it=it, sz=certa.size: _torta(rel, it, sz))))

    # ---- grupo EXTRA: as 6 páginas que a Etapa 0 descartou POR CONTEÚDO
    # (figura de página inteira / sem prosa), não por orientação. São material
    # de celular igual ao resto e entram aqui porque o gabarito da Etapa 0 foi
    # SEMEADO pelo próprio OSD ("rotação proposta pelo OSD e conferida a
    # olho") — medir o OSD só nas páginas que sobreviveram a essa triagem
    # seria medir o OSD no corpus que ele mesmo ajudou a escolher.
    # Rotação verdadeira estabelecida por inspeção visual nesta rodada.
    # As três de 0° são o caso MAIS difícil do controle negativo: página
    # de formato paisagem, quase só tabela, prosa escassa.
    for origem, verd in (("1790222463802.jpg", 0), ("1790222463832.jpg", 0),
                         ("1790222463873.jpg", 0), ("1790223220989.jpg", 90),
                         ("1790223221066.jpg", 90), ("1790223221102.jpg", 90)):
        casos.append(Caso(f"extra_{origem[-10:-4]}", "extra_descartada", verd, origem,
                          (lambda o=origem, v=verd: _escala_producao(o, v))))

    # ---- grupo CTRL_BRANCA: 7 páginas em branco com sombra, todas em pé.
    for it in man["brancas_com_sombra"]:
        casos.append(Caso(f"branca_{it['idx_pdf']}", "ctrl_branca", 0, it["origem"],
                          (lambda i=it["idx_pdf"]: render(
                              REPO / "corpus_local/pdf/local_brancas_com_sombra.pdf", i))))

    # ---- controle negativo: páginas de prosa JÁ EM PÉ. É o número decisivo.
    for pdf in sorted((REPO / "corpus_visual/pdf_negativo").glob("*.pdf")):
        d = pymupdf.open(pdf); n = len(d); d.close()
        for i in range(n):
            casos.append(Caso(f"ia_{pdf.stem}_{i}", "ctrl_ia", 0, f"{pdf.name}#{i}",
                              (lambda p=pdf, i=i: render(p, i))))

    gil = REPO / "samples/livro_completo_208pg.pdf"
    if gil.exists() and n_gil:
        d = pymupdf.open(gil); n = len(d); d.close()
        cand = [i for i in range(n) if i not in (0, 178)]
        rnd = random.Random(seed)
        for i in sorted(rnd.sample(cand, min(n_gil, len(cand)))):
            casos.append(Caso(f"gil_{i}", "ctrl_gil", 0, f"livro_completo_208pg#{i}",
                              (lambda p=gil, i=i: render(p, i))))
    return casos


def sinteticos(casos: list[Caso], quantos: int, seed: int = 20260925) -> list[Caso]:
    """Rotações sintéticas de páginas de acervo JÁ EM PÉ. Gabarito exato, mas
    NÃO reproduzem inclinação leve nem perspectiva de foto de celular —
    medem o sinal em material limpo, que é o caso fácil."""
    base = [c for c in casos if c.grupo in ("ctrl_ia", "ctrl_gil")]
    rnd = random.Random(seed + 1)
    out = []
    for c in rnd.sample(base, min(quantos, len(base))):
        for g in (90, 180, 270):
            # para deixar em pé de novo é preciso girar 360-g
            out.append(Caso(f"syn_{c.id}_{g}", "sintetico", (360 - g) % 360,
                            f"{c.origem} girada {g}", (lambda c=c, g=g: gira(c.img(), g))))
    return out


# ================================================================ candidato 1
# OSD do Tesseract (--psm 0). Já instalado, zero dependência nova.

def _otsu(img_l: Image.Image) -> Image.Image:
    h = img_l.histogram()
    tot = sum(h); soma = sum(i * h[i] for i in range(256))
    sb = wb = 0.0; melhor = (-1.0, 128)
    for t in range(256):
        wb += h[t]
        if wb == 0: continue
        wf = tot - wb
        if wf == 0: break
        sb += t * h[t]
        mb = sb / wb; mf = (soma - sb) / wf
        var = wb * wf * (mb - mf) ** 2
        if var > melhor[0]: melhor = (var, t)
    t = melhor[1]
    return img_l.point(lambda p: 255 if p > t else 0, mode="L")


def _corta_margem(img: Image.Image, frac: float = 0.08) -> Image.Image:
    w, h = img.size
    dx, dy = int(w * frac), int(h * frac)
    return img.crop((dx, dy, w - dx, h - dy))


VARIANTES_OSD = {
    "cru":        lambda im: im,
    "binarizado": lambda im: _otsu(im.convert("L")).convert("RGB"),
    "margem":     lambda im: _corta_margem(im),
    "bin+margem": lambda im: _otsu(_corta_margem(im).convert("L")).convert("RGB"),
}


def osd(img: Image.Image, dpi_tag: int = RENDER_DPI) -> dict:
    """Uma chamada de OSD. `--dpi` explícito: sem ele o Tesseract avisa
    'Invalid resolution 0 dpi' e chuta a resolução."""
    t0 = time.time()
    try:
        d = pytesseract.image_to_osd(img, config=f"--dpi {dpi_tag}",
                                     output_type=pytesseract.Output.DICT)
        return {"ok": True, "rotate": int(d["rotate"]), "conf": float(d["orientation_conf"]),
                "script": d.get("script"), "s": time.time() - t0}
    except Exception as e:
        return {"ok": False, "rotate": None, "conf": None, "erro": type(e).__name__,
                "msg": str(e)[:120].replace("\n", " "), "s": time.time() - t0}


# ================================================================ candidato 3
# Sinal geométrico só com Pillow: perfil de projeção. Separa 0/180 de 90/270,
# NÃO separa 0 de 180. Barato por construção — nenhuma chamada de Tesseract.

def _perfil(img_l: Image.Image, eixo: str) -> list[float]:
    """Média por linha (eixo='h') ou por coluna (eixo='v'). `resize` para
    largura/altura 1 faz a média em C, sem numpy."""
    w, h = img_l.size
    if eixo == "h":
        return list(img_l.resize((1, h), Image.BOX).getdata())
    return list(img_l.resize((w, 1), Image.BOX).getdata())


def projecao(img: Image.Image, lado: int = 900, crop: float = 0.12) -> dict:
    """Palpite de EIXO (retrato 0/180 vs paisagem 90/270). Nunca separa 0 de
    180 — por construção, não por falta de ajuste.

    Duas decisões vieram de medição, não de intuição (ver relatório):
      * recorta 12% de margem ANTES de projetar. Sem o recorte a variância é
        dominada pela borda da página e pela sombra da lombada, não pela
        estrutura de linha — e o acerto cai de 55/57 para 152/245.
      * NÃO binariza. O Otsu na página inteira pega o fundo cinza do scan
        (19% de preto numa página de texto limpa) e destrói o sinal.
    """
    t0 = time.time()
    w, h = img.size
    dx, dy = int(w * crop), int(h * crop)
    g = img.crop((dx, dy, w - dx, h - dy)).convert("L")
    g.thumbnail((lado, lado), Image.BOX)
    ph, pv = _perfil(g, "h"), _perfil(g, "v")
    def var(p): return statistics.pvariance(p) if len(p) > 1 else 0.0
    vh, vv = var(ph), var(pv)
    razao = (vh + 1e-6) / (vv + 1e-6)
    return {"var_h": round(vh, 3), "var_v": round(vv, 3), "razao": round(razao, 4),
            "aspecto": round(w / h, 4),
            "eixo": "retrato(0/180)" if razao > 1 else "paisagem(90/270)",
            "s": round(time.time() - t0, 3)}


# ================================================================ candidato 2
# Comparação por OCR: roda o OCR em mais de uma orientação e fica com a que
# produz melhor texto. Autovalidante — rotação errada só vence se gerar texto
# melhor, que é exatamente a proteção contra o erro caro.

_PT_COMUNS = set("""a o as os um uma uns umas de do da dos das em no na nos nas por para com
sem sob sobre entre ate apos antes que se nao mais muito como quando onde qual quais quem
cujo cuja e ou mas porem porque pois ja tambem so apenas ainda depois seu sua seus suas
este esta estes estas esse essa esses essas aquele aquela isso isto aquilo eu tu ele ela
nos vos eles elas me te lhe nos vos lhes meu minha teu tua nosso nossa foi ser sao era eram
tem tinha ter havia ha pode podem deve devem faz fazer fez entao assim cada todo toda todos
todas outro outra outros outras mesmo mesma ao aos a as do dos na nas pelo pela pelos pelas
num numa dum duma nele nela neste nesta desse dessa qualquer sempre nunca bem mal maior
menor grande pequeno primeiro segundo terceiro parte forma caso vez vezes ano anos dia dias
tempo pessoa pessoas trabalho estudo processo sistema""".split())


def _tokens(dados: dict) -> list[tuple[str, float]]:
    out = []
    for txt, cf in zip(dados["text"], dados["conf"]):
        t = (txt or "").strip()
        try: c = float(cf)
        except (TypeError, ValueError): continue
        if t and c >= 0:
            out.append((t, c))
    return out


def pontua_ocr(img: Image.Image, lang: str = LANG) -> dict:
    """Uma passada de OCR + as métricas de qualidade de texto."""
    t0 = time.time()
    d = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    toks = _tokens(d)
    s = time.time() - t0
    if not toks:
        return {"n": 0, "conf_media": 0.0, "n_conf60": 0, "frac_lexico": 0.0,
                "frac_alfa": 0.0, "chars": 0, "s": s}
    confs = [c for _, c in toks]
    pal = [t.lower().strip(".,;:!?()[]\"'«»—-") for t, _ in toks]
    alfa = [p for p in pal if p and all(ch.isalpha() for ch in p)]
    lex = [p for p in alfa if p in _PT_COMUNS]
    return {"n": len(toks),
            "conf_media": sum(confs) / len(confs),
            "n_conf60": sum(1 for c in confs if c >= 60),
            "frac_lexico": len(lex) / max(len(toks), 1),
            "frac_alfa": len(alfa) / max(len(toks), 1),
            "chars": sum(len(t) for t, _ in toks),
            "s": s}


# ==================================================================== driver

def grava(nome: str, linhas: list[dict]) -> Path:
    SAIDA.mkdir(parents=True, exist_ok=True)
    p = SAIDA / nome
    if not linhas:
        p.write_text(""); return p
    campos = sorted({k for l in linhas for k in l})
    ordem = [c for c in ("id", "grupo", "verdade", "origem") if c in campos]
    campos = ordem + [c for c in campos if c not in ordem]
    with p.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for l in linhas: w.writerow(l)
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--etapa", required=True,
                    choices=("gabarito", "osd", "proj", "ocr"))
    ap.add_argument("--n-gil", type=int, default=40,
                    help="quantas páginas do livro de 208 entram no controle negativo")
    ap.add_argument("--n-sint", type=int, default=0,
                    help="quantas páginas em pé viram rotação sintética (x3)")
    ap.add_argument("--variantes", default="",
                    help="subconjunto de VARIANTES_OSD, separado por vírgula")
    ap.add_argument("--dpi", type=int, default=RENDER_DPI,
                    help="DPI de render do gabarito (200 = produção)")
    ap.add_argument("--saida-sufixo", default="",
                    help="sufixo do arquivo de saída, para não sobrescrever corrida anterior")
    ap.add_argument("--limite-grupos", default="",
                    help="lista de grupos a medir, separada por vírgula")
    args = ap.parse_args()

    globals()["DPI_ATUAL"] = args.dpi
    suf = args.saida_sufixo
    t0 = time.time()
    casos = monta_gabarito(args.n_gil)
    if args.n_sint:
        casos += sinteticos(casos, args.n_sint)
    if args.limite_grupos:
        alvo = set(args.limite_grupos.split(","))
        casos = [c for c in casos if c.grupo in alvo]
    print(f"gabarito: {len(casos)} casos em {time.time()-t0:.1f}s", file=sys.stderr)
    from collections import Counter
    print("  " + str(Counter(c.grupo for c in casos)), file=sys.stderr)

    if args.etapa == "gabarito":
        linhas = [{"id": c.id, "grupo": c.grupo, "verdade": c.verdade,
                   "origem": c.origem, "px": "%dx%d" % c.img().size} for c in casos]
        print("->", grava(f"gabarito{suf}.csv", linhas))
        return 0

    if args.etapa == "proj":
        linhas = []
        for c in casos:
            r = projecao(c.img())
            linhas.append({"id": c.id, "grupo": c.grupo, "verdade": c.verdade,
                           "origem": c.origem, **r})
        print("->", grava(f"projecao{suf}.csv", linhas))
        return 0

    if args.etapa == "osd":
        linhas = []
        for k, (c) in enumerate(casos):
            linha = {"id": c.id, "grupo": c.grupo, "verdade": c.verdade, "origem": c.origem}
            for nome, prep in ({k: VARIANTES_OSD[k] for k in args.variantes.split(",")}
                               if args.variantes else VARIANTES_OSD).items():
                r = osd(prep(c.img()))
                linha[f"{nome}_rot"] = r["rotate"]
                linha[f"{nome}_conf"] = r["conf"]
                linha[f"{nome}_ok"] = r["ok"]
                linha[f"{nome}_s"] = round(r["s"], 2)
            # variante de DPI: 300 no lugar de 200 (só no cru)
            linhas.append(linha)
            if k % 10 == 0:
                print(f"  osd {k+1}/{len(casos)} {time.time()-t0:.0f}s", file=sys.stderr)
        print("->", grava(f"osd{suf}.csv", linhas))
        return 0

    if args.etapa == "ocr":
        linhas = []
        for k, c in enumerate(casos):
            linha = {"id": c.id, "grupo": c.grupo, "verdade": c.verdade, "origem": c.origem}
            base = c.img()
            meia = base.resize((base.size[0] // 2, base.size[1] // 2), Image.LANCZOS)
            for g in (0, 90, 180, 270):
                for pref, im in (("g", base), ("r", meia)):
                    r = pontua_ocr(gira(im, g))
                    for kk, vv in r.items():
                        linha[f"{pref}{g}_{kk}"] = round(vv, 4) if isinstance(vv, float) else vv
            linhas.append(linha)
            print(f"  ocr {k+1}/{len(casos)} {c.id} {time.time()-t0:.0f}s", file=sys.stderr)
            grava(f"ocr4{suf}.csv", linhas)   # grava incremental: a corrida é longa
        print("->", grava(f"ocr4{suf}.csv", linhas))
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

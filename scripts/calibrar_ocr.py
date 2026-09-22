#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calibrar_ocr.py — medição exploratória (Fase 4.15).

NÃO altera foliant.py, NÃO decide threshold nenhum. Só mede, no caminho
exato de extrair_texto_pagina()/contar_nativas() (importados de
foliant.py, nunca reimplementados aqui), tempo real de OCR/nativo por
página e coleta a distribuição de `conf` que pytesseract.image_to_data
já devolve e que a produção hoje descarta.

Uso:
  python3 scripts/calibrar_ocr.py
  python3 scripts/calibrar_ocr.py --n-amostra 20
  python3 scripts/calibrar_ocr.py --analisar scripts/calibracao_ocr_resultados/medicoes_consolidado.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from statistics import mean, median, stdev

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pymupdf
import pytesseract
from PIL import Image

import foliant  # reaproveita RENDER_DPI, contar_nativas — nunca duplicados aqui


PDFS_PADRAO = [
    (REPO_ROOT / "samples" / "001-080.pdf", 20),
    (REPO_ROOT / "samples" / "livro_completo_208pg.pdf", 20),
    (REPO_ROOT / "samples" / "Artigos Científicos - Como Redigir, Publicar e Avaliar -- PEREIRA, Maurício Gomes.pdf", 30),
    (REPO_ROOT / "samples" / "Fundamentals of Data Engineering (Third Early Release) -- Joe Reis & Matt Housley - cópia.pdf", 30),
    (REPO_ROOT / "tests" / "fixtures" / "falha_ocr_ilegivel.pdf", None),  # todas
    (REPO_ROOT / "tests" / "fixtures" / "ressalva_parcial.pdf", None),  # todas
]

RESULTADOS_DIR = REPO_ROOT / "scripts" / "calibracao_ocr_resultados"

CSV_CAMPOS = [
    "arquivo", "pagina_idx", "tipo",
    "tempo_render_s", "tempo_ocr_s", "tempo_total_s",
    "n_palavras", "n_chars",
    "conf_media", "conf_mediana", "conf_min", "conf_p10", "conf_p25",
]


def percentil(valores: list[float], p: float) -> float:
    """Percentil por interpolação linear, sem depender de numpy (o
    projeto não usa essa dependência hoje — não introduzir por isto)."""
    if not valores:
        raise ValueError("lista vazia")
    ordenados = sorted(valores)
    if len(ordenados) == 1:
        return ordenados[0]
    k = (len(ordenados) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(ordenados) - 1)
    if f == c:
        return ordenados[f]
    return ordenados[f] + (ordenados[c] - ordenados[f]) * (k - f)


def amostrar_paginas(total: int, n_amostra: int | None) -> list[int]:
    """Amostra espalhada (início/meio/fim), não sequencial — cobre
    variação estrutural do livro (sumário, texto corrido, etc), não só
    um trecho. n_amostra=None significa "todas as páginas"."""
    if n_amostra is None or n_amostra >= total:
        return list(range(total))
    passo = max(1, total // n_amostra)
    paginas = list(range(0, total, passo))[:n_amostra]
    return paginas


def medir_pagina_nativa(pagina: "pymupdf.Page") -> dict:
    t0 = time.perf_counter()
    texto = pagina.get_text("text").strip()
    dt = time.perf_counter() - t0
    return {
        "tipo": "nativa",
        "tempo_render_s": None,
        "tempo_ocr_s": None,
        "tempo_total_s": dt,
        "n_palavras": len(texto.split()),
        "n_chars": len(texto),
        "conf_media": None, "conf_mediana": None, "conf_min": None,
        "conf_p10": None, "conf_p25": None,
    }


def medir_pagina_ocr(pagina: "pymupdf.Page", matriz_zoom: "pymupdf.Matrix", lang: str) -> dict:
    """Replica o corpo exato do branch OCR de extrair_texto_pagina
    (foliant.py:683-686): mesmo render (matriz_zoom vem de
    foliant.RENDER_DPI, nunca recalculada aqui) e mesma chamada
    image_to_data — só adiciona cronometragem e extração de `conf`,
    que a produção descarta."""
    t0 = time.perf_counter()
    pixmap = pagina.get_pixmap(matrix=matriz_zoom)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    t_render = time.perf_counter() - t0

    t1 = time.perf_counter()
    dados = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    t_ocr = time.perf_counter() - t1
    img.close()

    # conf == -1 marca blocos estruturais (linha/parágrafo/bloco) sem
    # ser palavra real — confirmado inspecionando a distribuição bruta
    # de dados["conf"] numa página de amostra antes de fixar este
    # filtro (ver passo 2 do plano). Filtrar também por texto não-vazio
    # evita contar espaços/quebras como palavra.
    confs = [
        int(c) for c, t in zip(dados["conf"], dados["text"])
        if t.strip() and int(c) >= 0
    ]

    stats = {}
    if confs:
        stats["conf_media"] = mean(confs)
        stats["conf_mediana"] = median(confs)
        stats["conf_min"] = min(confs)
        stats["conf_p10"] = percentil(confs, 10)
        stats["conf_p25"] = percentil(confs, 25)
    else:
        stats = {"conf_media": None, "conf_mediana": None, "conf_min": None,
                  "conf_p10": None, "conf_p25": None}

    return {
        "tipo": "ocr",
        "tempo_render_s": t_render,
        "tempo_ocr_s": t_ocr,
        "tempo_total_s": t_render + t_ocr,
        "n_palavras": len(confs),
        "n_chars": sum(len(t) for t in dados["text"] if t.strip()),
        **stats,
    }


def medir_pdf(pdf_path: Path, n_amostra: int | None, lang: str) -> list[dict]:
    print(f"  {pdf_path.name} ...")
    doc = pymupdf.open(pdf_path)
    total = doc.page_count
    matriz_zoom = pymupdf.Matrix(foliant.RENDER_DPI / 72, foliant.RENDER_DPI / 72)

    paginas = amostrar_paginas(total, n_amostra)
    linhas = []
    for i in paginas:
        pagina = doc.load_page(i)
        # mesmo critério de decisão nativo/OCR que extrair_texto_pagina
        # (foliant.py:669-672) — não duplicar a lógica, só o teste.
        eh_nativa = bool(pagina.get_text("text").strip())
        if eh_nativa:
            medida = medir_pagina_nativa(pagina)
        else:
            medida = medir_pagina_ocr(pagina, matriz_zoom, lang)
        medida["arquivo"] = pdf_path.name
        medida["pagina_idx"] = i
        linhas.append(medida)
        print(f"    página {i+1}/{total}: {medida['tipo']}, {medida['tempo_total_s']:.3f}s")

    doc.close()
    return linhas


def capturar_ambiente() -> dict:
    ambiente = {
        "platform": platform.platform(),
        "tesseract_version": str(pytesseract.get_tesseract_version()),
        "tesseract_path": shutil.which("tesseract"),
        "render_dpi": foliant.RENDER_DPI,
        "render_dpi_fonte": "foliant.RENDER_DPI (import direto, não hardcoded)",
    }
    try:
        therm = subprocess.run(["pmset", "-g", "therm"], capture_output=True, text=True, timeout=5)
        ambiente["pmset_therm"] = therm.stdout.strip()
    except Exception as erro:
        ambiente["pmset_therm"] = f"indisponível: {erro}"
    return ambiente


def rodar_medicoes(n_amostra_override: int | None, lang: str) -> None:
    RESULTADOS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    ambiente = capturar_ambiente()
    print("Ambiente de medição:")
    for chave, valor in ambiente.items():
        print(f"  {chave}: {valor}")
    assert ambiente["render_dpi"] == 200, (
        "RENDER_DPI divergente do valor fixado em produção (foliant.py:92) — "
        "medições não seriam comparáveis ao pipeline real."
    )

    todas_linhas = []
    amostragem_por_arquivo = {}
    for pdf_path, n in PDFS_PADRAO:
        if not pdf_path.exists():
            print(f"  AVISO: {pdf_path} não encontrado — pulando.")
            continue
        # fixtures (n padrão None = "todas as páginas") sempre rodam
        # completas, independente de --n-amostra — são poucas páginas
        # e são a amostra "ruim" de confiança, não algo a reduzir.
        if n is None:
            n_efetivo = None
        else:
            n_efetivo = n_amostra_override if n_amostra_override else n
        linhas = medir_pdf(pdf_path, n_efetivo, lang)
        todas_linhas.extend(linhas)
        amostragem_por_arquivo[pdf_path.name] = {
            "n_amostra_pedido": n_efetivo,
            "paginas_medidas": [l["pagina_idx"] for l in linhas],
        }

    csv_path = RESULTADOS_DIR / f"medicoes_{timestamp}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_CAMPOS)
        writer.writeheader()
        for linha in todas_linhas:
            writer.writerow({k: linha.get(k) for k in CSV_CAMPOS})

    metadados_path = RESULTADOS_DIR / f"metadados_{timestamp}.json"
    metadados_path.write_text(
        json.dumps({
            "ambiente": ambiente,
            "lang": lang,
            "amostragem_por_arquivo": amostragem_por_arquivo,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\nCSV: {csv_path}")
    print(f"Metadados: {metadados_path}")


def analisar(csv_path: Path) -> None:
    with csv_path.open(encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))

    def como_float(v):
        return float(v) if v not in (None, "", "None") else None

    por_arquivo_tipo: dict[tuple[str, str], list[float]] = {}
    conf_por_grupo: dict[str, list[float]] = {"boas": [], "ruins": []}
    FIXTURES_RUINS = {"falha_ocr_ilegivel.pdf", "ressalva_parcial.pdf"}

    for linha in linhas:
        chave = (linha["arquivo"], linha["tipo"])
        tempo = como_float(linha["tempo_total_s"])
        if tempo is not None:
            por_arquivo_tipo.setdefault(chave, []).append(tempo)

        conf = como_float(linha["conf_media"])
        if conf is not None:
            grupo = "ruins" if linha["arquivo"] in FIXTURES_RUINS else "boas"
            conf_por_grupo[grupo].append(conf)

    print("\n=== Tempo por arquivo/tipo ===")
    for (arquivo, tipo), tempos in sorted(por_arquivo_tipo.items()):
        linha_stats = f"{arquivo} [{tipo}] n={len(tempos)} média={mean(tempos):.3f}s mediana={median(tempos):.3f}s min={min(tempos):.3f}s max={max(tempos):.3f}s"
        if len(tempos) > 1:
            linha_stats += f" desvio={stdev(tempos):.3f}s"
        print(f"  {linha_stats}")

    print("\n=== Distribuição de confiança (conf_media por página) ===")
    for grupo, valores in conf_por_grupo.items():
        if not valores:
            print(f"  {grupo}: sem dados")
            continue
        ps = {p: percentil(valores, p) for p in (10, 25, 50, 75, 90)}
        print(f"  {grupo} (n={len(valores)}): p10={ps[10]:.1f} p25={ps[25]:.1f} p50={ps[50]:.1f} p75={ps[75]:.1f} p90={ps[90]:.1f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n-amostra", type=int, default=None, help="sobrescreve n de amostra para todos os PDFs padrão")
    parser.add_argument("--lang", default="por")
    parser.add_argument("--analisar", type=Path, help="caminho de um CSV consolidado para analisar em vez de medir")
    args = parser.parse_args()

    if args.analisar:
        analisar(args.analisar)
        return

    rodar_medicoes(args.n_amostra, args.lang)


if __name__ == "__main__":
    main()

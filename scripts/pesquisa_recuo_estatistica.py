#!/usr/bin/env python3
"""Pesquisa estatística: distribuição de `left` (posição X da primeira
palavra de cada linha) e de terminação em hífen, ao longo de várias
páginas reais — para calibrar o critério de fusão de linha (Tarefa B)."""
import sys
from collections import Counter
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image

RENDER_DPI = 200
PDF_PATH = Path(sys.argv[1])
INICIO, FIM = int(sys.argv[2]), int(sys.argv[3])  # 0-indexed, [inicio, fim)

doc = pymupdf.open(PDF_PATH)
matriz_zoom = pymupdf.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

lefts = Counter()
gaps_continuacao = []
gaps_possivel_paragrafo = []
terminam_hifen = 0
total_linhas = 0
exemplos_hifen = []

for i in range(INICIO, FIM):
    pagina = doc.load_page(i)
    pixmap = pagina.get_pixmap(matrix=matriz_zoom)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    dados = pytesseract.image_to_data(img, lang="por", output_type=pytesseract.Output.DICT)
    img.close()

    agrupado = {}
    n = len(dados["text"])
    for k in range(n):
        texto_palavra = dados["text"][k]
        if not texto_palavra.strip():
            continue
        chave = (dados["block_num"][k], dados["par_num"][k], dados["line_num"][k])
        info = agrupado.setdefault(chave, {"palavras": [], "alturas": [], "lefts": [], "tops": []})
        info["palavras"].append(texto_palavra)
        info["alturas"].append(dados["height"][k])
        info["lefts"].append(dados["left"][k])
        info["tops"].append(dados["top"][k])

    linha_anterior_bottom = None
    linha_anterior_texto = None
    for chave in sorted(agrupado):
        info = agrupado[chave]
        texto = " ".join(info["palavras"])
        left = info["lefts"][0]
        top = min(info["tops"])
        altura = sum(info["alturas"]) / len(info["alturas"])
        bottom = top + altura

        total_linhas += 1
        lefts[round(left / 10) * 10] += 1  # bucket de 10px

        if texto.rstrip().endswith("-"):
            terminam_hifen += 1
            if len(exemplos_hifen) < 15:
                exemplos_hifen.append(texto[-40:])

        if linha_anterior_bottom is not None:
            gap = top - linha_anterior_bottom
            # classifica heuristicamente por left só pra comparar gaps
            if left <= 60:
                gaps_continuacao.append(gap)
            else:
                gaps_possivel_paragrafo.append(gap)

        linha_anterior_bottom = bottom
        linha_anterior_texto = texto

doc.close()

print(f"total de linhas analisadas: {total_linhas}")
print("\ndistribuição de `left` (bucket 10px):")
for bucket in sorted(lefts):
    print(f"  {bucket:5d}: {'#' * min(lefts[bucket], 80)} ({lefts[bucket]})")

print(f"\nlinhas terminando em hífen: {terminam_hifen} / {total_linhas} ({100*terminam_hifen/total_linhas:.2f}%)")
print("exemplos:")
for ex in exemplos_hifen:
    print(f"  ...{ex!r}")

import statistics as st
if gaps_continuacao:
    print(f"\ngap_y quando left<=60 (provável continuação): n={len(gaps_continuacao)} "
          f"mediana={st.median(gaps_continuacao):.1f} min={min(gaps_continuacao):.1f} max={max(gaps_continuacao):.1f}")
if gaps_possivel_paragrafo:
    print(f"gap_y quando left>60 (provável novo parágrafo): n={len(gaps_possivel_paragrafo)} "
          f"mediana={st.median(gaps_possivel_paragrafo):.1f} min={min(gaps_possivel_paragrafo):.1f} max={max(gaps_possivel_paragrafo):.1f}")

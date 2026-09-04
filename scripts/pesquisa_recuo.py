#!/usr/bin/env python3
"""Script de pesquisa (não faz parte do pipeline) para investigar sinais de
layout que diferenciam início de parágrafo de linha de continuação, usando
páginas reais. Ver TASKS.md / ARCHITECTURE.md, Tarefa B (recuo de linha)."""
import sys
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image

RENDER_DPI = 200

PDF_PATH = Path(sys.argv[1])
PAGINAS = [int(x) for x in sys.argv[2:]]  # 0-indexed

OUT_DIR = Path("/tmp/pesquisa_recuo")
OUT_DIR.mkdir(exist_ok=True)

doc = pymupdf.open(PDF_PATH)
matriz_zoom = pymupdf.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

for i in PAGINAS:
    pagina = doc.load_page(i)
    pixmap = pagina.get_pixmap(matrix=matriz_zoom)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    png_path = OUT_DIR / f"pagina_{i}.png"
    img.save(png_path)

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

    print(f"\n=== página {i} (png salvo em {png_path}) ===")
    linha_anterior_bottom = None
    for chave in sorted(agrupado):
        info = agrupado[chave]
        texto = " ".join(info["palavras"])
        left = info["lefts"][0]  # left da PRIMEIRA palavra da linha
        top = min(info["tops"])
        altura = sum(info["alturas"]) / len(info["alturas"])
        bottom = top + altura
        gap = (top - linha_anterior_bottom) if linha_anterior_bottom is not None else None
        gap_str = f"{gap:6.1f}" if gap is not None else "   n/a"
        print(f"  left={left:5d} top={top:5d} gap_y={gap_str} altura={altura:5.1f}  {texto[:70]!r}")
        linha_anterior_bottom = bottom

doc.close()

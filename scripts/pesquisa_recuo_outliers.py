#!/usr/bin/env python3
import sys
from pathlib import Path
import pymupdf, pytesseract
from PIL import Image

RENDER_DPI = 200
PDF_PATH = Path(sys.argv[1])
INICIO, FIM = int(sys.argv[2]), int(sys.argv[3])
LO, HI = int(sys.argv[4]), int(sys.argv[5])

doc = pymupdf.open(PDF_PATH)
matriz_zoom = pymupdf.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
achados = 0

for i in range(INICIO, FIM):
    pagina = doc.load_page(i)
    pixmap = pagina.get_pixmap(matrix=matriz_zoom)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    dados = pytesseract.image_to_data(img, lang="por", output_type=pytesseract.Output.DICT)
    img.close()
    agrupado = {}
    n = len(dados["text"])
    for k in range(n):
        t = dados["text"][k]
        if not t.strip():
            continue
        chave = (dados["block_num"][k], dados["par_num"][k], dados["line_num"][k])
        info = agrupado.setdefault(chave, {"palavras": [], "lefts": []})
        info["palavras"].append(t)
        info["lefts"].append(dados["left"][k])
    for chave in sorted(agrupado):
        info = agrupado[chave]
        left = info["lefts"][0]
        if LO <= left < HI:
            print(f"pagina={i} left={left}  {' '.join(info['palavras'])[:80]!r}")
            achados += 1
doc.close()
print(f"total: {achados}")

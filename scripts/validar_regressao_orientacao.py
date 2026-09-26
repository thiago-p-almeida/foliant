#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compara o HTML produzido por uma versão de foliant.py contra outra, no
pipeline REAL (primeira_passada -> construir_html). Usado para provar que a
Fase 4.26 não mexeu em livro nenhum que não tivesse página torta.

    python scripts/validar_regressao_orientacao.py --modulo <caminho/foliant.py> --pdf <pdf> --saida <json>
"""
import argparse, importlib.util, json, re, sys, tempfile, time
from collections import Counter
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--modulo", required=True)
ap.add_argument("--pdf", required=True)
ap.add_argument("--saida", required=True)
ap.add_argument("--lang", default="por")
args = ap.parse_args()

spec = importlib.util.spec_from_file_location("fol_sob_teste", args.modulo)
fol = importlib.util.module_from_spec(spec)
sys.modules["fol_sob_teste"] = fol
spec.loader.exec_module(fol)

t0 = time.time()
with tempfile.TemporaryDirectory() as td:
    cache = Path(td) / "cache.jsonl"
    html = Path(td) / "livro.html"
    res = fol.primeira_passada(Path(args.pdf), cache, lang=args.lang)
    cabecalhos, capa_path, total = res[0], res[1], res[2]
    giradas = res[3] if len(res) > 3 else []
    t_passo1 = time.time() - t0
    saida = fol.construir_html(cache, html, titulo="T", cabecalhos=cabecalhos, lang=args.lang)
    texto = html.read_text(encoding="utf-8")

rel = {
    "pdf": Path(args.pdf).name,
    "modulo": args.modulo,
    "total_paginas": total,
    "n_p": texto.count("<p"),
    "n_h2": texto.count("<h2"),
    "n_img": texto.count("<img"),
    "cabecalhos_n": len(cabecalhos),
    "cabecalhos": sorted(cabecalhos),
    "paginas_sem_texto": saida[0],
    "paginas_figura": saida[1],
    "paginas_branco": saida[2],
    "paginas_capa": saida[3],
    "paginas_giradas": giradas,
    "sha_html": __import__("hashlib").sha256(texto.encode()).hexdigest(),
    "segundos_passo1": round(t_passo1, 1),
    "segundos_por_pagina": round(t_passo1 / max(total, 1), 2),
}
Path(args.saida).write_text(json.dumps(rel, ensure_ascii=False, indent=1))
print(json.dumps({k: v for k, v in rel.items() if k != "cabecalhos"}, ensure_ascii=False))

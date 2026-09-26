#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validar_orientacao.py — valida a Fase 4.26 chamando a FUNÇÃO DE PRODUÇÃO
(`foliant.detectar_rotacao`), não uma reimplementação de pesquisa.

Gabarito: o mesmo de ORIENTACAO_PAGINA_2026.md, montado por
scripts/pesquisa_orientacao.py (15 tortas reais + 236 páginas já em pé).
"""
import argparse, csv, statistics, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "scripts"))

import foliant
import pesquisa_orientacao as P

ap = argparse.ArgumentParser()
ap.add_argument("--n-gil", type=int, default=206)
ap.add_argument("--limite-grupos", default="")
args = ap.parse_args()

casos = P.monta_gabarito(args.n_gil)
if args.limite_grupos:
    alvo = set(args.limite_grupos.split(","))
    casos = [c for c in casos if c.grupo in alvo]

linhas, t0 = [], time.time()
ok = err = fica = ind = nc = 0
for k, c in enumerate(casos):
    img = c.img()
    t = time.time()
    graus = foliant.detectar_rotacao(img, "por")
    dt = time.time() - t
    v = c.verdade
    if v != 0:
        if graus == v: ok += 1
        elif graus == 0: fica += 1
        else: err += 1
    else:
        nc += 1
        ind += graus != 0
    linhas.append({"id": c.id, "grupo": c.grupo, "verdade": v,
                   "detectado": graus, "acertou": graus == v, "s": round(dt, 2)})
    if (k + 1) % 25 == 0:
        print(f"  {k+1}/{len(casos)} {time.time()-t0:.0f}s", file=sys.stderr)

saida = REPO / "scripts/pesquisa_orientacao_resultados/validacao_producao.csv"
with saida.open("w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0]))
    w.writeheader(); w.writerows(linhas)

print(f"\n=== foliant.detectar_rotacao (produção) em {len(casos)} páginas ===")
print(f"  tortas corrigidas   : {ok}/{ok+err+fica}  (ângulo errado {err}, deixada em pé {fica})")
print(f"  ROTAÇÃO INDEVIDA    : {ind}/{nc}")
for l in linhas:
    if l["verdade"] == 0 and l["detectado"] != 0:
        print(f"    INDEVIDA {l['id']} -> {l['detectado']}")
    if l["verdade"] != 0 and not l["acertou"]:
        print(f"    TORTA NÃO CORRIGIDA {l['id']} verdade={l['verdade']} detectado={l['detectado']}")
for g in sorted({l["grupo"] for l in linhas}):
    ts = [l["s"] for l in linhas if l["grupo"] == g]
    print(f"  tempo {g:18s} n={len(ts):3d} média {statistics.mean(ts):.2f}s")
print(f"-> {saida}")

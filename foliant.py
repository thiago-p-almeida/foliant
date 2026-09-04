#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foliant.py — v2
================

Pipeline offline e leve: PDF (escaneado ou não) -> OCR -> HTML -> EPUB/AZW3.

Mudança em relação à v1: removido o OCRmyPDF (e suas dependências pesadas —
Ghostscript, qpdf). O OCR roda direto sobre a imagem renderizada de cada
página pelo PyMuPDF, sem gerar um PDF intermediário.

Mudança em relação à v2 original: passou de passada única para duas
passadas leves (ver ARCHITECTURE.md). A passada 1 faz OCR e grava o texto
bruto de cada página num cache em disco (JSON-lines), além de identificar
cabeçalhos de seção repetidos; a passada 2 lê o cache (sem OCR novo) para
montar o HTML final já limpo. O OCR continua rodando uma única vez por
página — o cache em disco é o que evita ter que rodar OCR de novo na
passada 2, mantendo o mesmo perfil de RAM de antes (nunca mais que uma
página em memória por vez).

Dependências de sistema (instaladas via micromamba, sem Homebrew):
  micromamba create -n foliant-ocr -c conda-forge tesseract tesseract-lang
  sudo ln -s ~/micromamba/envs/foliant-ocr/bin/tesseract /usr/local/bin/tesseract
  export TESSDATA_PREFIX=~/micromamba/envs/foliant-ocr/share/tessdata

Calibre (baixado direto do .dmg, não via brew):
  /Applications/calibre.app/Contents/MacOS/ebook-convert
  (ou o symlink em /usr/local/bin/ebook-convert)

Dependências Python (dentro do seu venv):
  pip install pymupdf pytesseract pillow

Uso:
  python3 foliant.py entrada.pdf saida.epub --autor "Nome do Autor"
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image


REQUIRED_BINARIES = ["tesseract", "ebook-convert"]

# Fallback absoluto para o caso do PATH do processo não incluir
# /usr/local/bin por algum motivo (ex.: app GUI empacotado herdando o
# PATH mínimo do launchd em vez do PATH do shell interativo — ver
# ARCHITECTURE.md, seção "Fase 4.3"). shutil.which() continua sendo a
# checagem primária; isso só evita um falso negativo quando o binário
# está instalado no lugar padrão documentado no topo deste arquivo, mas
# não está visível no PATH herdado.
CAMINHOS_ABSOLUTOS_FALLBACK = {
    "tesseract": "/usr/local/bin/tesseract",
    "ebook-convert": "/usr/local/bin/ebook-convert",
}

# DPI de renderização: trade-off qualidade de OCR x velocidade/RAM numa
# CPU fraca. TESTADO E REVERTIDO: subir de 200 para 300 (e também 250,
# testado como meio-termo) foi tentado para corrigir pontos de numeração
# de sumário sumindo em fonte pequena ("7.1" vira "71") em
# samples/001-080.pdf. Não resolveu isso de forma confiável, e pior:
# introduziu uma categoria de defeito NOVA e mais grave num punhado de
# blocos de sumário — número de capítulo/seção desaparecendo por completo
# (não só o ponto), ou os números e os rótulos de texto sendo lidos como
# dois blocos separados sem pareamento entre eles (Tesseract lendo as
# "colunas" da página de sumário fora de ordem). 250 reproduziu O MESMO
# defeito estrutural nos mesmos trechos, então não é um gradiente onde um
# DPI intermediário ajudaria — é um patamar em que esse tipo de bloco de
# TOC quebra de um jeito pior. Trocar um defeito cosmético e não-ambíguo
# ("71 Etapas" ainda é legível) por um defeito estrutural (número sumido,
# texto órfão) não é uma melhoria líquida, e ainda custava ~1,4-1,6x mais
# tempo de CPU numa máquina cuja limitação central é justamente essa.
# Ver ARCHITECTURE.md para a tabela comparativa completa (200 vs 250 vs
# 300) que embasou a reversão. Mantido em 200 — não reabrir sem essa
# evidência em mãos.
RENDER_DPI = 200


def check_dependencies() -> None:
    faltando = []
    for binario in REQUIRED_BINARIES:
        if shutil.which(binario) is not None:
            continue
        caminho_fallback = CAMINHOS_ABSOLUTOS_FALLBACK.get(binario)
        if caminho_fallback and Path(caminho_fallback).is_file():
            # Achado no caminho conhecido mas não no PATH herdado do
            # processo: adiciona o diretório ao PATH deste processo para
            # que as chamadas seguintes (pytesseract, subprocess do
            # ebook-convert) também consigam encontrá-lo, não só esta
            # checagem.
            diretorio = str(Path(caminho_fallback).parent)
            if diretorio not in os.environ.get("PATH", "").split(os.pathsep):
                os.environ["PATH"] = diretorio + os.pathsep + os.environ.get("PATH", "")
            continue
        faltando.append(binario)
    if faltando:
        print(
            "Erro: ferramentas ausentes no PATH: "
            f"{', '.join(faltando)}.\n"
            "Veja as instruções de instalação sem Homebrew no topo deste arquivo.",
            file=sys.stderr,
        )
        sys.exit(1)


HTML_HEADER = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>{titulo}</title>
<style>
  body {{ font-family: serif; line-height: 1.4; }}
  section.pagina {{
      page-break-before: always;
      -webkit-column-break-before: always;
  }}
  section.pagina:first-of-type {{ page-break-before: avoid; }}
  p {{ text-indent: 1.2em; margin: 0 0 0.4em 0; }}
  h2 {{ font-size: 1.4em; margin: 1em 0 0.6em 0; text-indent: 0; }}
</style>
</head>
<body>
"""
HTML_FOOTER = "</body>\n</html>\n"


# Ruído decorativo (bullets/travessões/aspas soltas que o Tesseract lê como
# caractere de texto) no início de uma linha. Frases reais em português
# praticamente nunca começam com esses caracteres, então basta descartar
# uma sequência curta (1-3) deles no início — sem exigir maiúscula em
# seguida, já que o número de item que segue o marcador (ex.: "* 41 Que
# critérios...") ou a continuação em minúscula (ex.: "- possibilita
# melhor...") fariam esse tipo de checagem falhar.
_RE_RUIDO_INICIAL = re.compile(r'^[\*—\-;"\'“”\s]{1,3}')

# Contagem mínima (número absoluto de páginas, NÃO fração do livro) para
# considerar uma linha inicial repetida um cabeçalho de seção.
#
# Passou por DUAS calibrações, ambas com dados reais:
#
# 1ª: 0.30 (30% das páginas) — piloto pensando em UM cabeçalho repetido no
# livro todo. Testado e descartado em samples/001-080.pdf (80 páginas, ~6
# capítulos nesse recorte): nenhum cabeçalho, mesmo corretamente agrupado,
# chegava perto de 30%. Baixado para uma FRAÇÃO menor, 0.06 (mínimo
# max(2, round(total*0.06))), que funcionou nesse recorte de 80 páginas
# (capturou os 6 cabeçalhos reais, contagens 5-18, sem falso positivo).
#
# 2ª: a fração de 0.06 foi testada contra o livro completo (208 páginas,
# ~20 capítulos reais — "Como Elaborar Projetos de Pesquisa", teste de
# carga) e FALHOU: com mínimo=12 (6% de 208), só 2 dos 24 cabeçalhos reais
# do livro cruzaram a barra — os outros 22 (contagens 3-9, cobrindo ~115
# das 195 páginas com texto, quase 59% do livro) ficaram com o cabeçalho
# ainda colado ao primeiro parágrafo. O problema é estrutural: uma FRAÇÃO
# fixa do livro pressupõe um número mais ou menos fixo de páginas por
# capítulo — quanto mais capítulos o livro tem, menor a fatia de páginas
# de cada um, e a fração nunca foi pensada para escalar com o número de
# capítulos.
#
# Correção: contagem MÍNIMA ABSOLUTA, não fração. Nos dois livros
# testados (80 e 208 páginas), todo cluster que era genuinamente um
# cabeçalho (confirmado pelo conteúdo — sempre "Como <verbo>...
# pesquisa/estudo/projeto...?") tinha contagem >= 3; todo cluster que não
# era cabeçalho (linha de conteúdo isolada, uma única ocorrência de
# dedicatória, etc.) tinha contagem <= 2 — nos dois livros, sem exceção.
# 3 é portanto um valor sustentado por evidência real em duas escalas
# bem diferentes (66MB/80pg e 169MB/208pg), não um número escolhido a
# priori. Um piso proporcional pequeno (1%) é somado por precaução para
# livros muito maiores que os testados (ex.: 2000 páginas), onde 3
# ocorrências por coincidência ficam estatisticamente mais prováveis —
# mas isso é extrapolação, não validado por teste real acima de 208
# páginas.
LIMIAR_CABECALHO_MINIMO = 3
LIMIAR_CABECALHO_FRACAO_EXTRA = 0.01

# Similaridade mínima (coeficiente de sobreposição de palavras de conteúdo)
# para agrupar duas variantes de OCR do mesmo cabeçalho num só cluster.
#
# Testado primeiro com difflib.SequenceMatcher.ratio() sobre a string
# normalizada inteira, como planejado originalmente — e descartado após
# validação com dados reais de samples/001-080.pdf (ver ARCHITECTURE.md):
# comparação por caractere não separa cabeçalhos realmente distintos, já
# que todos seguem o mesmo molde "Como <verbo> ...pesquisa...?". Ex. real:
# "como classificar as pesquisas" vs. "como encaminhar uma pesquisa"
# (cabeçalhos DIFERENTES) deu ratio=0.737, mais alto que "como encaminhar"
# vs. "como encaminhar uma pesquisa" (MESMO cabeçalho, truncado pelo OCR),
# que deu ratio=0.698 — nenhum limiar único separa os dois casos.
# A sobreposição por palavras de conteúdo (stopwords removidas) separa bem:
# os mesmos pares deram 0.0 (cabeçalhos diferentes) e 1.0 (mesmo cabeçalho).
LIMIAR_SIMILARIDADE = 0.70

_RE_NORMALIZA = re.compile(r'[^\w\sÀ-ÿ]')

# Palavras funcionais muito comuns nesses cabeçalhos ("Como classificar as
# pesquisas?", "Como encaminhar uma pesquisa?") que não ajudam a distinguir
# um cabeçalho do outro — removidas antes de comparar similaridade.
_STOPWORDS_CABECALHO = frozenset({
    "como", "a", "as", "o", "os", "um", "uma", "de", "e", "que",
    "do", "da", "dos", "das", "em", "para",
})


def palavras_conteudo(normalizada: str) -> frozenset[str]:
    """Palavras de conteúdo de uma linha normalizada: sem stopwords e sem
    tokens puramente numéricos. Números descartados de propósito — em
    samples/001-080.pdf, o OCR às vezes gruda o número da página ao final
    da linha de cabeçalho (ex.: "como classificar as pesquisas 4"); um
    token assim virando parte da "identidade" do cabeçalho degradava a
    comparação com outras variantes legítimas que não tiveram esse
    vazamento — números não distinguem um cabeçalho do outro mesmo."""
    return frozenset(
        w for w in normalizada.split()
        if w not in _STOPWORDS_CABECALHO and not w.isdigit()
    )


def similaridade_cabecalho(a: frozenset[str], b: frozenset[str]) -> float:
    """Coeficiente de sobreposição (contenção): 1.0 quando o menor
    conjunto de palavras está inteiramente contido no maior — cobre bem o
    caso de OCR truncar um cabeçalho longo em uma variante mais curta."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def limpar_linha(linha: str) -> str:
    """Remove ruído decorativo do início de uma linha crua de OCR. Deve
    rodar ANTES de html.escape(): aspas retas (") são escapadas para
    &quot;, o que quebraria o casamento da regex se rodasse depois."""
    return _RE_RUIDO_INICIAL.sub('', linha)


def normalizar_linha(linha: str) -> str:
    """Reduz uma linha a minúsculas sem pontuação/espaços redundantes,
    para deduplicar grafias de OCR do mesmo cabeçalho antes de comparar."""
    return re.sub(r'\s+', ' ', _RE_NORMALIZA.sub('', linha.lower())).strip()


# Razão mínima entre a altura/tamanho de uma linha candidata a título de
# capítulo e a mediana de altura/tamanho de todas as linhas da página.
#
# Calibrado com 7 páginas reais (5 de início de capítulo limpas + 2 com
# defeitos reais de layout achados durante a implementação — ver
# ARCHITECTURE.md para a tabela completa e o histórico). Valor original,
# 1.8, vinha de: pior caso real de título = razão 2,3x; pior caso real de
# "não-título" (subtítulo de subseção) = 1,4x. Só que uma página real
# (samples/081-160.pdf, capítulo "pesquisa narrativa") tinha um elemento
# decorativo (provável ornamento de divisória de parte do livro) com
# razão 1,90 — ACIMA de 1,8 — que foi escolhido como "título" no lugar do
# título de verdade, 2 linhas abaixo. Subido para 2.0: ainda bem abaixo do
# pior caso real de título (2,3x) e do elemento decorativo real mais alto
# que não deveria contar (5,8x, mas esse falha no filtro de comprimento —
# ver LIMIAR_TITULO_MIN_CHARS), e agora exclui o ornamento (1,90 < 2,0)
# sem tocar em nenhum título real conhecido. RISCO RESIDUAL: calibrado
# numa amostra pequena — ver ARCHITECTURE.md.
LIMIAR_RAZAO_TITULO = 2.0

# Comprimento mínimo de texto para uma linha candidata contar como título.
# Sem isso, um número de capítulo decorativo muito grande (achado real:
# "21" com altura 176px, maior que o próprio título) seria escolhido no
# lugar do título de verdade. Todos os fragmentos de título reais
# observados tinham >= 10 caracteres; 6 dá folga sem abrir margem para
# números/símbolos curtos.
LIMIAR_TITULO_MIN_CHARS = 6

# Só procura título nas primeiras N linhas não vazias da página.
#
# Testado com 5 e corrigido para 7 após achar um caso real que estourava
# a janela: samples/081-160.pdf, capítulo "teoria fundamentada", tem um
# número de capítulo decorativo (1 linha) seguido de um título de 5
# linhas ("COMO DELINEAR UMA" / "PESQUISA PARA" / "CONSTRUIR TEORIA" /
# "FUNDAMENTADA" / "(GROUNDED THEORY)?", todas com razão 2,2-2,5x — bem
# acima do limiar) — 6 linhas ao todo, além do que a janela de 5
# conseguia cobrir. Resultado: a última linha do título ("(GROUNDED
# THEORY)?") ficava de fora, virando o primeiro parágrafo do corpo em vez
# de parte do <h2>. 7 dá folga para 1 linha decorativa + título de até 6
# linhas. Alargar a janela não tem custo de falso-positivo observado: o
# critério de força (altura) continua sendo o que decide o que entra,
# não só a posição — linhas de corpo normal dentro da janela maior não
# cruzam o limiar de qualquer forma.
JANELA_TITULO_LINHAS = 7

# Tolerância de linhas "fracas" (não cruzam LIMIAR_RAZAO_TITULO) permitida
# NO MEIO de um título de várias linhas antes de considerar o título
# encerrado. Achado real: em samples/161-208.pdf (capítulo "métodos
# mistos"), a linha do meio de um título de 3 linhas ("* PESQUISAS DE")
# teve razão 1,73 — abaixo do limiar — provavelmente ruído da própria
# medição de altura do OCR nessa linha específica, não um sinal de que
# ali acaba o título (as duas linhas ao redor, razão 2,36 e 2,41, deixam
# claro que é a mesma frase). Tolerar 1 linha fraca no meio resolve sem
# introduzir um segundo limiar numérico "macio" — a linha fraca só entra
# se houver uma linha forte de novo logo depois, nunca no final.
TOLERANCIA_LINHA_FRACA_TITULO = 1

# Recuo de linha (Tarefa B): uma linha OCRizada é tratada como INÍCIO de
# parágrafo (recebe recuo, novo <p>) quando sua posição X (`left` do
# image_to_data) excede a mediana de `left` de todas as linhas da PÁGINA
# em mais que este delta, em pixels — não um valor absoluto fixo, porque
# a margem absoluta varia entre livros/páginas (rotação/skew do scan).
# Mediana da página (não um valor global do livro) para caber na
# arquitetura de streaming (uma página em memória por vez).
#
# Calibrado com dados reais de 3 páginas (60, 200, 400) do livro de 903
# páginas (PEREIRA) mais 1 página (30) de samples/001-080.pdf, e uma
# estatística agregada de 1.379 linhas (40 páginas, mesmo livro de 903):
# a distribuição de `left` é claramente bimodal — margem de continuação
# concentrada ~40-43px (skew mínimo) a ~44-64px (samples/001-080.pdf,
# página com leve rotação de scan), início de parágrafo concentrado
# ~90-116px. No agregado de 1.379 linhas, o "vale" entre os dois
# aglomerados fica nos buckets de 70-80px (2 linhas, praticamente vazio)
# — ou seja, delta~35 (relativo à mediana ~40) cai bem no meio do vale,
# com folga de ~15-20px para qualquer lado antes de tocar um dos dois
# aglomerados reais. RISCO RESIDUAL: calibrado só neste livro de 903
# páginas (fonte real do defeito relatado) mais uma página avulsa de
# outro livro — não os 2 livros de calibração completos das Fases 2-3.
# Ver ARCHITECTURE.md para a tabela completa e o script de pesquisa
# (`scripts/pesquisa_recuo_estatistica.py`).
#
# CORREÇÃO REAL DURANTE A VALIDAÇÃO (não escondida — ver ARCHITECTURE.md,
# Fase 4.4): os números acima vieram de renderizar+OCRizar essas páginas
# via um script de pesquisa isolado, sem checar antes se o PDF de origem
# (PEREIRA, 903 páginas) tinha texto nativo. Ele tem — `foliant.py` já
# usa `pagina.get_text("text")` direto pra esse livro, sem OCR nenhum, o
# que significa que corrigir só o caminho OCR (como a primeira versão
# desta correção fez) não resolvia o defeito relatado NESSE livro
# específico, embora o critério em si continue válido e testado para
# livros genuinamente escaneados. Ver LIMIAR_RECUO_DELTA_PONTOS_NATIVO
# abaixo para o critério equivalente do caminho nativo, calibrado com o
# livro que de fato revelou o bug.
LIMIAR_RECUO_DELTA_PX = 35

# Sinal de gap vertical entre linhas (coordenada Y) TESTADO E DESCARTADO
# como critério: mediana do gap para linhas de continuação (left<=60) foi
# 23.3px vs. 28.1px para linhas de possível início de parágrafo — uma
# diferença pequena demais, com distribuições fortemente sobrepostas
# (min/max de -543.9 a 535.0 num dos dois grupos, incluindo artefatos de
# layout de página como quebras de coluna/rodapé) — não seria um sinal
# confiável mesmo combinado com o recuo. Não implementado.
#
# Sinal de pontuação final (frase anterior termina em . ? !) considerado
# e também NÃO implementado como critério adicional: nas páginas reais
# inspecionadas, todo início de parágrafo real já tinha o recuo físico
# presente (mesmo o primeiro parágrafo após um subtítulo) — nenhum caso
# real encontrado em que o recuo sozinho desse falso negativo. Adicionar
# um segundo sinal sem um caso real que o justifique seria complexidade
# não comprovada — revisitar se um contra-exemplo real aparecer.

# Equivalente a LIMIAR_RECUO_DELTA_PX, mas para o caminho de texto NATIVO
# — unidade diferente (pontos PDF, não pixels de render a 200 DPI), por
# isso um valor separado, não o mesmo número reaproveitado.
#
# Calibrado com dados reais do livro PEREIRA (903 páginas, texto nativo
# real — ver correção acima), 3 páginas (60, 200, 400), via
# `pagina.get_text("dict")["blocks"][...]["lines"][...]["bbox"]`. Texto
# nativo é MUITO mais limpo que OCR — sem ruído de scan/skew: margem de
# continuação ficou em x0=15.0pt EXATO em toda linha de continuação
# observada (nenhuma variação), início de parágrafo em x0=37.5pt EXATO
# (delta=22.5pt, também sem variação). 10pt cai com folga entre os dois
# valores exatos observados (0 e 22.5) — não precisa de mais margem
# porque não há ruído de medição a considerar (coordenadas de PDF nativo
# são exatas, diferente de bounding box de OCR).
LIMIAR_RECUO_DELTA_PONTOS_NATIVO = 10

# Override de tamanho de fonte para o caminho nativo (ver
# `linhas_inicio_paragrafo`): subtítulos de seção no mesmo livro real
# (ex. "▸3.11 Revisões externas") têm recuo MENOR que um parágrafo comum
# (x0=19.5-24.75pt, delta de só 4.5-9.75pt da margem — abaixo do limiar
# de recuo acima) mas fonte 1.3-1.5x maior que a mediana da página
# (19.5-22.5pt contra corpo de 15pt) — sem este segundo sinal, esses
# subtítulos seriam classificados como CONTINUAÇÃO pelo recuo sozinho e
# ficariam colados ao parágrafo anterior. 1.3 fica abaixo da menor razão
# real observada (1.3) com zero folga do lado de baixo — ok porque o
# corpo de texto nesse livro nunca varia de tamanho por razões
# tipográficas normais (toda linha de corpo observada tinha razão entre
# 0.78 e 1.0 da mediana, nunca subindo). RISCO RESIDUAL: só 3 páginas de
# um livro para calibrar isto — ver ARCHITECTURE.md.
LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO = 1.3


def detectar_titulo(linhas: list[tuple[str, float]]) -> tuple[str | None, int]:
    """Recebe linhas (texto, tamanho) em ordem de leitura (tamanho = altura
    de bounding box no OCR, ou tamanho de fonte em PDF nativo — mesma
    lógica serve para os dois). Retorna (título detectado ou None, número
    de linhas do INÍCIO da página — incluindo qualquer linha decorativa
    pulada antes do título — que devem ser removidas do fluxo de
    parágrafos; não é só a contagem de linhas do título em si, ver bug
    real corrigido abaixo).

    Usa a mediana de TODAS as linhas da página como referência de
    "tamanho normal" (robusta a 1-2 linhas de título grande no meio do
    cálculo, já que mediana resiste a poucos outliers).

    Acha todas as linhas "fortes" (acima do limiar) na janela de busca,
    agrupa índices próximos num só "trecho" (tolerando
    TOLERANCIA_LINHA_FRACA_TITULO linhas fracas no meio — títulos reais
    vêm quebrados em 2-3 linhas pelo OCR, às vezes com ruído de medição
    numa linha do meio), e usa o ÚLTIMO trecho da janela como título — não
    o primeiro. Motivo: achado real em samples/081-160.pdf onde um
    elemento decorativo antes do título verdadeiro também cruzava o
    limiar antigo; pegar o último trecho (o mais próximo de onde o corpo
    do texto começa) favorece o título de verdade sobre ornamentos
    anteriores a ele.

    BUG REAL CORRIGIDO: a versão anterior retornava só a CONTAGEM de
    linhas do título (ex. 2), não a posição em que ele termina. Numa
    página onde o título começa depois de uma linha decorativa pulada
    (ex. "21" antes de "Como redigir o projeto de pesquisa?"), isso fazia
    `linhas[n:]` cortar no lugar errado e deixar um fragmento do próprio
    título duplicado como parágrafo comum logo abaixo do <h2> — visto de
    verdade no HTML gerado antes desta correção."""
    if not linhas:
        return None, 0

    mediana = statistics.median(tamanho for _, tamanho in linhas)
    if mediana <= 0:
        return None, 0

    janela = linhas[:JANELA_TITULO_LINHAS]
    fortes = [
        i for i, (texto, tamanho) in enumerate(janela)
        if tamanho >= mediana * LIMIAR_RAZAO_TITULO and len(texto.strip()) >= LIMIAR_TITULO_MIN_CHARS
    ]
    if not fortes:
        return None, 0

    trechos: list[tuple[int, int]] = []
    inicio = fim = fortes[0]
    for i in fortes[1:]:
        if i - fim <= TOLERANCIA_LINHA_FRACA_TITULO + 1:
            fim = i
        else:
            trechos.append((inicio, fim))
            inicio = fim = i
    trechos.append((inicio, fim))

    inicio, fim = trechos[-1]
    candidatos = [limpar_linha(janela[i][0]).strip() for i in range(inicio, fim + 1)]
    candidatos = [c for c in candidatos if c]
    if not candidatos:
        return None, 0
    return " ".join(candidatos), fim + 1


def extrair_linhas_nativas(pagina: "pymupdf.Page") -> list[tuple[str, float, float]]:
    """Fonte (a) — PDF com texto nativo: uma linha por (texto, tamanho de
    fonte médio dos spans da linha, posição X do início do bbox da
    linha), via get_text("dict"). O `left` alimenta
    `linhas_inicio_paragrafo()` (Tarefa B, recuo de linha) — ver
    LIMIAR_RECUO_DELTA_PONTOS_NATIVO.

    Validado com um livro nativo real (PEREIRA, "Artigos Científicos...",
    903 páginas — ver ARCHITECTURE.md, Fase 4.4) depois que esse livro
    revelou o defeito de recuo de linha original: ao contrário do que o
    comentário antigo desta função dizia, ESTE projeto passou a ter um
    PDF de texto nativo real assim que esse livro entrou como caso de
    teste — a suposição anterior ("nenhum livro nativo existe") nunca
    tinha sido reconferida antes de decidir o escopo da correção, o que
    levou a corrigir só o caminho OCR numa primeira tentativa (documentado
    como erro real e corrigido em ARCHITECTURE.md, não escondido).
    LIMIAR_RAZAO_TITULO (chamador `detectar_titulo`) reusa o mesmo valor
    calibrado pela fonte (b) por analogia — não recalibrado
    especificamente para texto nativo, risco residual menor (título de
    capítulo tem razão de tamanho tipicamente bem acima de qualquer
    limiar razoável; ver LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO abaixo para um
    limiar À PARTE, mais baixo, calibrado para subtítulos de seção)."""
    linhas = []
    d = pagina.get_text("dict")
    for bloco in d["blocks"]:
        if "lines" not in bloco:
            continue
        for linha in bloco["lines"]:
            texto = "".join(span["text"] for span in linha["spans"])
            if not texto.strip():
                continue
            tamanhos_spans = [span["size"] for span in linha["spans"]]
            linhas.append((
                texto,
                sum(tamanhos_spans) / len(tamanhos_spans),
                linha["bbox"][0],  # x0 do bbox da linha
            ))
    return linhas


def extrair_linhas_ocr(dados: dict) -> list[tuple[str, float, int]]:
    """Fonte (b) — página escaneada: uma linha por (texto, altura média das
    palavras da linha, posição X da primeira palavra), reconstruída a
    partir de pytesseract.image_to_data(). A posição X (`left`) alimenta
    `linhas_inicio_paragrafo()` (Tarefa B, recuo de linha) — ver
    LIMIAR_RECUO_DELTA_PX.

    Agrupa por (block_num, par_num, line_num) e ordena por essa MESMA
    chave — a ordem de leitura que o próprio Tesseract atribuiu
    internamente (a que image_to_string() usa). Ordenar por posição em
    pixels em vez disso foi testado e descartado: quebra a ordem de pelo
    menos 1 página real (o cabeçalho de seção aparecia por último no
    image_to_string(), mas primeiro se ordenado por pixel) — ver
    ARCHITECTURE.md. Validado linha a linha idêntico ao image_to_string()
    em 3 páginas reais com essa correção."""
    agrupado: dict[tuple[int, int, int], dict] = {}
    n = len(dados["text"])
    for i in range(n):
        texto_palavra = dados["text"][i]
        if not texto_palavra.strip():
            continue
        chave = (dados["block_num"][i], dados["par_num"][i], dados["line_num"][i])
        info = agrupado.setdefault(chave, {"palavras": [], "alturas": [], "lefts": []})
        info["palavras"].append(texto_palavra)
        info["alturas"].append(dados["height"][i])
        info["lefts"].append(dados["left"][i])

    linhas = []
    for chave in sorted(agrupado):
        info = agrupado[chave]
        linhas.append((
            " ".join(info["palavras"]),
            sum(info["alturas"]) / len(info["alturas"]),
            info["lefts"][0],  # left da primeira palavra da linha
        ))
    return linhas


def linhas_inicio_paragrafo(
    linhas: list[tuple[str, float, float]],
    limiar_delta: float,
    limiar_razao_tamanho: float | None = None,
) -> list[bool]:
    """Para cada linha da página (texto, tamanho, left — na ordem de
    leitura), decide se ela é o INÍCIO de um novo parágrafo (True, recebe
    recuo) ou continuação da linha anterior (False, deve ser unida a
    ela). Serve tanto o caminho OCR (`LIMIAR_RECUO_DELTA_PX`, em pixels
    de render a 200 DPI) quanto o nativo
    (`LIMIAR_RECUO_DELTA_PONTOS_NATIVO`, em pontos PDF — unidades
    diferentes, por isso o limiar é parâmetro, não constante fixa aqui
    dentro) — ver ARCHITECTURE.md, Fase 4.4, para a evidência real de
    cada um.

    Critério primário: posição X (`left`) da linha excede a mediana de
    `left` de TODAS as linhas da página em mais que `limiar_delta`. A
    mediana é recalculada por página (não por livro) para caber na
    arquitetura de streaming — cada página já é processada isoladamente,
    uma de cada vez.

    Override 1 (mais forte, os dois caminhos): se a linha ANTERIOR
    termina em hífen (quebra de palavra), a linha atual é SEMPRE
    continuação, independente da posição X.

    Override 2 (`limiar_razao_tamanho`, só passado no caminho nativo —
    ver `extrair_texto_pagina`): subtítulos de seção no livro nativo real
    usado para calibrar isto (PEREIRA, 903 páginas) têm um recuo MENOR
    que o de um parágrafo comum (~4,5-9,75pt contra ~22,5pt de um
    parágrafo real, ambos relativos à margem) mas fonte claramente maior
    (razão 1,3-1,5x a mediana da página, contra ~1,0x do corpo) — sem
    esse segundo sinal, um subtítulo seria classificado como CONTINUAÇÃO
    pelo recuo sozinho e ficaria colado ao parágrafo anterior. Quando
    `limiar_razao_tamanho` é dado e o tamanho da linha atual cruza esse
    limiar, força início de parágrafo, ignorando o recuo.

    A primeira linha da página não tem uma anterior para comparar —
    marcada True (início) por padrão; `construir_html()` sobrescreve isso
    de qualquer forma para a primeira linha que sobra após remover
    título/cabeçalho de página (ver comentário lá)."""
    if not linhas:
        return []

    lefts = [left for _, _, left in linhas]
    mediana_left = statistics.median(lefts)
    mediana_tamanho = (
        statistics.median(tamanho for _, tamanho, _ in linhas)
        if limiar_razao_tamanho is not None
        else None
    )

    resultado = [True]
    for idx in range(1, len(linhas)):
        texto_anterior, _, _ = linhas[idx - 1]
        _, tamanho_atual, left_atual = linhas[idx]
        if texto_anterior.rstrip().endswith("-"):
            resultado.append(False)
        elif (
            mediana_tamanho is not None
            and mediana_tamanho > 0
            and tamanho_atual >= mediana_tamanho * limiar_razao_tamanho
        ):
            resultado.append(True)
        else:
            resultado.append((left_atual - mediana_left) > limiar_delta)
    return resultado


def extrair_texto_pagina(
    doc: "pymupdf.Document", i: int, matriz_zoom: "pymupdf.Matrix", lang: str
) -> tuple[str, str | None, int, list[bool]]:
    """Extrai o texto de uma página e detecta o título de capítulo (se
    houver): usa a camada de texto nativa se existir, senão renderiza e
    faz OCR. Libera pixmap/imagem antes de retornar — nunca acumula mais
    de uma página em memória.

    Uma única chamada de OCR por página: image_to_data() no lugar de
    image_to_string(), reconstruindo o texto a partir das mesmas linhas
    usadas para detectar o título — rodar as duas seria dobrar o tempo de
    Tesseract na CPU fraca. Ver ARCHITECTURE.md para a validação de
    equivalência entre o texto reconstruído e o image_to_string() antigo.

    Retorna (texto, título detectado ou None, nº de linhas consumidas
    pelo título, lista de "linha é início de parágrafo" alinhada 1:1 com
    texto.splitlines()).

    Recuo de linha (Tarefa B) se aplica aos DOIS caminhos, com critérios
    calibrados separadamente (unidades diferentes — pixels de render no
    OCR, pontos PDF no nativo; ver LIMIAR_RECUO_DELTA_PX e
    LIMIAR_RECUO_DELTA_PONTOS_NATIVO). No caminho nativo, `texto` é
    reconstruído a partir das mesmas linhas usadas para a classificação
    (`"\\n".join(...)`), não mais de `pagina.get_text("text")` direto —
    confirmado byte-idêntico entre as duas formas em 5 páginas reais
    (incluindo página vazia e última página do livro) antes de trocar,
    ver ARCHITECTURE.md. A troca é necessária para garantir alinhamento
    1:1 entre `texto.splitlines()` e `inicio_paragrafo`."""
    pagina = doc.load_page(i)
    texto_nativo = pagina.get_text("text").strip()

    if texto_nativo:
        linhas_nativas = extrair_linhas_nativas(pagina)
        texto = "\n".join(texto_linha for texto_linha, _, _ in linhas_nativas)
        inicio_paragrafo = linhas_inicio_paragrafo(
            linhas_nativas,
            limiar_delta=LIMIAR_RECUO_DELTA_PONTOS_NATIVO,
            limiar_razao_tamanho=LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO,
        )
        titulo, n_linhas_titulo = detectar_titulo([(t, a) for t, a, _ in linhas_nativas])
        return texto, titulo, n_linhas_titulo, inicio_paragrafo

    pixmap = pagina.get_pixmap(matrix=matriz_zoom)
    img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    dados = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    img.close()
    linhas_ocr = extrair_linhas_ocr(dados)
    texto = "\n".join(texto_linha for texto_linha, _, _ in linhas_ocr)
    inicio_paragrafo = linhas_inicio_paragrafo(linhas_ocr, limiar_delta=LIMIAR_RECUO_DELTA_PX)

    titulo, n_linhas_titulo = detectar_titulo([(t, a) for t, a, _ in linhas_ocr])
    return texto, titulo, n_linhas_titulo, inicio_paragrafo


def agrupar_cabecalhos(contador: Counter, total_paginas: int) -> set[str]:
    """Agrupa as strings normalizadas únicas por similaridade de palavras
    de conteúdo, somando as contagens de cada cluster, e retorna o
    conjunto de strings normalizadas que pertencem a clusters frequentes o
    bastante para serem cabeçalho de seção repetido. Roda a comparação só
    sobre o conjunto reduzido de normalizações únicas — não sobre todas as
    linhas de todas as páginas.

    Compara contra o membro mais "completo" do cluster (o de mais palavras
    de conteúdo), não contra todos os membros nem contra um arbitrário.
    Testado e corrigido após achar um bug real em samples/001-080.pdf:
    comparar contra QUALQUER membro (complete-link) permite "encadeamento"
    via uma variante de OCR truncada a uma única palavra de conteúdo — ex.
    "como delinear uma" (só sobra "delinear" após remover stopwords) bate
    100% de sobreposição com qualquer cabeçalho que contenha "delinear",
    inclusive um cabeçalho DIFERENTE ("Como delinear uma pesquisa
    documental?" grudou em "...bibliográfica?" por esse caminho). Usar só
    o membro mais completo como âncora evita que um fragmento fraco vire
    ponte entre dois cabeçalhos genuinamente diferentes, e ainda deixa
    variantes truncadas legítimas entrarem (elas batem alto contra a forma
    completa do próprio cabeçalho)."""
    clusters: list[dict] = []  # cada item: {"membros": set(...), "canonico": frozenset, "contagem": int}

    for normalizada, contagem in contador.items():
        palavras = palavras_conteudo(normalizada)
        cluster_encontrado = None
        for cluster in clusters:
            if similaridade_cabecalho(palavras, cluster["canonico"]) > LIMIAR_SIMILARIDADE:
                cluster_encontrado = cluster
                break
        if cluster_encontrado is None:
            clusters.append({"membros": {normalizada}, "canonico": palavras, "contagem": contagem})
        else:
            cluster_encontrado["membros"].add(normalizada)
            cluster_encontrado["contagem"] += contagem
            if len(palavras) > len(cluster_encontrado["canonico"]):
                cluster_encontrado["canonico"] = palavras

    minimo = max(LIMIAR_CABECALHO_MINIMO, round(total_paginas * LIMIAR_CABECALHO_FRACAO_EXTRA))
    cabecalhos: set[str] = set()
    print(f"    análise de cabeçalhos (mínimo {minimo}/{total_paginas} páginas para considerar repetido):")
    for cluster in sorted(clusters, key=lambda c: -c["contagem"]):
        marca = "CABEÇALHO" if cluster["contagem"] >= minimo else "—"
        print(f"      [{marca}] contagem={cluster['contagem']} membros={sorted(cluster['membros'])}")
        if cluster["contagem"] >= minimo:
            cabecalhos.update(cluster["membros"])

    return cabecalhos


# Tolerância de proporção (largura/altura) entre a primeira página do PDF
# e uma imagem embutida nela para aceitá-la como capa real — ver
# `extrair_capa`. Livro escaneado real (samples/livro_completo_208pg.pdf):
# página 578.16x824.40pt (proporção 0.7016) contra imagem embutida
# 2409x3437px (proporção 0.7008) — diferença de 0.1%, bem abaixo de
# qualquer folga necessária. 15% dá margem para variação de crop/margem
# de scanner sem abrir espaço para aceitar uma imagem pequena/decorativa
# (ex.: um brasão ou selo no canto de uma página de texto nativo) como se
# fosse a capa inteira.
TOLERANCIA_PROPORCAO_CAPA = 0.15


def extrair_capa(doc: "pymupdf.Document", destino_dir: Path) -> Path | None:
    """Extrai a capa real do livro a partir da 1ª página do PDF, sem
    re-renderizar nada: livro escaneado real tem a página inteira já
    embutida como 1 imagem JPEG só (ver ARCHITECTURE.md — este PDF não
    tem NENHUMA imagem em sub-região, get_images() sempre devolve a
    página inteira). Extração direta do binário via
    `doc.extract_image(xref)`.

    Só aceita a imagem se a proporção largura/altura dela bater com a
    da página (ver TOLERANCIA_PROPORCAO_CAPA) — evita usar uma imagem
    pequena/decorativa de uma primeira página de texto nativo como capa.
    Retorna None se não houver imagem compatível: `convert_to_ebook` não
    passa `--cover` e o Calibre volta ao comportamento antigo (capa
    genérica gerada automaticamente), sem regressão.

    RISCO RESIDUAL: só testado em 1 livro real, 100% escaneado (todas as
    páginas são imagem inteira). Não testado em livro de texto nativo
    com imagem de capa real embutida como imagem parcial da página — se
    existir um livro assim, o critério de proporção pode rejeitar
    corretamente (imagem parcial não bate com a proporção da página
    inteira) mas isso significa NENHUMA capa extraída nesse caso, não um
    falso positivo — comportamento seguro por padrão."""
    pagina = doc.load_page(0)
    rect = pagina.rect
    if rect.width <= 0 or rect.height <= 0:
        return None
    proporcao_pagina = rect.width / rect.height

    for img in pagina.get_images(full=True):
        xref = img[0]
        base = doc.extract_image(xref)
        largura, altura = base["width"], base["height"]
        if altura <= 0:
            continue
        proporcao_imagem = largura / altura
        if abs(proporcao_imagem - proporcao_pagina) / proporcao_pagina > TOLERANCIA_PROPORCAO_CAPA:
            continue
        capa_path = destino_dir / f"capa.{base['ext']}"
        capa_path.write_bytes(base["image"])
        return capa_path
    return None


def primeira_passada(pdf_path: Path, cache_path: Path, lang: str) -> tuple[set[str], Path | None]:
    """Passo 1/2: percorre o PDF uma única vez (render+OCR por página),
    grava o texto bruto de cada página em cache_path (uma linha JSON por
    página — streaming, nunca acumula texto de todas as páginas em RAM),
    identifica as linhas iniciais repetidas (cabeçalho de seção) e detecta
    o título de capítulo de cada página, se houver. Também tenta extrair
    a capa real da 1ª página (ver `extrair_capa`) — retorna
    (cabeçalhos, caminho da capa extraída ou None).

    O título detectado de uma página CONTINUA contando na análise de
    frequência de cabeçalho abaixo (não é excluído do texto usado para
    isso) — decisão de design registrada em ARCHITECTURE.md: removê-lo da
    contagem derrubaria clusters cuja contagem real é exatamente o mínimo
    (3, ver LIMIAR_CABECALHO_MINIMO) para 2, reabrindo a regressão do
    limiar de cabeçalho já corrigida na Fase 2."""
    print("Passo 1/2: OCR por página + análise de cabeçalhos e títulos...")

    doc = pymupdf.open(pdf_path)
    total = doc.page_count
    matriz_zoom = pymupdf.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
    contador: Counter = Counter()

    capa_path = extrair_capa(doc, cache_path.parent)

    with cache_path.open("w", encoding="utf-8") as cache:
        for i in range(total):
            texto, titulo, n_linhas_titulo, inicio_paragrafo = extrair_texto_pagina(doc, i, matriz_zoom, lang)
            registro = {
                "texto": texto,
                "titulo": titulo,
                "n_linhas_titulo": n_linhas_titulo,
                "inicio_paragrafo": inicio_paragrafo,
            }
            cache.write(json.dumps(registro) + "\n")

            for linha in texto.splitlines():
                linha = linha.strip()
                if linha:
                    contador[normalizar_linha(linha)] += 1
                    break

            if (i + 1) % 20 == 0 or (i + 1) == total:
                print(f"    página {i+1}/{total} processada")

    doc.close()

    return agrupar_cabecalhos(contador, total), capa_path


def unir_linhas_em_paragrafos(linhas: list[str], inicio_paragrafo: list[bool]) -> list[str]:
    """Uma linha crua (OCR ou texto nativo) por linha física da página
    produz um <p> por linha — mesmo quando é continuação da frase
    anterior, causando o "zigue-zague" visual do text-indent aplicado a
    toda linha (Tarefa B). Une linhas de continuação
    (`inicio_paragrafo[i] is False`) à string do parágrafo em construção;
    só linhas marcadas True iniciam um <p> novo.

    `limpar_linha()` já deve ter rodado em cada linha ANTES desta função
    (ver chamador) — não depois: achado real em samples/001-080.pdf
    (página com bloco de citação) onde um marcador decorativo ("*") se
    repete no início de CADA linha física do bloco, não só da primeira.
    Limpar essas linhas já unidas removeria só o marcador da primeira, e
    limpar cada linha crua isoladamente ANTES de unir remove o marcador
    de todas — por isso a ordem importa e a limpeza tem que ser por
    linha, antes da fusão."""
    paragrafos: list[str] = []
    for l, novo in zip(linhas, inicio_paragrafo):
        if not l:
            continue
        if novo or not paragrafos:
            paragrafos.append(l)
        elif paragrafos[-1].endswith("-"):
            paragrafos[-1] = paragrafos[-1][:-1] + l
        else:
            paragrafos[-1] = paragrafos[-1] + " " + l
    return paragrafos


def construir_html(cache_path: Path, html_path: Path, titulo: str, cabecalhos: set[str]) -> None:
    """Passo 2/2: lê o cache de texto por página (streaming, sem OCR novo)
    e escreve o HTML final, removendo o cabeçalho de seção repetido
    (quando é a primeira linha da página), promovendo o título de
    capítulo detectado (se houver) para <h2>, limpando o ruído decorativo
    de OCR e unindo linhas de continuação em parágrafos reais (Tarefa B)."""
    print("Passo 2/2: montando HTML a partir do cache...")

    with cache_path.open(encoding="utf-8") as cache, html_path.open("w", encoding="utf-8") as out:
        out.write(HTML_HEADER.format(titulo=html.escape(titulo)))

        for i, linha_cache in enumerate(cache):
            registro = json.loads(linha_cache)
            texto = registro["texto"]
            titulo_pagina = registro["titulo"]
            n_linhas_titulo = registro["n_linhas_titulo"]
            inicio_paragrafo = registro["inicio_paragrafo"]

            # mantém texto e inicio_paragrafo em lockstep ao descartar
            # linha vazia — não confiar que já vêm alinhados 1:1 sem checar.
            pares = [(l.strip(), b) for l, b in zip(texto.splitlines(), inicio_paragrafo) if l.strip()]
            linhas = [l for l, _ in pares]
            inicio_paragrafo = [b for _, b in pares]

            html_titulo = ""
            if titulo_pagina and n_linhas_titulo:
                linhas = linhas[n_linhas_titulo:]
                inicio_paragrafo = inicio_paragrafo[n_linhas_titulo:]
                html_titulo = f"<h2>{html.escape(limpar_linha(titulo_pagina))}</h2>\n"

            if linhas and normalizar_linha(linhas[0]) in cabecalhos:
                linhas = linhas[1:]
                inicio_paragrafo = inicio_paragrafo[1:]

            # a linha que sobrar no topo, depois de remover título/cabeçalho,
            # é sempre início de página — force True mesmo que o valor
            # pré-calculado (relativo à linha anterior ORIGINAL, já
            # removida) dissesse outra coisa.
            if inicio_paragrafo:
                inicio_paragrafo[0] = True

            linhas_limpas = [limpar_linha(l) for l in linhas]
            paragrafos_texto = unir_linhas_em_paragrafos(linhas_limpas, inicio_paragrafo)
            paragrafos = "".join(f"<p>{html.escape(p)}</p>\n" for p in paragrafos_texto if p.strip())

            out.write(f'<section class="pagina" id="pg-{i+1}">\n')
            out.write(html_titulo)
            if paragrafos:
                out.write(paragrafos)
            elif not html_titulo:
                out.write("<p>&#160;</p>\n")
            out.write("</section>\n")

        out.write(HTML_FOOTER)


def convert_to_ebook(html_path: Path, saida: Path, titulo: str, autor: str, capa_path: Path | None) -> None:
    print(f"Compilando e-book final ({saida.suffix}) com Calibre...")
    cmd = [
        "ebook-convert",
        str(html_path),
        str(saida),
        "--title", titulo,
        "--authors", autor,
        "--language", "por",
        # TOC/sumário a partir dos títulos de capítulo detectados (Fase 3),
        # não mais uma entrada por página — só páginas com <h2> geram
        # entrada de sumário. Quebra de página continua em toda página
        # original (fidelidade ao PDF de origem), independente de ter
        # título ou não.
        "--chapter", "//h:h2",
        "--page-breaks-before", "//h:section[@class='pagina']",
        "--input-encoding", "utf-8",
    ]
    if capa_path is not None:
        cmd += ["--cover", str(capa_path)]
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Foliant: PDF -> OCR -> HTML -> EPUB/AZW3, offline e em streaming"
    )
    parser.add_argument("pdf_entrada", type=Path)
    parser.add_argument("saida", type=Path)
    parser.add_argument("--lang", default="por")
    parser.add_argument("--titulo", default=None)
    parser.add_argument("--autor", default="Desconhecido")
    args = parser.parse_args()

    check_dependencies()
    titulo = args.titulo or args.pdf_entrada.stem

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        html_path = tmp_dir / "livro.html"
        cache_path = tmp_dir / "paginas.jsonl"

        cabecalhos, capa_path = primeira_passada(args.pdf_entrada, cache_path, lang=args.lang)
        construir_html(cache_path, html_path, titulo=titulo, cabecalhos=cabecalhos)
        convert_to_ebook(html_path, args.saida, titulo=titulo, autor=args.autor, capa_path=capa_path)

    print(f"\nConcluído: {args.saida}")


if __name__ == "__main__":
    main()

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
    faltando = [b for b in REQUIRED_BINARIES if shutil.which(b) is None]
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


def extrair_linhas_nativas(pagina: "pymupdf.Page") -> list[tuple[str, float]]:
    """Fonte (a) — PDF com texto nativo: uma linha por (texto, tamanho de
    fonte médio dos spans da linha), via get_text("dict").

    RISCO RESIDUAL: nenhum livro nativo real existe no projeto para
    calibrar isso — os 3 arquivos de teste são 100% escaneados. Reusa o
    mesmo LIMIAR_RAZAO_TITULO da fonte (b) por analogia, validado só
    mecanicamente contra um PDF sintético (samples/sinteticos/
    livro_sintetico.pdf). Ver ARCHITECTURE.md — não confiar sem
    revalidar contra um PDF nativo real de livro."""
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
            linhas.append((texto, sum(tamanhos_spans) / len(tamanhos_spans)))
    return linhas


def extrair_linhas_ocr(dados: dict) -> list[tuple[str, float]]:
    """Fonte (b) — página escaneada: uma linha por (texto, altura média das
    palavras da linha), reconstruída a partir de pytesseract.image_to_data().

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
        info = agrupado.setdefault(chave, {"palavras": [], "alturas": []})
        info["palavras"].append(texto_palavra)
        info["alturas"].append(dados["height"][i])

    linhas = []
    for chave in sorted(agrupado):
        info = agrupado[chave]
        linhas.append((" ".join(info["palavras"]), sum(info["alturas"]) / len(info["alturas"])))
    return linhas


def extrair_texto_pagina(
    doc: "pymupdf.Document", i: int, matriz_zoom: "pymupdf.Matrix", lang: str
) -> tuple[str, str | None, int]:
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
    pelo título)."""
    pagina = doc.load_page(i)
    texto_nativo = pagina.get_text("text").strip()

    if texto_nativo:
        linhas = extrair_linhas_nativas(pagina)
        texto = texto_nativo
    else:
        pixmap = pagina.get_pixmap(matrix=matriz_zoom)
        img = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        dados = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
        img.close()
        linhas = extrair_linhas_ocr(dados)
        texto = "\n".join(texto_linha for texto_linha, _ in linhas)

    titulo, n_linhas_titulo = detectar_titulo(linhas)
    return texto, titulo, n_linhas_titulo


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


def primeira_passada(pdf_path: Path, cache_path: Path, lang: str) -> set[str]:
    """Passo 1/2: percorre o PDF uma única vez (render+OCR por página),
    grava o texto bruto de cada página em cache_path (uma linha JSON por
    página — streaming, nunca acumula texto de todas as páginas em RAM),
    identifica as linhas iniciais repetidas (cabeçalho de seção) e detecta
    o título de capítulo de cada página, se houver.

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

    with cache_path.open("w", encoding="utf-8") as cache:
        for i in range(total):
            texto, titulo, n_linhas_titulo = extrair_texto_pagina(doc, i, matriz_zoom, lang)
            registro = {"texto": texto, "titulo": titulo, "n_linhas_titulo": n_linhas_titulo}
            cache.write(json.dumps(registro) + "\n")

            for linha in texto.splitlines():
                linha = linha.strip()
                if linha:
                    contador[normalizar_linha(linha)] += 1
                    break

            if (i + 1) % 20 == 0 or (i + 1) == total:
                print(f"    página {i+1}/{total} processada")

    doc.close()

    return agrupar_cabecalhos(contador, total)


def construir_html(cache_path: Path, html_path: Path, titulo: str, cabecalhos: set[str]) -> None:
    """Passo 2/2: lê o cache de texto por página (streaming, sem OCR novo)
    e escreve o HTML final, removendo o cabeçalho de seção repetido
    (quando é a primeira linha da página), promovendo o título de
    capítulo detectado (se houver) para <h2>, e limpando o ruído
    decorativo de OCR."""
    print("Passo 2/2: montando HTML a partir do cache...")

    with cache_path.open(encoding="utf-8") as cache, html_path.open("w", encoding="utf-8") as out:
        out.write(HTML_HEADER.format(titulo=html.escape(titulo)))

        for i, linha_cache in enumerate(cache):
            registro = json.loads(linha_cache)
            texto = registro["texto"]
            titulo_pagina = registro["titulo"]
            n_linhas_titulo = registro["n_linhas_titulo"]

            linhas = [l.strip() for l in texto.splitlines() if l.strip()]

            html_titulo = ""
            if titulo_pagina and n_linhas_titulo:
                linhas = linhas[n_linhas_titulo:]
                html_titulo = f"<h2>{html.escape(limpar_linha(titulo_pagina))}</h2>\n"

            if linhas and normalizar_linha(linhas[0]) in cabecalhos:
                linhas = linhas[1:]

            paragrafos = "".join(f"<p>{html.escape(limpar_linha(l))}</p>\n" for l in linhas)

            out.write(f'<section class="pagina" id="pg-{i+1}">\n')
            out.write(html_titulo)
            if paragrafos:
                out.write(paragrafos)
            elif not html_titulo:
                out.write("<p>&#160;</p>\n")
            out.write("</section>\n")

        out.write(HTML_FOOTER)


def convert_to_ebook(html_path: Path, saida: Path, titulo: str, autor: str) -> None:
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

        cabecalhos = primeira_passada(args.pdf_entrada, cache_path, lang=args.lang)
        construir_html(cache_path, html_path, titulo=titulo, cabecalhos=cabecalhos)
        convert_to_ebook(html_path, args.saida, titulo=titulo, autor=args.autor)

    print(f"\nConcluído: {args.saida}")


if __name__ == "__main__":
    main()

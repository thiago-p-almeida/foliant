# Arquitetura — foliant.py

## Visão geral

Pipeline offline: PDF (escaneado ou nativo) → OCR/extração de texto por
página → HTML → EPUB/AZW3 via Calibre. Projetado para rodar numa CPU
dual-core fraca, sem ventoinha, então cada decisão de design prioriza
manter o pico de RAM e o tempo de CPU baixos em vez de qualidade máxima.
OCRmyPDF (e suas dependências pesadas — Ghostscript, qpdf) foi removido
desde a v2 em favor de OCR direto sobre a imagem renderizada pelo PyMuPDF.

## Restrições de design

- Nunca mais que uma página de texto/imagem em memória por vez — livros
  escaneados de 190MB+ não podem ser lidos inteiros para RAM.
- Sem dependências novas além do que já está instalado: PyMuPDF,
  pytesseract, Pillow, Tesseract (binário), Calibre (binário). Toda lógica
  de limpeza/qualidade usa só a stdlib (`re`, `json`, `collections.Counter`).
- Offline, sem chamadas de rede.

## Validação de carga: RAM não escala com o tamanho do livro

**Objetivo central do projeto confirmado com dado real (2026-09-02)**, não
estimativa: rodado o livro completo real, `samples/Como Elaborar Projetos
de Pesquisa (Em Portugues do Brasil) -- Antonio Carlos Gil.pdf` — 169MB,
208 páginas — com `/usr/bin/time -l` medindo pico de RAM, e comparado
contra o teste de 80 páginas (`samples/001-080.pdf`, 66MB) medido da mesma
forma:

| Teste | Páginas | PDF | `maximum resident set size` | `peak memory footprint` |
|---|---|---|---|---|
| 80 páginas | 80 | 66MB | 402.313.216 B (383,7 MiB) | 295.612.416 B (281,9 MiB) |
| Livro completo | 208 | 169MB | 470.691.840 B (449,0 MiB) | 295.522.304 B (281,9 MiB) |

`peak memory footprint` (a métrica mais confiável, reportada pelo kernel
Mach) ficou **igual dentro de 0,03%** entre os dois testes, apesar de
2,6x mais páginas e 2,56x mais dados de entrada — confirma que o cache em
disco (JSON-lines) mantém o pico de RAM independente do tamanho do livro,
como pretendido pela arquitetura de duas passadas. `maximum resident set
size` cresceu 17%, bem abaixo do crescimento de páginas (160%) — atribuído
a overhead fixo (metadados do documento no PyMuPDF, alocador do Python
não devolvendo memória liberada ao SO), não a acúmulo por página. Referência
de regressão para testes futuros: **pico de RAM não deve passar de
~300MB (peak memory footprint) independente do tamanho do PDF de
entrada**, para a stack atual (PyMuPDF + pytesseract + Pillow, DPI 200).

**Interrupção abrupta deixa lixo em disco — comportamento esperado, não
um bug.** `tempfile.TemporaryDirectory()` só limpa o cache
(`paginas.jsonl`) e o HTML intermediário no unwind normal do `with` ou
numa `KeyboardInterrupt` (o caminho de um Ctrl+C real em primeiro plano).
Um `kill -TERM`/`SIGKILL`/queda de energia não dá chance a isso rodar —
confirmado empiricamente (`paginas.jsonl` e arquivos temporários do
próprio Tesseract sobrevivem a um `SIGTERM`). É o comportamento padrão de
qualquer script Python usando arquivos temporários em Unix; `/tmp` é
limpo pelo próprio SO periodicamente, então não é um leak permanente.

## Pipeline (duas passadas)

1. **Passada 1 — OCR + cache + análise de cabeçalhos**
   (`primeira_passada`): percorre o PDF uma única vez. Para cada página,
   `extrair_texto_pagina` usa a camada de texto nativa se existir, senão
   renderiza a página (`RENDER_DPI`) e roda Tesseract. O texto bruto de
   cada página é gravado como uma linha JSON em `paginas.jsonl` (dentro do
   `tempfile.TemporaryDirectory()` da execução) — streaming, nunca mais
   que uma página de texto em RAM. Em paralelo, a primeira linha não
   vazia de cada página é normalizada e contada num `Counter`.
2. **Passada 2 — montagem do HTML** (`construir_html`): lê
   `paginas.jsonl` linha a linha (sem OCR novo), remove a primeira linha
   da página se ela bater com o conjunto de cabeçalhos identificado na
   passada 1, aplica `limpar_linha` (ruído decorativo) e `html.escape` por
   linha, e escreve o HTML final.
3. **Conversão Calibre** (`convert_to_ebook`, inalterada).

### Por que duas passadas em vez de uma

Cabeçalhos de seção repetidos (ex.: "Como classificar as pesquisas?")
grudavam no primeiro parágrafo da página seguinte, porque a versão
anterior tratava cada página como um blob único sem noção de estrutura.
Para filtrar isso é preciso saber, antes de escrever qualquer HTML, quais
linhas se repetem o bastante ao longo do livro para serem cabeçalho —
dado que só existe depois de ver o livro inteiro.

**Decisão de design**: em vez de rodar OCR (a parte cara, ~o gargalo
inteiro do pipeline numa CPU fraca) duas vezes — uma por passada, como o
desenho original cogitava — o OCR roda **uma única vez**, na passada 1, e
o texto bruto de cada página é cacheado em disco. A passada 2 só lê esse
cache. O cache (`paginas.jsonl`) é uma lista de JSON por página, tipicamente
dezenas a poucas centenas de KB para um livro de dezenas/centenas de
páginas — desprezível comparado ao PDF de origem (66MB neste teste, 190MB+
no caso de uso real) — e vive dentro do mesmo `TemporaryDirectory` que já
existia, sendo limpo automaticamente ao final. Isso mantém o mesmo perfil
de RAM de antes (nunca mais que uma página em memória) e corta pela
metade o tempo de OCR em relação a reprocessar o PDF do zero na passada 2.

## Detecção de cabeçalho/rodapé repetido

**Rodapé**: verificado nos dados reais de `samples/001-080.pdf` — a última
linha de cada página é quase sempre um número de página isolado (arábico
ou romano) ou ruído incidental de OCR, sem nenhuma string recorrente
identificável como rodapé estrutural. **Não há padrão de rodapé real
neste livro** — não é uma limitação de preguiça, é um achado verificado.
A implementação cobre só cabeçalho (primeira linha da página); a lógica de
normalização + agrupamento está pronta para ser reaplicada à última linha
também, caso um outro livro realmente tenha rodapé recorrente.

**Cabeçalho**: o desenho original planejava contagem exata de string
normalizada com limiar de 30% das páginas — abandonado após dois problemas
reais encontrados ao validar com `samples/001-080.pdf`:

1. **Comparação por caractere não separa cabeçalhos diferentes.**
   `difflib.SequenceMatcher.ratio()` sobre a string normalizada inteira foi
   testado primeiro (como planejado). Achado real: "como classificar as
   pesquisas" vs. "como encaminhar uma pesquisa" (cabeçalhos DIFERENTES,
   capítulos diferentes) deu `ratio=0.737` — mais alto que "como
   encaminhar" vs. "como encaminhar uma pesquisa" (MESMO cabeçalho,
   truncado pelo OCR), que deu `ratio=0.698`. Nenhum limiar único separa
   os dois casos porque todos os cabeçalhos deste livro seguem o mesmo
   molde ("Como \<verbo\> ...pesquisa...?"), então a similaridade por
   caractere pondera demais a estrutura comum e de menos à palavra que
   realmente distingue um cabeçalho do outro.

   **Solução**: comparar por **sobreposição de palavras de conteúdo**
   (stopwords removidas — "como", "a", "uma", etc. — e tokens puramente
   numéricos descartados, já que o OCR às vezes gruda o número da página
   ao cabeçalho). Coeficiente de contenção: `|A∩B| / min(|A|,|B|)`, que
   cobre bem truncamento por OCR (o conjunto menor contido no maior).
   Nos mesmos pares reais: 0.0 (cabeçalhos diferentes) e 1.0 (mesmo
   cabeçalho, truncado). `LIMIAR_SIMILARIDADE = 0.70`.

2. **Comparar contra qualquer membro do cluster ("complete-link") permite
   encadeamento.** Uma variante de OCR truncada a uma única palavra de
   conteúdo (ex.: "como delinear uma", que sobra só "delinear" depois de
   remover stopwords) bate 100% de sobreposição com QUALQUER cabeçalho que
   contenha "delinear" — inclusive um cabeçalho genuinamente diferente
   ("Como delinear uma pesquisa documental?" grudou em "...bibliográfica?"
   por esse caminho, confirmado nos logs de teste).

   **Solução**: cada cluster mantém um único "canônico" — o membro com
   mais palavras de conteúdo visto até agora — e novas linhas só entram no
   cluster se baterem contra esse canônico (não contra qualquer membro).
   Isso evita que um fragmento fraco vire ponte entre dois cabeçalhos
   diferentes, mantendo a capacidade de reconhecer truncamentos legítimos
   (eles batem alto contra a forma completa do próprio cabeçalho).

3. **Limiar de frequência: duas calibrações, a primeira não generalizou.**

   **1ª calibração (30% → 0.06, feita só com `samples/001-080.pdf`)**:
   diferente do pressuposto original (um cabeçalho único repetido no livro
   todo), este recorte de 80 páginas tem um **cabeçalho de seção diferente
   por capítulo** (~6 capítulos nesse recorte) — mesmo com o clustering
   corrigido, o maior cabeçalho real chegava a 17-18 de 77-80 páginas úteis
   (~22%), abaixo de 30%. Baixado para uma fração de **0.06** (mínimo
   `max(2, round(total*0.06))`) após inspecionar os clusters reais desse
   recorte — capturou os 6 cabeçalhos genuínos (contagens 5-18) sem falso
   positivo.

   **2ª calibração (fração → contagem absoluta, achada no teste de carga
   com o livro completo)**: a fração de 0.06 foi testada contra o livro
   completo real (`samples/Como Elaborar Projetos de Pesquisa...`, 208
   páginas, ~24 cabeçalhos reais — muito mais capítulos que o recorte de
   teste) e **falhou**: com mínimo=12 (6% de 208), só 2 dos 24 cabeçalhos
   reais cruzaram a barra, deixando ~59% do livro com o cabeçalho ainda
   colado ao primeiro parágrafo (achado concreto: página 30,
   `"a ; Como formular um problema de pesquisa?"` grudada). O problema é
   estrutural, não um número mal escolhido: uma fração fixa do livro
   pressupõe implicitamente um número mais ou menos fixo de capítulos —
   quanto mais capítulos o livro real tem, menor a fatia proporcional de
   cada um, e a fração nunca foi pensada para escalar com o número de
   capítulos.

   **Correção**: `LIMIAR_CABECALHO` trocado de fração para **contagem
   mínima absoluta** (`LIMIAR_CABECALHO_MINIMO = 3`, com um piso
   proporcional pequeno de 1% somado por precaução só para livros muito
   maiores que os testados). Distribuição real de contagens nos dois
   livros testados (todos os clusters formados, não só os que cruzaram a
   barra — mesmo padrão de transparência usado na tabela de ratios do
   difflib acima):

   | Livro | Contagens dos clusters que SÃO cabeçalho real | Maior cluster que NÃO é cabeçalho |
   |---|---|---|
   | 80 páginas, ~6 capítulos | 16, 13, 9, 8, 6, 5 | 2 |
   | 208 páginas, ~24 capítulos | 20, 13, 9, 8, 8, 8, 7, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3 | 2 |

   Revalidado após a correção: 24 dos 24 cabeçalhos reais do livro completo
   passaram a ser detectados (contra 2 antes), sem nenhum falso positivo
   novo, e sem custo de RAM/CPU (mesmo pico de RAM, mesmo tempo de execução
   dentro da margem de ruído entre execuções).

   **Isto é uma calibração em 2 pontos, não uma prova geral — risco
   residual conhecido, no mesmo padrão do risco já registrado para
   `LIMIAR_SIMILARIDADE` acima.** A tabela mostra a margem real: o menor
   cluster genuinamente cabeçalho observado (3, no livro de 208 páginas)
   fica exatamente 1 unidade acima do maior cluster que não é cabeçalho
   observado (2, presente nos dois livros) — não há folga observada, `3`
   é o valor mínimo que separou os dois grupos nos dados que temos, não um
   número com margem de segurança confirmada. Dois cenários concretos e
   coerentes com o mecanismo do bug já encontrado que poderiam quebrar
   esse número:
   - **Livro com muitos capítulos muito curtos** (ex.: um livro de
     referência com 50+ seções de ~3-4 páginas cada): o cabeçalho de cada
     seção poderia ocorrer só 1-2 vezes, do mesmo jeito que a fração de
     6% falhou por não escalar com o número de capítulos — o mesmo tipo
     de falha (cabeçalho não detectado) pode se repetir com uma contagem
     absoluta baixa demais para esse perfil.
   - **Livro com poucos capítulos longos, mas com uma frase de transição
     incidental repetida** (ex.: "Neste capítulo," ou um aviso legal
     recorrente que por coincidência aparece como primeira linha de 3
     páginas): cruzaria o limiar de 3 e seria removido como se fosse
     cabeçalho, mesmo sendo conteúdo real — um falso positivo que nenhum
     dos dois livros testados expôs porque nenhum deles tinha esse padrão
     de repetição incidental na primeira linha da página.
   - O piso proporcional de 1% para livros muito maiores que 208 páginas
     também é extrapolação, não validado por teste real acima dessa
     escala.

### Limitações conhecidas

- Detecção normalizada + agrupamento por palavras ainda pode errar em OCR
  muito degradado (ex.: 2 de ~18 variantes de grafia de um cabeçalho real
  ficaram de fora do cluster no teste de 80 páginas, e um punhado
  equivalente no livro completo — ex. `"4 y Como classificar as
  pesquisas?"` na página 50 — por terem uma palavra de ruído a mais que
  reduziu a sobreposição abaixo do limiar) — isso é uma perda de recall
  (algumas páginas mantêm o cabeçalho), não um falso positivo (nunca
  observamos um cabeçalho removido incorretamente de conteúdo real).
  Compensação de precisão por recall é a escolha deliberada, e o padrão se
  repete de forma consistente nas duas escalas testadas (80 e 208
  páginas) — não piora com o tamanho do livro.
- Só a primeira linha da página é checada; rodapés não são verificados
  neste livro por não terem padrão identificável (ver acima). Se outro
  livro tiver rodapé real, a mesma lógica de `normalizar_linha` +
  `agrupar_cabecalhos` pode ser aplicada à última linha da página.
- Ao remover a linha de cabeçalho inteira, qualquer fragmento de texto
  real colado no fim dessa mesma linha pelo OCR (ex.: início de uma
  citação) também é perdido — visto num caso real de teste (uma citação
  perdeu a letra inicial "o" que estava grudada ao cabeçalho na mesma
  linha). Aceitável dado o ganho geral, mas não é 100% cirúrgico.
- `LIMIAR_CABECALHO_MINIMO` (3) e `LIMIAR_SIMILARIDADE` (0.70) são
  calibrados contra os dois livros reais testados (80 e 208 páginas) — não
  contra um universo de livros. Risco residual conhecido e documentado em
  detalhe nas seções acima (com exemplos concretos de que tipo de livro
  poderia quebrar cada um), não uma garantia geral.

## RENDER_DPI: testado, revertido para 200

**Decisão final: `RENDER_DPI = 200` (valor original, mantido).** 300 e 250
foram testados a fundo em `samples/001-080.pdf` e ambos revertidos — não
por não terem ajudado o suficiente, mas por terem trocado um defeito
cosmético por um estrutural, no mesmo trecho do livro, nos dois DPIs
testados. Não reabrir esse ajuste sem repetir esta comparação.

### O problema original (em 200)

Pontos de numeração de sumário em fonte pequena somem no OCR (`"7.1"`
vira `"71"`, `"7.10"` vira `"710"`). Defeito cosmético: o número ainda é
legível e não-ambíguo — qualquer leitor entende que "71 Etapas do
planejamento" é a seção 7.1.

### Por que 300 (e depois 250) foram tentados e descartados

A tentativa de corrigir isso subindo `RENDER_DPI` para 300 melhorou
**alguns** pontos faltando, mas não de forma confiável — o mesmo tipo de
erro persistia em outras entradas do mesmo sumário. Mais grave: em pelo
menos 2-3 blocos de sumário (de ~18 no livro), o DPI mais alto fez o
Tesseract **ler a página de sumário fora de ordem**: em vez de juntar
número e rótulo numa linha por seção como acontece em 200, ele passou a
emitir todos os números de uma coluna primeiro e todos os rótulos de texto
depois, sem nenhum pareamento entre eles — e em outro bloco, o número do
capítulo/seção **sumiu por completo** (não só o ponto). Isso é uma
categoria de defeito pior que o original: no lugar de "número sem ponto,
mas legível", o leitor recebe uma lista de números soltos seguida de uma
lista de textos soltos, sem forma de saber qual rótulo pertence a qual
número — ou nem o número aparece.

`RENDER_DPI = 250` foi testado como meio-termo e **reproduziu exatamente
os mesmos blocos quebrados da mesma forma** (mesmo defeito estrutural, nos
mesmos capítulos), só que com dígitos ainda mais ruidosos em alguns
pontos. Isso mostrou que não é um gradiente onde algum DPI intermediário
resolveria — é um patamar em que esse tipo específico de layout de página
(sumário em duas "colunas" visuais: número numa faixa, rótulo na outra)
quebra de um jeito pior, e tanto 250 quanto 300 já estão acima desse
patamar para este livro.

### Evidência: mesmos blocos, três DPIs

| Bloco do sumário | DPI 200 | DPI 300 | DPI 250 |
|---|---|---|---|
| Cap. 1 "Como encaminhar uma pesquisa?" | texto corrido, correto | números e rótulos em blocos separados, sem pareamento | mesma quebra de coluna que 300, dígitos mais ruidosos (`"44"`, `"tz"`) |
| Cap. 7 "Como delinear uma pesquisa experimental?" | `"71 Etapas..."`, `"7.2 Formulação..."` — pareado corretamente, só falta o ponto | números (`74, 7.2, 7.3, 74, 7.5...`) e rótulos (`Etapas..., Formulação...`) em dois blocos separados | mesma quebra de coluna que 300 |
| Cap. 8 "Como delinear um ensaio clínico?" | `"8 COMO DELINEAR..."`, `"8.1 Ensaio clínico..."` — números presentes | número do capítulo ("8") e da seção ("8.1") **desaparecem por completo** | mesma perda de número que 300 |

Enquanto isso, a maioria dos outros blocos de sumário do livro (capítulos
6, 14, 17, entre outros) lê de forma idêntica nos três DPIs — o problema
não é generalizado, mas onde ele aparece, é pior em 250/300 do que em 200.

### Custo de tempo: benefício colateral da reversão

Manter 200 também é estritamente melhor no eixo que mais importa para
este projeto (CPU dual-core fraca, sem ventoinha): nenhum ganho de
qualidade real foi confirmado em 250/300 para justificar o custo extra de
CPU.

| Configuração | Tempo real |
|---|---|
| DPI 200 (baseline, passada única, código anterior) | 9m09s |
| DPI 300 + duas passadas + limpeza (1ª medição) | 12m37s |
| DPI 300 + duas passadas + limpeza (2ª medição) | 13m59s |
| DPI 250 + duas passadas + limpeza | 35m10s (ver nota) |

(A medição em 250 rodou com contenção de CPU visível — 103% de uso vs.
232-259% nas medições limpas — então o tempo real de parede não é
comparável 1:1; o tempo de CPU consumido (`user`, ~34,5min) foi da mesma
ordem de grandeza que as medições de 300, não menor como se esperaria de
uma imagem menor. Não foi investigado a fundo por já não haver ganho de
qualidade que justificasse continuar em 250 ou 300.)

Corrigir o defeito cosmético original de vez provavelmente exige mais que
ajuste de DPI (ex.: pré-processamento de imagem, upscaling seletivo de
regiões de fonte pequena, ou tratamento específico para páginas de
sumário) — fora do escopo desta rodada de correções.

## Fase 3: detecção de título de capítulo

### Problema

Antes desta fase, todo `<section class="pagina">` virava uma entrada de
TOC no EPUB (via `--chapter "//h:section[@class='pagina']"` do Calibre) —
76-80 entradas num livro de 80 páginas, quando o livro real tem ~6-24
capítulos. Objetivo: detectar a linha de título real de cada capítulo
(por tamanho/altura de fonte, não por conteúdo semântico) e marcá-la com
uma tag própria (`<h2>`), trocando o XPath do `--chapter` para apontar
para essa tag.

### Investigação (dados reais, antes de qualquer código)

**Fonte (a) — PDF nativo (`get_text("dict")`, tamanho de fonte real)**:
os 3 arquivos reais de teste (`001-080.pdf`, `081-160.pdf`, `161-208.pdf`
— juntos, o mesmo livro de 208 páginas do teste de carga) são **100%
escaneados**: 0 de 208 páginas têm qualquer camada de texto nativo.
O único PDF nativo real do projeto
(`samples/CV_Operations_Engineer_Thiago_P_Almeida.pdf`, um currículo) foi
inspecionado e deu um sinal fraco e pouco representativo: títulos de
seção a 12,0pt vs. corpo a 10,0pt — razão de só 1,2x, e currículo não tem
a mesma estrutura de um livro. Como não há nenhum PDF nativo de LIVRO
real disponível, foi gerado um PDF sintético no estilo livro
(`samples/sinteticos/livro_sintetico.pdf`, título 20pt vs. corpo 11pt,
razão 1,8x) só para confirmar que o mecanismo `get_text("dict")` do
PyMuPDF expõe o `size` por span como esperado — **isso valida só o
mecanismo, não calibra um limiar contra dado real**.

> **RISCO RESIDUAL EXPLÍCITO — Fonte (a) tem calibração zero contra dado
> real.** A rota de PDF nativo usa o mesmo limiar de 1,8x da fonte (b) por
> analogia, sem nenhuma confirmação com um livro nativo real — porque
> nenhum existe no projeto até agora. Se um PDF nativo real (não
> escaneado) passar pelo pipeline no futuro, **é essa rota, não testada,
> que vai processá-lo**. Não assumir que funciona só porque o mecanismo
> foi validado num PDF sintético — revalidar com um livro nativo real
> antes de confiar no resultado em produção.

**Fonte (b) — OCR (`image_to_data()`, altura de bounding box)**: testada
em 5 páginas reais de início de capítulo, localizadas dentro do próprio
livro de teste (não estimadas):

| Página | Título (altura px) | Corpo da mesma página (altura px) | Razão título/corpo |
|---|---|---|---|
| pg-21 "Como encaminhar uma pesquisa?" | 69,0 / 69,5 | 24,5–29,3 | ~2,4–2,8x |
| pg-37 "Como construir hipóteses?" | 88,0 / 70,0 | 26,0–29,4 | ~2,7–3,1x |
| pg-45 "Como classificar as pesquisas?" | 69,5 / 70,0 | 24,5–28,3 | ~2,3–2,8x |
| pg-96 "Como delinear um ensaio clínico?" | 79,0 / 69,0 | 25,3–29,3 | ~2,7–3,1x |
| pg-184 "Como redigir o projeto de pesquisa?" | 68,3 / 67,7 | 25,1–28,7 | ~2,4–2,7x |

Duas páginas (pg-97, pg-185) foram inicialmente localizadas via o
clustering de cabeçalho já existente e pareciam não ter título grande —
achado que, se não checado, teria contaminado a calibração. Investigação
revelou que essas eram a **segunda** página do capítulo (só cabeçalho
pequeno repetido), não a primeira — o clustering normalizado usado para
achar "primeira ocorrência" de um cabeçalho errou por 1 página porque o
OCR do título grande (fonte muito maior, layout diferente) não bateu de
perto o bastante com a forma "canônica" do cabeçalho pequeno repetido.
Corrigido localizando a página anterior real (pg-96, pg-184), que de fato
tem o título grande.

**Achado real de falso-positivo**: em pg-184, um número de capítulo
decorativo ("21") tem altura 176,0 — **maior que o próprio título real**
(68,3/67,7). Um critério que só olhasse "maior altura da página" teria
escolhido o número decorativo em vez do título. Por isso o critério exige
também um comprimento mínimo de texto.

**Sinal de subtítulo de seção (não é o alvo desta fase, mas apareceu nos
dados e ajuda a calibrar a margem)**: linhas como "1.1 Que é pesquisa?" e
"5.2.2 Extração das assertivas significativas" ficam consistentemente em
35-39px — acima do corpo, bem abaixo do título de capítulo real. Não são
detectadas por esta fase (fora do escopo — só título de capítulo, não
hierarquia completa de seções), mas confirmam a margem do limiar:

| Categoria | Faixa de altura observada | Razão vs. mediana do corpo (~27px) |
|---|---|---|
| Título de capítulo real (5 páginas) | 67,7 – 88,0 | **2,3x – 3,1x** |
| Subtítulo de subseção (não é alvo) | 35,4 – 39,2 | ~1,3x – 1,4x |
| Corpo de texto | 24,5 – 33,3 | 1,0x (referência) |
| Número decorativo de capítulo (falso-positivo em potencial) | 176,0 | ~6,5x |

### Critério de detecção (calibrado com os números acima)

- Altura da linha candidata ≥ **1,8x a mediana de altura de todas as
  linhas da página** — margem de 0,5x abaixo do pior caso real de título
  (2,3x) e de 0,4x acima do pior caso real de não-título (subtítulo de
  subseção, 1,4x).
- Texto da linha candidata com ≥ **6 caracteres** — exclui o número
  decorativo real ("21", 2 caracteres); todos os fragmentos de título
  reais observados tinham ≥10 caracteres.
- Procura só nas primeiras ~5 linhas não vazias da página (títulos reais
  observados sempre nessa janela, mesmo quando precedidos por um número
  decorativo).
- Linhas candidatas consecutivas são unidas num só título — títulos reais
  vêm quebrados em 2 linhas pelo OCR (ex. "COMO ENCAMINHAR" + "UMA
  PESQUISA?").

> **RISCO RESIDUAL EXPLÍCITO — calibrado em 5 páginas de 1 livro só.**
> Mesma categoria de risco já registrada para `LIMIAR_CABECALHO_MINIMO`
> (contagem 3) e `LIMIAR_SIMILARIDADE` (0,70) nas fases anteriores: real,
> mas não uma prova geral. Um livro com títulos de capítulo estilizados de
> forma muito diferente (ex.: mesmo tamanho de fonte que o corpo, mas em
> negrito ou centralizado, sem grande salto de altura) poderia não cruzar
> o limiar de 1,8x e ficar sem título detectado — falha do mesmo tipo já
> visto no limiar de cabeçalho (silenciosa, não um crash).

**Achado adicional durante a implementação**: `detectar_titulo` usa a
mediana de altura de TODAS as linhas da página como referência — robusta
a 1-2 outliers (como o número decorativo "21") quando a página tem
volume normal de linhas (confirmado com 24 linhas reais em pg-21 e
pg-184: título detectado corretamente nos dois, inclusive pulando o "21"
antes do título em pg-184). Um teste unitário inicial com só 6 linhas
(recorte artificial, não uma página real) falhou porque, com tão poucas
linhas, o próprio outlier "21" desloca a mediana para cima o bastante
para o título real não cruzar mais o limiar — confirma que o critério
depende implicitamente de a página ter um volume "normal" de linhas
(dezenas, como em qualquer página real de livro com texto corrido).
**Risco residual**: uma página real muito curta (ex.: últimas linhas de
um capítulo, ou uma página quase em branco com só 2-3 linhas de texto)
poderia ter a mediana distorcida da mesma forma e falhar em detectar (ou
detectar erroneamente) um título — não observado nos livros de teste,
mas não devidamente descartado como impossível.

### Interação com a detecção de cabeçalho (Fase 2) — decisão de design

A linha promovida a título (`<h2>`) na página de abertura do capítulo
**continua contando na análise de frequência de cabeçalho** (o `Counter`
usado por `agrupar_cabecalhos`) — não é removida da contagem só por virar
título. Motivo: se fosse removida, cabeçalhos cuja contagem real hoje é
exatamente o mínimo (3, ver seção de Fase 2 acima) cairiam para 2 nesse
capítulo específico e voltariam a não cruzar `LIMIAR_CABECALHO_MINIMO` —
reabrindo silenciosamente a regressão do limiar de cabeçalho que acabou
de ser corrigida e validada. A linha só deixa de ser renderizada como
`<p>` comum na própria página de abertura (vira `<h2>` em vez disso); nas
demais páginas do mesmo capítulo (que só têm o cabeçalho pequeno
repetido, sem o título grande), a remoção de cabeçalho continua
funcionando exatamente como antes.

### Pré-requisito de implementação: uma única chamada de OCR por página

Extrair a altura por linha exige `pytesseract.image_to_data()` em vez do
atual `image_to_string()`. Rodar as duas chamadas por página dobraria o
tempo de Tesseract (o gargalo do pipeline) na CPU fraca — inaceitável.
Decisão: usar **só** `image_to_data()`, reconstruindo o texto plano a
partir dele (agrupando palavras por bloco/parágrafo/linha), preservando o
mesmo texto que hoje alimenta `limpar_linha`, `normalizar_linha` e o
clustering de cabeçalho.

**Validado como pré-requisito de merge, não como nice-to-have** —
comparado o texto reconstruído contra o `image_to_string()` atual, linha
a linha, em 3 páginas reais (título de capítulo, corpo normal, subtítulos
de subseção). Achado real durante essa validação: a primeira tentativa de
reconstrução (ordenar as linhas pela posição vertical/`top` em pixels)
**não bateu** com `image_to_string()` numa das 3 páginas — o cabeçalho de
seção dessa página aparece por último no `image_to_string()` (o próprio
Tesseract não ordena simplesmente de cima para baixo; sua lógica de
segmentação de página pode colocar um bloco de cabeçalho fora da ordem
vertical pura), mas a reconstrução por posição colocava esse mesmo
cabeçalho primeiro — o que teria mudado silenciosamente qual linha conta
como "primeira linha da página" para a remoção de cabeçalho (Fase 2).

**Correção**: ordenar as linhas pela própria numeração que o Tesseract já
atribui (`block_num`, `par_num`, `line_num`), não pela posição em pixels
— essa numeração já reflete a ordem de leitura que o Tesseract determinou
internamente (incluindo decisões de coluna/segmentação), a mesma usada
por `image_to_string()`. Revalidado com essa correção: **as 3 páginas
batem linha por linha, 100% idênticas** (23/23, 29/29, 32/32 linhas),
incluindo a página que expôs o problema. Esse achado é o motivo de este
pré-requisito estar registrado como parte da implementação, não como
rodapé — trocar a ordenação por algo aparentemente equivalente (posição
em pixels) teria introduzido uma regressão silenciosa na Fase 2 sem
nenhum teste específico de "TOC" ou "título" acusando o problema.

### Bugs reais encontrados e corrigidos durante a validação

A primeira rodada de validação completa (livro de 208 páginas real) achou
o TOC caindo de ~195-208 entradas (uma por página) para 26 — já um sinal
forte de que a detecção funcionava — mas a inspeção página a página achou
4 problemas reais, todos corrigidos antes de fechar a fase:

1. **Falso positivo por elemento decorativo** (`samples/081-160.pdf`,
   capítulo "pesquisa narrativa", pg-142): uma página com um ornamento de
   divisória (provável marca de nova parte do livro) tinha uma linha
   garbled com razão 1,90 — cruzando o limiar antigo de 1,8 — escolhida
   como "título" no lugar do título de verdade 2 linhas abaixo. Corrigido
   subindo `LIMIAR_RAZAO_TITULO` para 2,0 (ver comentário na constante) e
   preferindo o ÚLTIMO trecho de linhas fortes na janela, não o primeiro.

2. **Truncamento por ruído de medição numa linha do meio**
   (`samples/161-208.pdf`, capítulo "métodos mistos", pg-172): um título
   de 3 linhas teve a linha do meio ("* Pesquisas de") medida com razão
   1,73 — abaixo do limiar — por ruído da própria medição de altura do
   OCR nessa linha específica, cortando o título pela metade. Corrigido
   com `TOLERANCIA_LINHA_FRACA_TITULO`: até 1 linha fraca no meio de um
   trecho é tolerada, desde que haja uma linha forte de novo logo depois.

3. **Bug de offset (não uma calibração, um erro de lógica)**
   (`samples/161-208.pdf`, capítulo "redigir o projeto", pg-184): a
   versão original de `detectar_titulo` retornava a CONTAGEM de linhas do
   título (ex. 2), não a posição em que ele terminava na página. Numa
   página onde o título vem depois de uma linha decorativa pulada (ex.
   "21"), isso cortava `linhas[n:]` no lugar errado e deixava um
   fragmento do próprio título ("PROJETO DE PESQUISA?") duplicado como
   parágrafo comum logo abaixo do `<h2>` — visto de verdade no HTML gerado
   antes da correção. Corrigido retornando a posição final do trecho de
   título (incluindo qualquer linha decorativa pulada antes dele), não a
   contagem de linhas do título isoladamente.

4. **Janela de busca pequena demais para um título muito longo**
   (`samples/081-160.pdf`, capítulo "teoria fundamentada", pg-152): um
   número de capítulo decorativo (1 linha) seguido de um título de 5
   linhas ("Como delinear uma pesquisa para construir teoria fundamentada
   (Grounded Theory)?") estourava `JANELA_TITULO_LINHAS = 5` — a última
   linha do título ficava de fora da janela e virava parágrafo comum.
   Corrigido subindo a janela para 7.

Todos os 4 achados vieram de inspecionar o HTML/log gerado contra as
páginas reais do livro de 208 páginas — nenhum apareceu no teste inicial
de 80 páginas (recorte menor, com títulos mais uniformes e sem os
elementos decorativos de divisória de parte que só aparecem mais adiante
no livro completo). Reforça o padrão já visto nas fases anteriores: um
teste em volume real revela categorias de defeito que uma amostra menor
não expõe.

### Resultado final da validação (dado real, ambos os livros de teste)

| Livro | TOC antes (Fase 2) | TOC depois (Fase 3) | Estrutura real esperada |
|---|---|---|---|
| `samples/001-080.pdf` (80 páginas, 66MB) | 76-80 (uma por página) | **8** | ~6 capítulos + Prefácio + Sumário |
| Livro completo (208 páginas, 169MB — reconstruído em `samples/livro_completo_208pg.pdf`, ver nota) | ~195-208 (uma por página) | **26** | ~24 capítulos/seções + Prefácio + Sumário + Bibliografia + Índice |

Nota: o PDF original de 169MB usado no teste de carga da Fase 2 não está
mais em `samples/`; `samples/livro_completo_208pg.pdf` é uma reconstrução
byte-idêntica em conteúdo (concatenação de `001-080.pdf` + `081-160.pdf`
+ `161-208.pdf`, os mesmos 3 arquivos usados durante todo o projeto),
gerada com PyMuPDF, usada para a validação desta fase e mantida para
testes de regressão futuros.

**Falso positivo residual aceito, não corrigido**: `"Bibliograi sam"`
(pg-196) é uma leitura de OCR de ruído numa linha de cabeçalho repetido
("Bibliografia", que aparece pequeno e correto em outras páginas da mesma
seção, ex. pg-195 com razão 1,31 — bem abaixo do limiar). Nessa página
específica, a MESMA linha pequena teve sua altura medida como 62,5px
(razão 2,07) — ruído de medição do OCR, não um elemento estrutural
diferente. Diferente dos 4 bugs acima, isso não é uma falha de lógica
corrigível: é ruído estatístico inerente a usar altura de bounding box
como proxy de tamanho de fonte — qualquer limiar finito tem uma
probabilidade (pequena, mas não nula) de um cabeçalho repetido comum ter
sua altura medida errada o bastante para cruzá-lo numa página específica,
sem que isso indique um título de verdade ali. Aceito como ruído estrutural
esperado do método, não perseguido com mais ajuste de limiar (ajustar
para excluir esse caso específico seria overfitting a 1 amostra de ruído,
não a um sinal real). Custo real observado: 1 entrada espúria em 26 no
livro de 208 páginas.

### Limitações conhecidas (Fase 3)

- Fonte (a) — PDF nativo — usa o mesmo limiar da fonte (b) por analogia,
  sem nenhuma calibração contra um livro nativo real (nenhum existe no
  projeto). Ver aviso de risco residual explícito acima.
- Ruído de OCR pode produzir um título tecnicamente detectado na página
  certa, mas com texto ilegível (ex. pg-106, "Como delinear um Ed tita: de
  criqrles" em vez de "Como delinear um estudo de coorte?") — a detecção
  geométrica funcionou, a qualidade do texto reconhecido não. Mesma
  categoria de ruído já aceita em outras partes do pipeline (ex. dígitos
  trocados em números de sumário).
- Falsos positivos por ruído de medição de altura num cabeçalho repetido
  pequeno (não um elemento estrutural real) são possíveis e não têm
  correção geral conhecida — ver "Bibliograi sam" acima.
- `LIMIAR_RAZAO_TITULO` (2.0), `TOLERANCIA_LINHA_FRACA_TITULO` (1) e
  `JANELA_TITULO_LINHAS` (7) são calibrados contra os 2 livros reais
  testados (7 páginas de início de capítulo ao todo, mais os 4 casos de
  defeito real encontrados) — não uma prova geral para qualquer livro.

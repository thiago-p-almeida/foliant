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
  poderia quebrar cada um), não uma garantia geral. Um terceiro livro
  (PEREIRA, 903 páginas) passou pela rota de produção na Fase 4.3 e não
  teve nenhum cabeçalho de página real detectado — resultado ambíguo
  entre "este livro não tem cabeçalho repetido" e "o limiar não bate
  nesse layout", não fechado, ver Fase 4.3 para os dados completos. Não
  conta como uma terceira calibração (nenhum dado novo entrou nos
  limiares), só como uma tentativa de validação com resultado
  inconclusivo.

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
>
> **Atualização (Fase 4.3) — deixou de ser puramente hipotético, mas
> continua sem resolução**: um livro nativo real (PEREIRA, 903 páginas)
> passou pelo pipeline de produção. Contagem independente de tags `<h2>`
> no `.epub` gerado (o marcador usado por `construir_html()` para título
> de capítulo detectado) deu **zero em todas as 903 páginas** — nenhum
> título de capítulo foi detectado por esta rota nesse livro. Ambíguo
> entre "este livro não tem título de capítulo com salto de fonte grande
> o bastante" e "o limiar de 1,8x/analogia não bate neste layout" — a
> mesma ambiguidade (a) vs. (b) não fechada, documentada em detalhe na
> Fase 4.3 para a detecção de cabeçalho repetido (função diferente, mas
> mesmo livro, mesma sessão de teste). Não tratar como confirmação de que
> a rota funciona nem como prova de que falhou — é dado real novo, ainda
> sem conclusão.

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
  sem nenhuma calibração contra um livro nativo real. Um livro nativo
  real (PEREIRA, 903 páginas) passou pela rota de produção na Fase 4.3 —
  zero títulos de capítulo detectados nas 903 páginas, resultado
  ambíguo, não conclusivo. Ver aviso de risco residual explícito acima.
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

## Fase 4: empacotamento desktop (Tauri + sidecar PyInstaller)

### Objetivo e restrição

Só resolver fricção de distribuição — hoje usar o Foliant exige instalar
Python, Tesseract e Calibre manualmente. O núcleo (`foliant.py`) **não foi
alterado nesta fase**: o objetivo era empacotá-lo como binário standalone
(PyInstaller) e embuti-lo como sidecar num app Tauri, produzindo saída
byte-idêntica à do `python3 foliant.py` de sempre.

### Passo 0 — verificação de documentação atual

A sintaxe de sidecar do Tauri v2 foi confirmada contra a documentação
oficial atual (não assumida de memória): `bundle.externalBin` no
`tauri.conf.json` aponta para um binário sem sufixo; o Tauri bundler
espera encontrá-lo com o sufixo do target triple
(`foliant-core-x86_64-apple-darwin` nesta máquina — Intel Core m3, não
Apple Silicon). A permissão de execução é declarada em
`capabilities/default.json` via `shell:allow-execute` com `sidecar: true`
e uma lista de `args` permitidos (Tauri v2 valida os argumentos passados
em runtime contra essa lista — não é uma permissão "livre").

Sobre o problema conhecido de PyMuPDF+PyInstaller (`AttributeError` por
`stdout`/`stderr` nulos): só ocorre em modo `--windowed`/`--noconsole`.
Não se aplica aqui — o binário mantém console (é invocado como processo
filho pelo Tauri, com stdout/stderr capturados via pipe, não substituído
por `None`).

### Passo 1 — PyInstaller

```bash
pyinstaller --onefile --name foliant-core foliant.py
```

`pyinstaller-hooks-contrib` (instalado automaticamente como dependência
do PyInstaller) já inclui um hook para PyMuPDF — o import de `fitz`
funcionou no binário empacotado sem precisar de `--collect-all pymupdf`,
diferente do que a documentação antiga sugeria como precaução. Binário
resultante: **37MB**.

**Achado real durante a validação** (não esperado, não é bug do
`foliant.py`): o modo `--onefile` do PyInstaller usa um bootloader de
duas etapas — o processo inicial extrai o payload para um diretório
temporário e depois `fork`s um processo filho que roda o Python real,
mantendo o pai vivo para limpar o diretório temporário ao final. Isso
tem duas consequências práticas:
1. **Cold start**: `foliant-core --help` (nenhum trabalho real) leva
   ~4,5–5,1s só para descompactar o payload a cada execução — contra
   praticamente instantâneo do `python3 foliant.py --help`. Custo fixo
   por execução, não por página.
2. **Medição de RAM via `/usr/bin/time -l` fica errada**: a métrica
   `peak memory footprint` (a mais confiável nos testes da Fase
   anterior) é lida do processo que `/usr/bin/time` mede diretamente —
   o processo-stub, não o filho que faz o trabalho de verdade. Resultado
   observado: `peak memory footprint` de **528.384 bytes** (516KB) — um
   número obviamente errado, não o pico real do OCR. `maximum resident
   set size` (402MB de referência com Python puro) não teve esse
   problema porque parece agregar sobre a árvore de processos filhos
   (375.623.680 B / 358,2 MiB observado — mesma ordem de grandeza da
   referência). Corrigido medindo RSS do processo filho real por
   polling (`ps -o rss=`) durante a execução em vez de confiar em
   `/usr/bin/time -l` no processo pai. Ver resultados no Passo 4.

Testado isoladamente (fora do Tauri) contra os 2 livros de teste, com o
mesmo comando trocando `python3 foliant.py` pelo binário — ver Passo 4
para os resultados.

### Passo 2 — decisão sobre Tesseract/Calibre: opção (a)

**Decisão**: o app assume que Tesseract e Calibre já estão instalados
separadamente (opção a do meta-prompt original). O instalador Tauri só
empacota o núcleo Python; a documentação orienta os mesmos passos manuais
já validados (`README.md`).

**Por quê**: consistente com o padrão de execução incremental já usado
neste projeto (menor risco por etapa) — embutir os binários de terceiros
(opção b) aumentaria muito o tamanho do instalador e criaria um problema
de versionamento/manutenção próprio (Tesseract via micromamba e o `.app`
inteiro do Calibre têm ciclos de release independentes do Foliant, e
redistribuir esses binários levanta questões de licença que não foram
avaliadas). Nenhum dos dois motivos para (b) — resolver fricção por
completo — supera o custo de manutenção nesta fase. Documentado como
possível Fase 4.1 futura, não implementado.

### Passo 3 — sidecar no Tauri

Projeto criado em `desktop/` (`pnpm create tauri-app`). Mudanças em
relação ao template padrão:

- `desktop/src-tauri/tauri.conf.json`: `bundle.externalBin: ["binaries/foliant-core"]`.
- `desktop/src-tauri/Cargo.toml`: adicionados `tauri-plugin-shell` e
  `tauri-plugin-dialog` (o `opener` do template não é suficiente — é
  preciso `shell` para `spawn()` do sidecar e `dialog` para os seletores
  de arquivo da UI).
- `desktop/src-tauri/capabilities/default.json`: permissão
  `shell:allow-execute` com `sidecar: true` e validadores de `args`
  (posição do PDF de entrada, saída, `--lang`, `--autor`, `--titulo`).
- `desktop/src-tauri/binaries/foliant-core-x86_64-apple-darwin`: cópia do
  binário do Passo 1, **não versionada** (`.gitignore`) — gerada por
  `scripts/build-sidecar.sh`, que deve rodar antes de `pnpm tauri build`
  em qualquer máquina nova.
- UI mínima (`desktop/src/index.html` + `main.js`): formulário com
  seleção de PDF/destino (via `@tauri-apps/plugin-dialog`), título,
  autor, idioma, e um painel de log que mostra stdout/stderr do sidecar
  em tempo real via `Command.sidecar(...).stdout.on("data", ...)`.

### Passo 4 — validação (dados reais, 2026-09-03)

**Empacotamento**: `pnpm tauri build` produziu `Foliant.app` (50MB) e
`Foliant_0.1.0_x64.dmg` (41MB), com o sidecar corretamente embutido em
`Foliant.app/Contents/MacOS/foliant-core` (o Tauri renomeia, removendo o
sufixo de target triple no bundle final).

**Byte-identidade — livro de 80 páginas** (`samples/001-080.pdf`):
`python3 foliant.py` vs. binário PyInstaller isolado. Os 76 arquivos HTML
extraídos do EPUB são **idênticos byte a byte**. Diferenças encontradas
(esperadas, documentadas no meta-prompt original antes mesmo do teste):
`content.opf` (timestamp e UUID gerados pelo Calibre a cada execução),
`toc.ncx` (mesmo UUID + IDs de `navPoint` aleatórios), `cover_image.jpg`
(capa placeholder gerada pelo Calibre com anti-aliasing não-determinístico
— conteúdo visualmente idêntico, bytes JPEG diferentes). Nenhuma dessas
diferenças vem do `foliant.py` ou do empacotamento — são geradas pelo
Calibre de forma nova a cada chamada, independente de quem o invoca.

**Byte-identidade — livro de 208 páginas** (`samples/livro_completo_208pg.pdf`,
169MB): mesmo resultado — os 195 arquivos HTML são idênticos byte a byte;
só `content.opf`/`toc.ncx`/`cover_image.jpg` diferem, pela mesma razão.

**Tempo de execução** (208 páginas, rodado sequencialmente para não
competir por CPU nesta máquina dual-core):
| | Tempo real |
|---|---|
| `python3 foliant.py` | 34m27s |
| `foliant-core` (PyInstaller) | 20m19s |

A diferença não é atribuída ao empacotamento — mais provável é o cache de
disco/SO já estar quente na segunda execução (mesmo PDF de 169MB lido
duas vezes em sequência). Não foi isolado further porque não é uma
regressão (o binário empacotado não ficou mais lento, o oposto).

**RAM** (livro de 80 páginas, medida por polling de RSS do processo
filho real — ver nota do Passo 1 sobre por que `/usr/bin/time -l` no
processo pai não serve para binários PyInstaller `--onefile`):
pico de **377.604 KB (368,8 MiB)** — mesma ordem de grandeza do
`maximum resident set size` de referência (383,7 MiB, Python puro,
Fase de validação de carga). Sem regressão de memória atribuível ao
empacotamento.

**Cold start**: ~4,5–5,1s de overhead fixo por execução (extração do
payload do `--onefile`), medido com `foliant-core --help` (sem OCR real).
Ver Passo 1 para a causa raiz (bootloader de duas etapas).

**Risco residual aceito — Gatekeeper macOS**: sem assinatura de código
(decisão já tomada, custo do Apple Developer Program rejeitado), o macOS
mostra "desenvolvedor não identificado" ao abrir `Foliant.app`/`.dmg`
pela primeira vez. Não testado numa máquina limpa nesta fase (mesma
máquina de desenvolvimento, com Xcode Command Line Tools e demais
dependências já presentes) — documentado como o único obstáculo restante
esperado, não uma lacuna de teste.

## Fase 4.1: correção — módulos ES sem bundler quebravam a UI empacotada

**Sintoma**: `.dmg` da Fase 4 instalado renderizava a UI, mas nenhum
botão ("Selecionar…", drag-and-drop, "Converter") respondia, sem erro
visível na tela.

**Causa raiz**: `desktop/src/main.js` era carregado via
`<script type="module">` e usava especificadores nus
(`import { Command } from "@tauri-apps/plugin-shell"`,
`import { open, save } from "@tauri-apps/plugin-dialog"`). O template
gerado por `pnpm create tauri-app` para esse preset (vanilla JS, sem
framework) não inclui nenhum bundler — `tauri.conf.json` original tinha
`build.frontendDist: "../src"`, servindo os arquivos-fonte diretamente,
sem passo de build nem `<script type="importmap">` em `index.html`. Por
especificação de módulos ES (WHATWG HTML), um especificador nu só
resolve com um import map — inexistente aqui. O `import` falha de forma
síncrona antes de qualquer `document.getElementById(...).addEventListener(...)`
rodar, e nada na página captura ou reporta esse erro — daí HTML/CSS
renderizarem normalmente enquanto toda a lógica de evento fica morta.

Verificado que a própria dependência `@tauri-apps/plugin-dialog`
(`node_modules/@tauri-apps/plugin-dialog/dist-js/index.js`) reimporta
`@tauri-apps/api/core` do mesmo jeito (bare specifier) — ou seja, mesmo
usando o global injetado por `withGlobalTauri: true` (já presente no
`tauri.conf.json` desde a Fase 4) não haveria como despachar as funções
de conveniência `open`/`save`/`Command` sem reescrever manualmente as
chamadas de baixo nível `invoke("plugin:dialog|open", ...)` — mais
frágil e menos alinhado ao padrão oficial do que simplesmente empacotar.

**Por que isso não foi pego antes do empacotamento**: a Fase 4 validou
byte-identidade do *pipeline* (`foliant.py` vs. sidecar PyInstaller) e
tamanho/tempo/RAM do bundle, mas não incluiu um teste funcional da UI
Tauri em si (clicar nos botões) — lacuna real de cobertura de teste
daquela fase, não um regressão introduzida depois.

**Correção**: adicionado `esbuild` (`desktop/package.json`
devDependencies) e `desktop/scripts/build-web.mjs`, que empacota
`src/main.js` (resolvendo todos os imports de verdade, formato `esm`,
target `es2021`) e copia `index.html`/`styles.css`/`assets/` para
`desktop/dist/`. `tauri.conf.json` mudou:
`build.frontendDist` de `"../src"` para `"../dist"`, com
`beforeDevCommand`/`beforeBuildCommand` apontando para `pnpm build:web`
— roda automaticamente tanto em `tauri dev` quanto em `tauri build`, sem
passo manual extra para quem for buildar em outra máquina.

**Validação real**: com a correção, `pnpm tauri dev` rodando e um clique
no botão "Selecionar…" disparado via automação de acessibilidade do
macOS (`osascript`/System Events, já que não havia acesso a captura de
tela nem Web Inspector nesta sessão) abriu de fato o painel nativo de
seleção de arquivo (`sheets of window` foi de 0 para 1 no instante do
clique) — confirma que o listener é registrado e a IPC do plugin
`dialog` funciona ponta a ponta. `pnpm tauri build` rodado do zero
produziu um `.dmg` novo, reinstalado em `/Applications` no lugar do
antigo. O mesmo teste de clique contra o `.app` de release não pôde ser
confirmado nesta sessão: a automação de acessibilidade contra um
binário sem assinatura de código faz o `tccd` encerrar o processo
(`kTCCServiceAccessibility` negado por falta de entitlement, processo
identificado como "InvalidCode" no log unificado) — artefato da
combinação sandbox-de-teste + binário não assinado, não um crash do app
em uso normal (fica estável por 16s+ sem ser tocado por automação).
Recomendado teste manual do `.app` de release pelo usuário para fechar
o critério de aceite.

**Pipeline não afetado**: esta correção só mudou a camada de frontend
JS. Confirmado por `sha256sum`: `foliant-core` embutido no `.app`
recém-gerado é byte-idêntico ao binário-fonte em
`desktop/src-tauri/binaries/foliant-core-x86_64-apple-darwin` (não
recompilado nesta sessão) — a validação de byte-identidade da Fase 4
continua válida sem precisar re-rodar o teste completo (nenhuma
superfície do pipeline mudou).

## Fase 4.2: correção — ACL do plugin shell não cobria o comando `spawn`

**Descoberto pelo teste manual do usuário** no `.app` corrigido pela
Fase 4.1: "Selecionar…" já funcionava, mas "Converter" falhava com
`Falha ao iniciar: Command plugin:shell|spawn not allowed by ACL`. Um
segundo bug, independente do primeiro, que a UI morta da Fase 4.1 tinha
mascarado (não dava pra chegar a clicar em "Converter" antes daquela
correção).

**Causa raiz**, confirmada lendo o código-fonte da versão exata do
plugin fixada em `Cargo.lock` (`tauri-plugin-shell 2.3.6`, via
`~/.cargo/registry/src/.../tauri-plugin-shell-2.3.6`), não por memória
da sintaxe de versões anteriores:
- `permissions/autogenerated/commands/execute.toml` define a permissão
  `shell:allow-execute` (`commands.allow = ["execute"]`).
- `permissions/autogenerated/commands/spawn.toml` define
  `shell:allow-spawn` (`commands.allow = ["spawn"]`) — um identificador
  **separado**, não uma permissão mais ampla que englobe `execute`.
- `desktop/src-tauri/capabilities/default.json` (Fase 4) só concedia
  `shell:allow-execute`.
- `desktop/src/main.js` nunca chama `.execute()` — chama
  `Command.sidecar(...).spawn()` (necessário para receber stdout/stderr
  do sidecar em tempo real via eventos, o que `execute()` não oferece,
  já que só retorna o resultado final de uma vez). O SDK JS
  (`node_modules/@tauri-apps/plugin-shell/dist-js/index.js`, função
  `spawn()`) despacha isso como `invoke("plugin:shell|spawn", ...)`.

A permissão concedida nunca correspondeu ao comando de fato chamado —
presente desde a Fase 4, não pego porque aquela fase validou o pipeline
Python/PyInstaller isolado (fora do Tauri) e o empacotamento/tamanho/RAM
do bundle, mas não incluiu um teste funcional de clicar em "Converter"
na UI.

**Correção**: em `capabilities/default.json`, identificador trocado de
`shell:allow-execute` para `shell:allow-spawn`, mantendo o mesmo bloco
de escopo (`name: "binaries/foliant-core"`, `sidecar: true`, mesma lista
de validadores de `args`) — escopo continua restrito especificamente ao
sidecar `foliant-core`, não uma permissão ampla para qualquer comando
shell.

**Achado adicional durante a correção** (por inspeção de
`tauri-plugin-shell-2.3.6/src/scope.rs`, função `ShellScope::_prepare`,
antes de reconstruir — não reportado pelo usuário): a validação de
argumentos do escopo itera posicionalmente sobre os 8 validadores
declarados e falha (`Error::MissingVar`) se o array de args real tiver
menos elementos. `main.js` só incluía `--titulo`/valor quando o campo
"Título" (opcional na UI, placeholder "(opcional)") estava preenchido —
6 args em vez de 8 quando vazio. Isso teria quebrado "Converter" de novo
assim que alguém deixasse "Título" em branco. Corrigido em duas partes:
`main.js` agora sempre inclui `--titulo` (com `""` como padrão), e o
validador daquela posição em `default.json` foi relaxado de `.+`
(exige 1+ caractere; o regex é ancorado `^...$`, então `""` falharia)
para `.*` (aceita vazio). Confirmado em `foliant.py:597`
(`titulo = args.titulo or args.pdf_entrada.stem`) que uma string vazia é
tratada de forma idêntica a omitir a flag — sem mudança de comportamento
do núcleo.

**Validação**: build reconstruído (`pnpm tauri dev`) fica estável por
15s+ sem automação tocando o processo, confirmando que
`capabilities/default.json` continua sendo JSON/schema válido (um erro
de sintaxe teria falhado em tempo de build). A confirmação visual do
clique em "Converter" via automação de acessibilidade — a mesma técnica
que funcionou uma vez na Fase 4.1 — não foi reprodutível nesta sessão: a
partir da segunda tentativa, o `tccd` passou a negar consistentemente a
automação de Accessibility contra este binário não assinado (mesmo
artefato de sandbox da Fase 4.1, com a negação aparentemente cacheada
pelo TCC após a primeira tentativa falha). **Não foi possível confirmar
de ponta a ponta nesta sessão que "Converter" gera um `.epub` real** —
usuário vai validar manualmente. `pnpm tauri build` rodado do zero,
`.dmg` novo gerado, `.app` antigo removido e substituído em
`/Applications/Foliant.app`. Checksum do sidecar (`foliant-core`
embutido idêntico ao arquivo-fonte, não recompilado nesta sessão)
confirma mais uma vez que o pipeline Python não foi tocado.

## Fase 4.3: correção — PATH mínimo do launchd e renomeação `desktop` → `foliant-desktop`

**Sintoma**: com os dois bugs das Fases 4.1/4.2 corrigidos (seleção de
arquivo e início de conversão funcionando), o `.app` de produção falhava
ao converter com `Erro: ferramentas ausentes no PATH: tesseract,
ebook-convert.`.

**Causa raiz** (diagnóstico do usuário, verificado antes de corrigir):
apps GUI no macOS são iniciados pelo `launchd` com um `PATH` mínimo do
sistema — não herdam `.zshrc`/`.bash_profile`. O sidecar `foliant-core`
é processo filho do app Tauri, então herda esse `PATH` reduzido, não o
do terminal onde `tesseract`/`ebook-convert` foram symlinkados em
`/usr/local/bin`. `TESSDATA_PREFIX` (só exportado no `.zshrc`) tem o
mesmo problema.

Confirmado lendo `tauri-plugin-shell-2.3.6/src/commands.rs`
(`prepare_cmd`, struct `CommandOptions`) que isso realmente se propaga
para o sidecar: `env: Option<HashMap<...>>` tem
`#[serde(default = "default_env")]` com `default_env() -> Some(HashMap::default())`
— ou seja, quando o JS não passa `options.env` (como é o caso de
`Command.sidecar(...).spawn()` em `main.js`, sem segundo argumento de
opções), o código cai no branch `if let Some(env) = options.env { command.envs(env) }`
com um mapa **vazio**, não no `else { command.env_clear() }`. Um mapa
vazio passado a `.envs()` é um no-op — não limpa nada — então o
`std::process::Command` subjacente segue o comportamento padrão do Rust:
herdar o ambiente **completo** do processo pai (o próprio app Tauri).
Ou seja, a causa raiz apontada pelo usuário está certa, e a correção tem
que ficar no ambiente do processo do app (o pai), não em nada
específico do lado do sidecar/JS.

**Pesquisa antes de implementar** (via busca na web, não assumido de
memória, já que a sintaxe/API de crates pode mudar): confirmado que esse
é um problema conhecido do ecossistema Tauri/Electron/apps GUI no
macOS-Linux em geral, com solução oficial mantida pelo próprio time do
Tauri —
[`tauri-apps/fix-path-env-rs`](https://github.com/tauri-apps/fix-path-env-rs).
No macOS/Linux, a implementação roda o shell de login do usuário
(`$SHELL -ilc 'env'`) e aplica no processo atual as variáveis capturadas
dessa saída. A API oferece `fix()` (aplica só `PATH`) e `fix_vars()`/
`fix_all_vars()` (aplica um subconjunto ou todas as variáveis
capturadas). Usar `fix_all_vars()` em vez de `fix()` resolve `PATH` e
`TESSDATA_PREFIX` com o mesmo mecanismo — sem hardcodar nenhum caminho
específico desta máquina no código Rust (a alternativa óbvia seria
hardcodar `/usr/local/bin` e
`~/micromamba/envs/foliant-ocr/share/tessdata` diretamente na chamada do
sidecar, mas isso quebraria se o usuário reinstalar as ferramentas em
outro caminho — a solução via shell de login generaliza automaticamente
para qualquer caminho que o `.zshrc` do usuário de fato exporte).

**Correção**:
1. `desktop/src-tauri/Cargo.toml`: `fix-path-env` adicionado como
   dependência git, fixada num commit específico
   (`rev = "c4c45d503ea115a839aae718d02f79e7c7f0f673"`, resolvido via API
   do GitHub no momento da correção) — não uma branch flutuante, já que
   o crate não é publicado no crates.io.
2. `desktop/src-tauri/src/lib.rs`: `let _ = fix_path_env::fix_all_vars();`
   chamado como a primeira linha de `run()`, antes de `tauri::Builder`.

**Defesa em profundidade no núcleo Python** (avaliado e implementado,
pedido explícito do usuário): `foliant.py`, `check_dependencies()` agora
também checa caminhos absolutos conhecidos
(`CAMINHOS_ABSOLUTOS_FALLBACK = {"tesseract": "/usr/local/bin/tesseract", "ebook-convert": "/usr/local/bin/ebook-convert"}`)
quando `shutil.which()` não encontra o binário. Importante: só *checar*
o caminho absoluto não bastaria — `pytesseract` (chamado depois) e o
`subprocess.run(["ebook-convert", ...])` continuariam resolvendo pelo
nome via `PATH` e falhariam do mesmo jeito mais adiante. Por isso o
fallback, ao achar o binário no caminho conhecido, **também adiciona
esse diretório ao `PATH` do próprio processo Python**
(`os.environ["PATH"]`), corrigindo de fato as chamadas seguintes, não só
o preflight check. Testado isoladamente (não só lido/inferido): com
`PATH` simulado como `/usr/bin:/bin` (sem `/usr/local/bin`), o fallback
encontra os binários e corrige o `PATH` do processo; com
`CAMINHOS_ABSOLUTOS_FALLBACK` esvaziado (simulando binários realmente
ausentes em qualquer lugar), o comportamento de erro original é
preservado (`sys.exit(1)` com a mensagem original).

**Sidecar reconstruído**: diferente das Fases 4.1/4.2 (que não tocaram
`foliant.py`), essa correção mudou o núcleo — `scripts/build-sidecar.sh`
teve que rodar de novo. Checksum do binário mudou como esperado
(`f1971521...` → `67e9619e...`). Validado com `foliant-core --help`
(roda, sai 0) e os dois testes unitários do parágrafo anterior.

**Revalidação de byte-identidade rodada com dado real** (a suposição
inicial de "mudança isolada, não precisa re-testar" foi contestada
explicitamente pelo usuário antes de prosseguir para a próxima correção
— com razão: uma suposição sobre isolamento de uma mudança merece o
mesmo padrão de evidência das demais). Rodado `python3 foliant.py
samples/001-080.pdf` com a árvore de antes desta fase
(`git show HEAD:foliant.py`) e com a árvore atual, comparando os `.epub`
gerados: 76 arquivos HTML extraídos de cada lado, `diff -rq` recursivo
com **zero diferenças** fora de `content.opf`/`toc.ncx`/`cover_image.jpg`
(mesma exceção não-determinística do Calibre documentada desde a Fase
4). Confirma com evidência real, não só leitura de diff de código, que o
fix de PATH não afetou o pipeline de OCR/HTML/EPUB.

**Confusão de nomes "desktop" vs "Foliant" — investigada e corrigida**:
não eram dois apps distintos, um único app com nomes diferentes em
camadas diferentes do empacotamento. `productName: "Foliant"` no
`tauri.conf.json` sempre controlou só o nome do bundle final
(`Foliant.app`, `Foliant_0.1.0_x64.dmg`) — o executável *dentro* do
bundle (`Foliant.app/Contents/MacOS/<nome>`) vem do `[package] name` do
`Cargo.toml`, que o bundler do Tauri **não** renomeia para bater com
`productName` (confirmado inspecionando o `.app` gerado em cada fase
anterior: o executável sempre se chamava `desktop`, nunca `Foliant`). É
esse mesmo nome `desktop` que aparece tanto dentro do `.app` de produção
quanto no binário solto que `pnpm tauri dev` deixa em
`desktop/src-tauri/target/debug/desktop` — daí a ambiguidade relatada.

**Correção**: `[package] name` em `Cargo.toml` renomeado de `"desktop"`
para `"foliant-desktop"` (o `[lib] name = "desktop_lib"` não precisou
mudar — é só o nome interno do crate de biblioteca, nunca visível fora
do código Rust). Depois do rebuild, o executável passou a se chamar
`Foliant.app/Contents/MacOS/foliant-desktop`. Os binários soltos antigos
(`desktop/src-tauri/target/{debug,release}/desktop`, artefatos de build
gitignored) foram apagados nesta sessão.

**Orientação permanente**: `desktop/src-tauri/target/debug/` é sempre
saída de desenvolvimento (`pnpm tauri dev`), nunca deve ser tratada como
o app real. O único artefato válido para uso/teste real é o `.dmg`
gerado por `pnpm tauri build`
(`desktop/src-tauri/target/release/bundle/dmg/`), instalado como
`/Applications/Foliant.app`.

**Validação**: `pnpm tauri build` do zero baixou e compilou a nova
dependência `fix-path-env` sem erros. `.dmg` novo gerado, `.app` antigo
removido e substituído em `/Applications/Foliant.app`. Checksum do
`foliant-core` embutido confere com o sidecar recém-reconstruído.
**Confirmação visual do fluxo completo até o `.epub` não foi possível
nesta sessão** — mesma limitação de automação de acessibilidade contra
binário não assinado das Fases 4.1/4.2 (`tccd` nega a automação depois
da primeira tentativa bem-sucedida nesta sessão). Validação manual pelo
usuário pendente antes de fechar.

**Atualização — validado pelo usuário**: fluxo completo testado
manualmente pelo usuário no `.app` reinstalado — conversão funcionou de
ponta a ponta, incluindo com um terceiro livro real nunca usado antes
neste projeto (ver "Terceiro livro de teste" abaixo). As três correções
desta fase e das Fases 4.1/4.2 estão confirmadas por uso real, não só
por evidência estática.

**Risco residual explícito sobre o fix de PATH — não tratar como
"resolvido para qualquer Mac"**: `fix_all_vars()` resolve `PATH`/
`TESSDATA_PREFIX` em tempo de execução via shell de login do usuário,
então não depende do nome de usuário nem da estrutura de pastas de uma
máquina específica *por construção* — mas isso só foi **validado numa
única instalação real (a do autor, a mesma máquina de desenvolvimento)**,
nunca numa segunda máquina física com outra configuração de shell
(`bash` em vez de `zsh`, outro gerenciador de pacotes Python que não
`micromamba`, `PATH` customizado de outra forma, etc.). O mecanismo é
robusto por design (não hardcoda nada), mas "testado numa máquina só"
continua sendo uma amostra de 1 — mesmo padrão de honestidade já usado
para os limiares de cabeçalho (`LIMIAR_CABECALHO_MINIMO` etc., calibrados
contra 2 livros) e para o limiar de similaridade do `difflib`
(`LIMIAR_SIMILARIDADE`, calibrado contra um punhado de pares reais): a
lógica generaliza por construção, mas a validação empírica é estreita.
Não reabrir esse texto achando que "generaliza automaticamente" resolve
sozinho a lacuna de teste em outra máquina — só reduz o risco, não o
elimina.

**Risco residual do fallback `/usr/local/bin`**: a camada extra em
`check_dependencies()` assume a convenção padrão do macOS para instalação
manual de binários de terceiros (`/usr/local/bin`), que é exatamente a
convenção usada nas instruções de instalação deste próprio projeto
(topo de `foliant.py`, `sudo ln -s ... /usr/local/bin/tesseract`). Não é
garantia universal — se o usuário instalar `tesseract`/`ebook-convert`
em outro caminho fora dessa convenção (ex.: só dentro do `.app` do
Calibre, sem symlink), o fallback não vai achar. Ela existe como segunda
linha de defesa *depois* de `fix_all_vars()` já ter tentado resolver via
shell de login — não como substituto dele.

**Terceiro livro de teste (903 páginas, fora da amostra de calibração)**:
com as correções desta fase, o usuário converteu
`Artigos Científicos - Como Redigir, Publicar e Avaliar` (PEREIRA,
Maurício Gomes) pelo `.app` de produção — livro nunca usado antes nas
calibrações de detecção de cabeçalho/título das Fases 2-3 (que usaram só
os livros de 80 e 208 páginas). EPUB gerado tem 903 arquivos HTML
(confirmado por contagem direta dos arquivos extraídos do `.epub`
gerado, presente em `~/Desktop`).

Resultado reportado: nenhum cluster de cabeçalho repetido não-vazio
passou de 6 ocorrências — o único cluster que a lógica de
`detectar_cabecalhos_repetidos` classificou como cabeçalho de página foi
um cluster de linha vazia (sem conteúdo real). **Verificado de forma
independente nesta sessão** (não só aceito por relato): extraído o
`.epub` gerado e contadas as tags `<h2>` (usadas por
`construir_html()` especificamente para marcar cabeçalho de seção
detectado, ver linha ~546) em todas as 903 páginas — **zero páginas**
têm `<h2>`, confirmando que nenhum cabeçalho de seção foi de fato
inserido em lugar nenhum do livro. Também rodada uma contagem
independente e aproximada de linhas iniciais repetidas por página (proxy
simplificado, não a mesma lógica de clustering com similaridade do
`foliant.py`): a linha mais repetida foi ruído de OCR de marcador de
lista (`•`, 193 páginas), não um padrão de cabeçalho de seção — nenhuma
string de texto real se repetiu de forma consistente entre páginas.

**Isso é ambíguo entre duas explicações, e a ambiguidade não está
fechada**:
- **(a)** este livro genuinamente não tem cabeçalho de página repetido
  no texto OCRizado — layout diferente dos 2 livros de calibração
  (capítulos de manual de metodologia científica, sem os cabeçalhos de
  seção repetidos que caracterizavam os livros de calibração); ou
- **(b)** os limiares (`LIMIAR_CABECALHO_MINIMO = 3`,
  `LIMIAR_SIMILARIDADE = 0.70`) não estão pegando cabeçalhos reais deste
  layout específico (ex.: se o layout usa cabeçalho de página só a cada
  N páginas de forma irregular, nunca atingindo o mínimo de 3
  ocorrências agrupadas).

A inspeção manual do `<body>` de várias páginas do EPUB gerado (não o
`<head>`/metadado de título) não encontrou nenhum cabeçalho colado ao
texto do corpo — o que favorece a explicação (a) (se fosse (b), seria
esperado ver o texto de um cabeçalho não detectado colado à primeira
linha de conteúdo real de várias páginas, já que a função só remove o
cabeçalho do corpo quando o classifica como tal). Mas isso **não fecha a
ambiguidade de forma definitiva** — um teste real precisaria de mais
livros com layouts variados (e idealmente uma inspeção manual direta do
PDF original page a página, não só do HTML de saída) para diferenciar
(a) de (b) com confiança. Registrado aqui como ponto em aberto, não como
"funcionou, sem ressalvas" — mesmo padrão de honestidade das seções
anteriores desta arquitetura.

## Fase 4.4: correção — recuo de linha incorreto ("zigue-zague" visual)

### Sintoma e causa raiz

No EPUB do livro de 903 páginas (PEREIRA), o texto apresentava um
zigue-zague visual de recuo. Causa raiz confirmada por inspeção direta
do HTML gerado: `construir_html()` gerava **um `<p>` por linha física do
scan** (como a linha veio quebrada no OCR), e o CSS aplica
`text-indent: 1.2em` a todo `<p>` (classe `calibre1` uniforme —
confirmado que **não é** bug de alternância de classe: 31.900
parágrafos usam `calibre1` sem exceção). Toda linha do livro ficava
recuada, não só o início real de cada parágrafo.

### Pesquisa de sinais de layout (dados reais antes de decidir o critério)

Mesma disciplina das Fases 2-3: nada foi implementado antes de
investigar com números reais. Scripts de pesquisa em
`scripts/pesquisa_recuo.py` (inspeção visual, salva PNG de cada página)
e `scripts/pesquisa_recuo_estatistica.py` (agregado estatístico).

**Sinal 1 — posição X (`left`) da primeira palavra da linha**: testado
contra 3 páginas do livro de 903 páginas (60, 200, 400) e 1 página de
`samples/001-080.pdf` (30), depois validado em agregado contra 1.379
linhas (40 páginas do livro de 903 páginas). Resultado — **sinal forte e
limpo**: distribuição claramente bimodal, aglomerado de linhas de
continuação em ~40-43px (livro de 903 páginas, scan pouco tortuoso) a
~44-64px (`samples/001-080.pdf`, página com leve rotação/skew de scan
fazendo a margem "andar" ao longo da página), e aglomerado de início de
parágrafo em ~90-116px — um "vale" quase vazio nos buckets de 70-80px
(2 de 1.379 linhas) separando os dois grupos com folga.

Exemplo real (página 60 do livro de 903 páginas, esquerda=posição X em
pixels de renderização a 200 DPI):

| Linha | left | Classificação |
|---|---|---|
| "Nas primeiras revisões, o autor se encarrega..." | 105 | início de parágrafo |
| "suas intenções. Não raramente, no caso..." | 43 | continuação |
| "são necessárias para que ele se torne..." | 43 | continuação |
| ... (mais 5 linhas de continuação, left 42-43) | | |
| "Durante as releituras, o autor tem a possibilidade..." | 105 | início de parágrafo |

**Sinal 2 — hífen de quebra de palavra no fim da linha anterior**:
confirmado raro nos dados reais (10/1.379 linhas = 0,73%), mas
praticamente inequívoco quando ocorre — usado como *override* sobre o
sinal 1 (força continuação mesmo que a próxima linha, por algum motivo,
tivesse `left` alto).

**Sinal 3 — espaçamento vertical (gap Y) TESTADO E DESCARTADO**: mediana
do gap para linhas de continuação (`left<=60`) foi 23,3px contra 28,1px
para linhas de possível início de parágrafo — diferença pequena demais,
com distribuições fortemente sobrepostas (ex.: grupo de "possível
início" teve gap mínimo de -543,9px e máximo de 535px, incluindo
artefatos de quebra de coluna/rodapé/página) — não seria confiável nem
combinado com o sinal 1. Não implementado.

**Sinal de pontuação final considerado e não implementado**: nas páginas
reais inspecionadas, todo início de parágrafo real já tinha o recuo
físico presente — nenhum caso real de falso negativo do sinal 1 sozinho
foi encontrado que justificasse um segundo sinal. Complexidade não
comprovada por dado real não foi adicionada; revisitar se um
contra-exemplo real aparecer.

**Cluster incomum investigado**: a distribuição agregada mostrou um pico
secundário em `left≈630-660` (29 linhas). Inspecionado diretamente
(`scripts/pesquisa_recuo_outliers.py`) e confirmado: é uma página de
checklist numerado (itens tipo "1b", "2b", "9", "15"...) — cada item já
é uma entrada lógica separada, então classificá-los como "início de
parágrafo" (o que o critério faz, dado o `left` bem acima da mediana da
página) é o comportamento correto, não um artefato a corrigir.

### Critério final

`LIMIAR_RECUO_DELTA_PX = 35`: uma linha é início de parágrafo quando seu
`left` excede a **mediana de `left` de todas as linhas da própria
página** em mais que 35px — relativo à página, não um valor absoluto de
livro, porque a margem absoluta varia com rotação/skew do scan (ver
`samples/001-080.pdf` acima). Mediana por página (não por livro) para
caber na arquitetura de streaming existente — cada página já é
processada isoladamente. Delta de 35px cai no meio do vale observado
(70-80px absoluto, mediana de página ~40-43px), com ~15-20px de folga
para qualquer lado antes de tocar um dos dois aglomerados reais.

**RISCO RESIDUAL EXPLÍCITO — não tratar como validado para qualquer
livro**: calibrado só no livro de 903 páginas (fonte real do defeito
relatado, com validação em agregado de 1.379 linhas) mais uma única
página avulsa de `samples/001-080.pdf`. **Não foi testado contra os
livros de 208 páginas nem contra o restante de `samples/001-080.pdf`**
antes de escrever o código — a validação desses livros veio depois,
como confirmação end-to-end (ver "Validação" abaixo), não como parte da
calibração do limiar em si. Mesmo padrão de honestidade dos outros
limiares deste arquivo (`LIMIAR_RAZAO_TITULO`, `LIMIAR_CABECALHO_MINIMO`
etc.): a lógica generaliza por construção (é relativa à própria página,
não hardcoded), mas a amostra de calibração é estreita.

**Acoplamento com `RENDER_DPI`**: o delta de 35px foi medido a 200 DPI
(`RENDER_DPI` atual). Como a indentação física em pixels escala com a
resolução de renderização, mudar `RENDER_DPI` sem recalibrar
`LIMIAR_RECUO_DELTA_PX` na mesma proporção invalidaria este critério —
mesmo tipo de acoplamento já documentado para outros limiares baseados
em pixels/altura absoluta neste arquivo.

### Escopo: os dois caminhos (OCR e nativo) — histórico da decisão

**Nota de leitura**: esta seção documenta a decisão de escopo ORIGINAL
(escrita antes da correção abaixo) e por que ela mudou — não descreve o
estado final do código. Para o critério nativo realmente implementado,
ver "Correção real feita em duas etapas" logo abaixo e
`LIMIAR_RECUO_DELTA_PONTOS_NATIVO`/`LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO`
no código.

Decisão original: aplicar a fusão de linhas só ao caminho OCR
(`extrair_linhas_ocr` → `linhas_inicio_paragrafo`), mantendo o caminho
de texto nativo (`pagina.get_text("text").strip()`) exatamente como
antes — justificada, no momento em que foi tomada, pela suposição de que
"os 3 livros de teste deste projeto são 100% escaneados (nenhum tem
camada de texto nativa)" e que o arquivo
`samples/sinteticos/livro_sintetico.pdf` mencionado em comentários
antigos do código não existe mais no projeto (isso último confirmado por
busca no disco, continua verdadeiro). **Essa suposição sobre os 3 livros
nunca tinha sido reconferida depois que um QUARTO livro (PEREIRA, 903
páginas) entrou como caso de teste real** — e é justamente esse livro
que tem texto nativo de verdade. A decisão de escopo foi corrigida assim
que isso foi descoberto (ver próxima seção) — mantida aqui só como
registro de como o raciocínio evoluiu, não como o estado atual.

### Ordem de operações: limpeza de ruído ANTES da fusão de linhas

Investigado, não assumido: `limpar_linha()` (remove marcador decorativo
do início da linha) precisa rodar em CADA linha crua, individualmente,
ANTES de uni-las em parágrafo — não depois. Achado real em
`samples/001-080.pdf` (página 30, bloco de citação): um marcador
decorativo (`"*"`, provável borda esquerda de citação lida pelo OCR)
repete no início de **cada linha física** do bloco, não só da primeira
("* desestruturados e formulados..." seguida de "* indagar: 'Como
funciona a mente?'..."). Se a fusão rodasse antes da limpeza, só o `"*"`
da primeira linha do parágrafo seria removido — os das linhas internas
ficariam colados no meio da frase final. Limpar por linha crua primeiro,
unir depois, remove o marcador de todas.

### Implementação

- `extrair_linhas_ocr()`: passou a capturar também `left` (posição X da
  primeira palavra) por linha, não só texto e altura.
- `linhas_inicio_paragrafo()`: nova função, aplica o critério acima
  (mediana da página + delta, com override de hífen) e retorna uma lista
  de booleanos alinhada 1:1 com as linhas da página.
- Cache (`paginas.jsonl`) ganhou um campo novo, `inicio_paragrafo`
  (lista de bool, ou `null` no caminho nativo) — persistido por
  `primeira_passada()`, consumido por `construir_html()`.
- `construir_html()`: ao remover linhas de título/cabeçalho do início da
  página, a lista `inicio_paragrafo` é fatiada em lockstep (mesmos
  índices removidos). A linha que sobra no topo é sempre forçada para
  `True` (início) — a classificação pré-calculada dela era relativa à
  linha ORIGINAL anterior (possivelmente uma linha de título/cabeçalho
  já removida), que não existe mais nesse ponto.
- `unir_linhas_em_paragrafos()`: nova função, faz a fusão de fato — junta
  com espaço, ou sem espaço removendo o hífen quando a linha anterior
  termina em `-`.

### Correção real feita em duas etapas — a primeira estava incompleta

Registrado aqui, não escondido: a primeira versão desta correção só
tratava o caminho OCR (`extrair_linhas_ocr`/`linhas_inicio_paragrafo`),
calibrada com dados reais obtidos renderizando+OCRizando páginas do
livro de 903 páginas via `scripts/pesquisa_recuo*.py`. Só ao rodar o
pipeline de PRODUÇÃO (`extrair_texto_pagina`, não o script de pesquisa)
na mesma página para conferir o resultado é que ficou claro que
`inicio_paragrafo` voltava `None` — o PDF do livro de 903 páginas **tem
texto nativo real** (`pagina.get_text("text")` retorna texto direto,
sem qualquer OCR), e `extrair_texto_pagina()` sempre prioriza esse
caminho quando disponível (linha `if texto_nativo: ...`). A causa raiz
do sintoma relatado nunca passava pelo código recém-corrigido — o
script de pesquisa tinha renderizado+OCRizado a página manualmente, sem
nunca checar se a produção usaria esse caminho para ESTE PDF específico
antes de decidir o escopo da correção.

Isso invalida a alegação anterior desta mesma seção ("não existe nenhum
PDF de texto nativo real neste projeto") — nunca tinha sido reconferida
depois que o livro de 903 páginas entrou como caso de teste real. A
lição prática: `pagina.get_text("text")` (ou equivalente) precisa ser
checado ANTES de decidir onde calibrar/implementar uma correção baseada
em geometria de página, não depois.

Corrigido de fato: implementado o critério equivalente para o caminho
nativo (`extrair_linhas_nativas` passou a capturar `left` do bbox de
cada linha; `linhas_inicio_paragrafo()` generalizada para aceitar um
limiar de delta e, opcionalmente, um override por razão de tamanho de
fonte), calibrado com o MESMO livro de 903 páginas via
`pagina.get_text("dict")` — ver `LIMIAR_RECUO_DELTA_PONTOS_NATIVO` e
`LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO` no código para os números e o
raciocínio completos. Confirmado por reconstrução byte-idêntica (5
páginas reais, incluindo página vazia e última página do livro) que
trocar a fonte de `texto` de `pagina.get_text("text")` direto para
`"\n".join(linhas reconstruídas)` não muda o conteúdo extraído — só
garante alinhamento 1:1 com `inicio_paragrafo`.

**RISCO RESIDUAL EXPLÍCITO — critério nativo é um TERCEIRO ponto de
calibração, mais estreito que os dois do caminho OCR, não coberto pelos
testes de 80/208 páginas**: `LIMIAR_RECUO_DELTA_PONTOS_NATIVO` e
`LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO` foram calibrados só com 3 páginas
(60, 200, 400) de UM livro (PEREIRA, 903 páginas) — a mesma fonte usada
para calibrar `LIMIAR_RECUO_DELTA_PX` (caminho OCR), mas via um caminho
de código completamente diferente (`get_text("dict")`, não
`image_to_data()`). Não existe um segundo livro de texto nativo real
neste projeto para cross-validar o critério nativo contra um layout
diferente — os testes de `samples/001-080.pdf` (80 páginas) e
`samples/livro_completo_208pg.pdf` (208 páginas) descritos na tabela
abaixo **validam o caminho OCR, não o nativo** (ambos os livros são
100% escaneados, sem texto nativo) — não servem como validação adicional
do critério nativo, mesmo aparecendo na mesma tabela de resultados.

**Resumindo os três graus de confiança, para não confundir**:
- Critério OCR (`LIMIAR_RECUO_DELTA_PX`): calibrado com 1.379 linhas
  agregadas de 40 páginas do livro de 903 páginas + 1 página avulsa de
  `samples/001-080.pdf`, e **validado end-to-end contra 2 livros
  completos** (80 e 208 páginas, 100% via este caminho).
- Critério nativo (`LIMIAR_RECUO_DELTA_PONTOS_NATIVO` +
  `LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO`): calibrado com só 3 páginas
  avulsas de exame direto de geometria, e **validado end-to-end só
  contra um subconjunto de 24 páginas do único livro nativo real do
  projeto** — nenhum livro completo, nenhum segundo livro. O grau de
  confiança aqui é bem mais baixo que o do caminho OCR, apesar dos dois
  critérios terem nascido da mesma investigação.

**Limitação conhecida com defeito visual real confirmado — listas/
citações com recuo em bloco ou "pendurado"**: o critério assume o
padrão comum de parágrafo (só a primeira linha recuada); listas
numeradas com recuo pendurado (continuação MAIS recuada que o item
seguinte, ex. referências bibliográficas) e blocos de item com recuo
uniforme fundem incorretamente — não é só "não melhora", é uma
**regressão real** confirmada por comparação byte a byte antes/depois
em 3 páginas reais do livro de 903 páginas (referências bibliográficas
de páginas diferentes ficando coladas no mesmo `<p>`, marcador de item
enterrado no meio do texto). Backlog, prioridade baixa-média — ver
`TASKS.md` para a evidência completa (HTML antes/depois) e a direção de
correção futura considerada (detectar marcador de item tipo `^\d+\.\s`
como sinal adicional, não implementado, não calibrado).

### Validação

Rodado o pipeline completo (não uma função isolada, não um script de
pesquisa) contra os 3 livros de teste:

| Livro | Caminho usado | Exit code | Páginas confirmadas (`id="pg-N"` no HTML final) | Resultado |
|---|---|---|---|---|
| Subconjunto de 24 páginas do livro de 903 páginas (PEREIRA) | nativo | 0 | 24/24 | Parágrafos reais fundidos corretamente (ex.: 8 linhas físicas → 1 `<p>`); subtítulos de seção protegidos (não grudaram no corpo) — ver exemplos concretos em `TASKS.md` |
| `samples/001-080.pdf` | OCR | 0 | 80/80 | Parágrafos de 100-1444 caracteres (antes: ~70/`<p>`, um por linha física) |
| `samples/livro_completo_208pg.pdf` | OCR | 0 | 208/208 | Parágrafos de 101-910 caracteres |

Contagem de páginas verificada por `grep` direto nos arquivos HTML
extraídos do `.epub` gerado (`id="pg-1"` até `id="pg-N"`, todas
presentes), não assumida a partir do log de execução — inclui um
achado real durante essa checagem: a primeira tentativa de contar
páginas usando o padrão `class="pagina" id="pg-N"` reportou 4 páginas
"faltando" em `samples/001-080.pdf`; investigado antes de assumir bug
real — o Calibre insere um `<div id="pg-N" style="height:0pt"></div>`
como âncora exatamente no ponto onde divide o HTML em múltiplos
arquivos, e esse `<div>` não bate com o padrão mais estrito de busca
(que exigia `class="pagina"` imediatamente antes). Um `grep` mais amplo
(só `id="pg-N"`, sem exigir `class=`) confirmou as 80/80 páginas
presentes — falso alarme do meu próprio critério de busca, não do
código do pipeline.

Não rodado o livro de 903 páginas completo (só o subconjunto de 24
páginas — as mesmas já usadas na pesquisa de sinais, páginas 59-66,
199-206, 399-406, extraídas com `pymupdf.insert_pdf`): no ritmo
observado nos outros dois livros, 903 páginas levariam horas nesta
máquina — desproporcional para uma validação de formatação que não
depende do livro inteiro. O pipeline rodado é o mesmo código de
produção, sem nenhuma função mockada, só com menos páginas de entrada.

## Fase 4.5: extração de capa real; investigação (e abandono) de supressão de logo/figura

### Objetivo e restrição

Motivação original (relato do usuário, com imagens anexadas): o logo
decorativo do selo GEN aparecia como ruído de texto no EPUB gerado
("x* Grupo Editorial Nacional"), e todo EPUB gerado tinha uma capa
genérica ("Generating default cover" no log do Calibre), nunca a capa
real do livro. Hipótese de escopo maior levantada: já que EPUBs nativos
tratam imagem como binário real referenciado por `<img>`, o Foliant
deveria extrair capa/logos/figuras reais do PDF em vez de deixar que
esses elementos gráficos sejam OCRizados como texto.

Restrição: não pode regredir a saída de texto já validada nas Fases 2-4
(contagem de parágrafos, caminho nativo vs. OCR) em nenhum dos livros de
calibração.

### Investigação (dados reais, antes de qualquer código)

**Passo 1 — qual caminho a página problemática usa.** Confirmado por
inspeção direta do PDF (`samples/livro_completo_208pg.pdf`, livro do
Gil, 208 páginas): **100% das páginas usam o caminho OCR**
(`pagina.get_text("text")` vazio em todas as páginas verificadas) — não
há nenhuma página nativa neste livro. `pagina.get_images()` devolve
exatamente **1 imagem por página**, e essa imagem é a **página inteira
escaneada como 1 JPEG só** (página 0: página 578.16×824.40pt, proporção
0.7016; imagem embutida 2409×3437px, proporção 0.7008 — diferença de
0.1%). Ou seja: o cenário do meta-prompt original ("caminho nativo,
extração trivial via `get_images()`/`extract_image()` por sub-região")
**não existe neste livro** — não há nenhuma imagem em sub-região
extraível, só a página inteira.

**Passo 2 — sinais candidatos para detectar glifo decorativo no
caminho OCR.** Localizada a página do selo GEN: página 4 do PDF
(1-indexed; índice 3), via OCR direto das primeiras páginas. Dados reais
de `pytesseract.image_to_data()` (DPI de produção, `RENDER_DPI=200`):

| Elemento | Altura (px) | Mediana da página (px) | Razão | Confiança | Nº caracteres |
|---|---|---|---|---|---|
| Ícone do logo, fragmento 1 (`"*"`) | 85.0 | 22.8 | **3.7x** | — | 1 |
| Ícone do logo, fragmento 2 (`"x*"`) | 47.0 | 22.8 | **2.06x** | — | 2 |
| Legenda pequena do logo (`"Grupo"`/`"Editorial"`/`"Nacional"`, cada um vertical) | 11-15 | 22.8 | ~0.6x | 93-96 (normal!) | 5-8 |
| Corpo de texto normal da mesma página | 20-25 | 22.8 | ~1.0x | 90-97 | — |

Comparado com os dois grupos já calibrados neste projeto:
- Título de capítulo real (`LIMIAR_RAZAO_TITULO`): razão 2.0-2.5x
- Ornamento decorativo já documentado (comentário de
  `LIMIAR_TITULO_MIN_CHARS`, número de capítulo "21"): razão 5.8x

O fragmento 1 do ícone (3.7x) cai claramente no vale entre esses dois
grupos — um limiar em 3.5x, combinado com comprimento de texto <=3
caracteres, isola esse fragmento sem risco aparente. **O fragmento 2
(2.06x) não tem essa folga** — cai dentro da mesma faixa de razão de um
título real (2.0-2.5x).

**Colisão real encontrada ao tentar baixar o limiar para cobrir o
fragmento 2**: varrendo `image_to_data()` de páginas 8-39 do mesmo
livro em busca de conteúdo curto (<=3 caracteres) legítimo para
comparação, a página 21 (uma página com conteúdo tabular/lista muito
degradado pelo OCR) tem a palavra real `"se"` com razão **2.73x** —
mais alta que a razão do próprio fragmento do ícone (2.06x) que se
queria capturar. Ou seja: **não existe um limiar de razão que pegue o
fragmento 2 do ícone sem também remover texto real já presente no
mesmo livro** — não é uma suposição, é uma colisão medida.

**Achado adicional, descoberto só depois de implementar e comparar
antes/depois byte a byte**: o fragmento 1 do ícone (`"*"`, o único que
o limiar de 3.5x conseguia isolar com segurança) **já era removido por
código pré-existente**, sem relação nenhuma com detecção de imagem —
`_RE_RUIDO_INICIAL` (regex que zera pontuação decorativa solta no
início de uma linha, ver comentário na definição) já reduz uma linha
`"*"` isolada a string vazia, que depois é descartada pelo filtro
`if p.strip()` em `construir_html()`. Confirmado diretamente:
`limpar_linha('*')` → `''` (removido), `limpar_linha('x*')` → `'x*'`
(inalterado, porque `'x'` não está na classe de caracteres de ruído da
regex). Ou seja: uma heurística nova de altura/proporção foi
implementada, validada, e só DEPOIS percebida como **totalmente
redundante** com o único caso real que ela conseguia cobrir com
segurança — o caso que ela precisava resolver (`"x*"`) é exatamente o
caso que a colisão acima impede de resolver sem regressão.

**Passo 3 — viabilidade de capa real.** Testado com sucesso nos 2 livros
de calibração disponíveis:

| Livro | Proporção da página | Proporção da imagem da 1ª página | Diferença | Extraída? |
|---|---|---|---|---|
| Gil, 208pg (100% OCR) | 0.7016 | 0.7008 | 0.1% | Sim — `cover.jpeg`, 732446 bytes |
| PEREIRA, 903pg (quase 100% nativo, mas página 0 é OCR) | 0.7727 | 0.7509 | 2.8% | Sim — `cover.jpeg`, 98477 bytes |

Extração direta do binário já embutido no PDF via
`doc.extract_image(xref)`, sem re-renderizar nada — mesmo em livros de
texto nativo, a página 0 costuma ser uma imagem de capa inteira
(confirmado no PEREIRA: `get_text("text")` vazio só na página 0, as
outras 902 são nativas).

### Decisão / critério (calibrado com os números acima)

**Capa real — implementada.** `extrair_capa(doc, destino_dir)`: extrai
a 1ª imagem da página 0 cuja proporção largura/altura bate com a da
página inteira (`TOLERANCIA_PROPORCAO_CAPA = 0.15`, ver comentário no
código para a folga medida acima), salva como arquivo, passa para
`ebook-convert --cover`. Se nenhuma imagem bater a proporção, retorna
`None` e o Calibre volta ao comportamento antigo (capa genérica) — sem
regressão possível, só ganho condicional.

**Supressão de glifo decorativo (ícone de logo) — investigada e
abandonada, não implementada.** Motivo, em ordem de descoberta: (1) o
único caso que um limiar de altura/razão consegue isolar com segurança
(fragmento de razão 3.7x) já é removido por código pré-existente sem
relação com detecção de imagem; (2) o caso que de fato motivou a tarefa
(fragmento de razão 2.06x, o "x*" relatado) não tem limiar seguro —
colide com texto real de razão mais alta (2.73x) na mesma obra. Nenhuma
combinação de altura/razão + comprimento de texto testada separa os
dois grupos com margem. **Não implementado nenhum sinal posicional
(coluna isolada à esquerda/direita do corpo do texto) como alternativa**
— ficou fora do escopo desta fase; ver Limitações conhecidas.

**Extração de figuras internas reais (ex.: fluxogramas mencionados no
texto do Gil) — fora de escopo, não tentada.** Investigação do Passo 1
já mostrou que não há nenhuma imagem em sub-região extraível neste
livro (toda "imagem" de `get_images()` é a página inteira) — a única
via possível seria recortar do pixmap já renderizado usando um critério
posicional sobre `image_to_data()`. Página real com esse padrão
(índice 105, capítulo "Como delinear um estudo de coorte") mostra os
fragmentos decorativos **misturados palavra-a-palavra dentro do mesmo
bloco do título real** ("COMO DELINEAR UM" + "Ed tita: DE CRIQRLES" no
mesmo `block_num`) — sem fronteira de bloco ou palavra segura para
recortar sem risco de cortar texto real do título. Descartado por
decisão explícita do usuário, não por esgotamento de tentativas.

> **RISCO RESIDUAL**: nenhum. A funcionalidade de capa é aditiva e
> segura por padrão (`None` = comportamento antigo). A supressão de
> logo/figura não foi implementada — o ruído relatado originalmente
> (`"x*"` antes de "Grupo Editorial Nacional") **continua presente** no
> EPUB gerado, sem regressão em relação ao estado anterior a esta fase
> (nunca foi removido, continua não sendo). Registrado como caminho
> **investigado e abandonado** — não reabrir com a mesma estratégia
> (altura/razão + comprimento de texto no caminho OCR) sem um sinal novo
> que não colida com o caso real de razão 2.73x documentado acima.

### Validação

Rodado o pipeline completo de produção (não uma função isolada) nos 2
livros de calibração disponíveis, com o código final (capa real
implementada, supressão de glifo revertida):

| Livro | Caminho | Exit code | Tempo | Tamanho do EPUB | Parágrafos (`<p>`) | Capa real? |
|---|---|---|---|---|---|---|
| `samples/livro_completo_208pg.pdf` (208pg, Gil) | 100% OCR | 0 | 20m48s | 983068 bytes (antes desta fase: 336648 bytes — diferença de ~646KB, consistente com o binário da capa de 732446 bytes já comprimido) | 1205 — **idêntico** à contagem antes desta fase (mesmo dado, sem regressão) | Sim, sem "Generating default cover" no log |
| PEREIRA (903pg, quase 100% nativo) | nativo (902/903 páginas), OCR só na página 0 (capa) | 0 | 2m15s | 1387185 bytes (sem baseline anterior deste livro específico para comparar) | 10578 | Sim, sem "Generating default cover" no log |

A contagem de parágrafos idêntica (1205 = 1205) no livro do Gil, único
livro onde a supressão de glifo chegou a rodar de verdade antes de ser
revertida, é a evidência direta da redundância descrita acima — a saída
final do pipeline é byte a byte igual com ou sem aquela função, em
todas as 208 páginas, não só na página do logo.

Confirmado também, via `extrair_texto_pagina()` diretamente (função de
produção, não script de pesquisa), que a página do fluxograma (índice
105) produz o mesmo texto garbled de sempre — nenhuma mudança desta
fase toca esse caminho, conforme esperado (fora de escopo).

### Limitações conhecidas

- O ruído `"x*"` antes de "Grupo Editorial Nacional" (e qualquer glifo
  decorativo semelhante de razão próxima a 2x) continua aparecendo no
  EPUB — não resolvido, não escondido.
- Nenhuma figura interna real do livro (fluxogramas, nomogramas
  mencionados no texto do Gil) é extraída como imagem — o livro
  permanece 100% texto (real ou ruído de OCR), sem nenhuma imagem de
  conteúdo.
- `extrair_capa()` só testada em 2 livros, ambos com a 1ª página sendo
  uma imagem de página inteira (um 100% escaneado, outro com só a
  capa em imagem e o resto nativo). Não testado contra um livro de
  texto nativo cuja capa seja uma imagem PARCIAL da primeira página
  (ex.: uma ilustração pequena centralizada, com bastante margem
  branca ao redor) — nesse caso a proporção não bateria e nenhuma capa
  seria extraída (retorno `None`), comportamento seguro por padrão, mas
  não confirmado com um exemplo real desse tipo.

## Fase 4.6: barra de progresso real por fase

### Sintoma e pré-requisito

Relato do usuário (sessão anterior): rodando como sidecar do Tauri, a UI
parecia travada por minutos mesmo com o pipeline processando normalmente
por baixo — confirmado via `ps aux` mostrando CPU ativa (Tesseract
rodando) enquanto a UI não recebia nenhuma atualização. Objetivo desta
fase: uma barra de progresso real por fase, com pré-requisito explícito
de resolver essa causa raiz antes — uma barra nova sofreria do mesmo
problema se o buffer de saída não fosse corrigido primeiro.

### Investigação do buffer — resultado contra-intuitivo, `PYTHONUNBUFFERED=1` NÃO funciona no binário PyInstaller `--onefile`

Testadas as duas opções do meta-prompt original, contra o binário
PyInstaller real (não `python3 foliant.py` direto — que já é
line-buffered em TTY e não reproduz o sintoma relatado, já que o sidecar
roda via pipe, não TTY).

**Teste 1 — script sintético isolado** (`python3` puro, 5 prints com
`time.sleep(0.5)` entre eles, lidos via `subprocess.Popen(..., stdout=PIPE)`
num harness que registra o timestamp de chegada de cada linha):
- Sem correção: as 5 linhas chegam todas de uma vez, em bloco, ao final
  (2,94s) — reproduz exatamente o sintoma relatado.
- Com `PYTHONUNBUFFERED=1` no ambiente do processo filho: linhas chegam
  uma a uma, a cada ~0,5s (0,11s / 0,62s / 1,12s / 1,63s / 2,13s).
- Com `flush=True` em cada `print()`: mesmo resultado (0,14s / 0,64s /
  1,15s / 1,66s / 2,18s).

Neste teste isolado, **as duas opções resolvem igualmente** — o que
sugeriria escolher `PYTHONUNBUFFERED=1` por não exigir tocar
`foliant.py` (mesmo padrão de isolamento de mudança já usado no
`fix_all_vars()` da Fase 4.3).

**Teste 2 — o binário PyInstaller `--onefile` real, contra
`samples/001-080.pdf` (80 páginas)**: aqui o resultado inverteu a
decisão. Rodado o mesmo harness contra
`desktop/src-tauri/binaries/foliant-core-x86_64-apple-darwin` com
`PYTHONUNBUFFERED=1` setado no processo pai (exatamente como seria feito
do lado Tauri, no mesmo lugar onde `fix_all_vars()` já ajusta o
ambiente). Achado real, não esperado: **todos os `print()` do próprio
Python ficaram retidos até o processo inteiro terminar**, mesmo com a
env var setada — só a saída do subprocess do Calibre (que herda o file
descriptor diretamente, sem passar pelo buffer de I/O do Python) chegou
em tempo real. Evidência concreta (timestamps do harness, execução
real):

```
645.91s: Conversion options changed from defaults:   <- Calibre, em tempo real
...
648.50s: EPUB output written to /tmp/teste_progresso_80.epub
648.74s: Passo 1/2: OCR por página + análise de cabeçalhos e títulos...  <- devia ter chegado em t≈0
648.74s:     página 20/80 processada    <- todas as 4 marcas de página
648.74s:     página 40/80 processada       chegaram JUNTAS, no mesmo instante,
648.74s:     página 60/80 processada       só quando o processo já ia terminar
648.74s:     página 80/80 processada
```

Ou seja: a saída do Calibre (herdada via fd, fora do controle do
Python) chegou em tempo real desde o início; toda a saída do próprio
`foliant.py` — que é o que a barra de progresso precisa — ficou presa
até o fim, exatamente o defeito que esta fase existe para corrigir.
**`PYTHONUNBUFFERED=1` setado no processo pai não é suficiente dentro do
bootloader de duas etapas do PyInstaller `--onefile`** — hipótese mais
provável (não confirmada a fundo, não essencial para a decisão): o
bootloader do PyInstaller pode reconfigurar `sys.stdout` depois que o
interpretador embutido já leu a variável de ambiente no `Py_Initialize`,
ou o processo filho real (a segunda etapa do bootloader, ver Fase 4)
recebe o ambiente de um jeito que não preserva o efeito da flag. Não
investigado até a causa raiz exata porque a correção alternativa
(abaixo) resolve de forma direta e já testada.

**Correção escolhida**: `sys.stdout.reconfigure(line_buffering=True)`
como a primeira linha de `main()` em `foliant.py` — força o modo de
buffer diretamente no objeto `sys.stdout` em tempo de execução, depois
que o interpretador (embutido ou não) já está de pé, em vez de depender
de uma variável de ambiente lida no `Py_Initialize`. Diferente de
`PYTHONUNBUFFERED=1`, isso **exige tocar o núcleo** — decisão consciente,
não a preferência original (que era manter a mudança isolada no lado
Tauri) — porque o teste contra o binário real mostrou que a alternativa
isolada não funciona. Validado (mesmo binário reconstruído com a
correção, mesmo harness, `samples/001-080.pdf` recortado para 5 páginas
via `pymupdf.insert_pdf` para iteração rápida):

```
2.92s: Passo 1/2: OCR por página + análise de cabeçalhos e títulos...   <- chega imediatamente
23.65s:     página 5/5 processada    <- chega assim que a página termina, não no final do processo
23.65s: Passo 2/2: montando HTML a partir do cache...
23.65s: Compilando e-book final (.epub) com Calibre...
25.05s: 1% Converting input to HTML...
```

Confirma streaming linha a linha real, não em bloco.

> **RISCO RESIDUAL EXPLÍCITO**: a causa raiz exata de por que
> `PYTHONUNBUFFERED=1` não se propaga dentro do bootloader `--onefile`
> não foi isolada (ver hipótese acima, não confirmada). Isso não afeta a
> validade da correção escolhida (testada e funcionando de forma
> repetida, em várias execuções reais desta fase), mas significa que se
> o mecanismo de empacotamento mudar no futuro (ex.: troca de
> `--onefile` para `--onedir`, ou de PyInstaller para outra ferramenta),
> o comportamento da env var precisaria ser re-testado do zero — não
> assumir que a causa raiz não isolada aqui generaliza.

### Formato de comunicação sidecar → UI

Decisão: manter a saída de texto legível para humano (log bruto, útil
para depuração — já era o comportamento antes desta fase) E emitir
linhas adicionais com prefixo `PROGRESS:` seguido de um objeto JSON de
uma linha só (`PROGRESS:{"fase":"ocr","atual":80,"total":208}`), que o
lado JS (`main.js`) reconhece por `linha.startsWith("PROGRESS:")`,
remove do log bruto e usa para atualizar a barra. Não adotado nenhum
protocolo de IPC mais sofisticado (ex.: um segundo file descriptor,
NDJSON dedicado) — o par stdout/pipe já usado pelo Tauri
(`Command.stdout.on("data", ...)`) já entrega linha a linha de forma
confiável (comportamento já em uso desde a Fase 4, com o log bruto
funcionando), e introduzir um canal separado exigiria mudar a forma como
o sidecar é invocado (`Command.sidecar`), sem nenhum ganho real dado que
o volume de dados é pequeno (uma linha JSON curta por página, no máximo
uma por página de um livro de milhares de páginas).

### As 3 fases visíveis não têm o mesmo tipo de sinal — decisão calibrada com tempo real medido

O meta-prompt original pedia 3 fases "visíveis", mas os dados reais desta
fase mostram que elas não são equivalentes:

1. **`ocr`** (OCR/extração nativa + análise de cabeçalhos, `primeira_passada()`):
   sinal granular real (página atual/total), e é a fase que domina o
   tempo total em todo livro testado (ver validação abaixo) — a única
   com uma barra 0-100% "de verdade" alimentada por progresso real do
   próprio trabalho.
2. **`html`** (montagem do HTML, `construir_html()`): **sem contador
   granular** — decisão tomada com dado real, não suposição: medido em
   produção que essa fase leva bem menos de 1 segundo mesmo no livro de
   903 páginas (PEREIRA) — no log real da validação, `Passo 2/2` e o
   início da compilação Calibre aparecem no mesmo timestamp de 2 casas
   decimais. Não vale a pena (nem seria honesto) desenhar uma barra
   0-100% para uma fase que non tem trabalho incremental observável;
   fica com `"total":0` (sinalizando à UI o modo indeterminado/spinner).
3. **`epub`** (compilação Calibre, `convert_to_ebook()`): o Calibre
   emite só **3 marcas fixas** de porcentagem no seu próprio stdout —
   `1% Converting input to HTML...`, `34% Running transforms on
   e-book...`, `67% Running EPUB Output plugin` — confirmado em
   múltiplas execuções reais (livro de 5 páginas e de 903 páginas,
   mesmas 3 marcas, mesmos valores exatos, nas duas escalas). Não é uma
   progressão contínua — a barra "pula" entre essas 3 marcas, o que é
   fiel ao sinal real do Calibre, não um defeito da implementação.
   Achado real relevante: no livro de 903 páginas, a marca `67%` ficou
   parada por **~66 segundos** (`74.94s` a `141.32s`, durante
   `"Splitting markup on page breaks... Split into 903 parts"`) — a
   barra desta fase fica parada nesse valor por um tempo real
   perceptível em livros grandes, comportamento esperado do próprio
   Calibre, não um travamento da UI.

`convert_to_ebook()` precisou trocar de `subprocess.run(cmd,
check=True)` (saída herdada direto pelo fd, sem chance de interceptar)
para `subprocess.Popen(..., stdout=PIPE, stderr=STDOUT)` com um laço que
imprime cada linha (preservando o log bruto idêntico a antes) e, quando
a linha bate `^\d{1,3}%\s`, emite a `PROGRESS:` correspondente. O
`check=True` original (levanta `CalledProcessError` em código de saída
não-zero) foi preservado manualmente com `processo.wait()` + checagem de
`codigo != 0`.

### Implementação (lado UI)

`desktop/src/index.html`: 3 linhas de fase (OCR+análise, Montagem do
HTML, Compilação EPUB), cada uma com nome, contador textual e barra.
`desktop/src/styles.css`: fase ativa/concluída com opacidade e check
(✓); barra indeterminada com animação de "varredura" contínua (`@keyframes
barra-indeterminada`) para a fase `html`, que não tem número real para
mostrar. `desktop/src/main.js`: `processarLinha()` intercepta linhas
`PROGRESS:`, faz `JSON.parse` e chama `atualizarProgresso(fase, atual,
total)`, que marca fases anteriores na ordem fixa (`ocr` → `html` →
`epub`) como concluídas e atualiza a barra/contador da fase atual;
linhas malformadas (JSON inválido) caem de volta para o log bruto em vez
de quebrar a UI.

### Validação (dados reais, 2026-09-04)

Rodado o binário do sidecar reconstruído (idêntico, por checksum, ao
embutido em `Foliant.app` após rebuild) diretamente via um harness que
lê o stdout linha a linha com timestamp, contra os 3 livros de
calibração do projeto.

**PEREIRA (903 páginas, caminho nativo em quase todo o livro)**:
- Exit code 0, tempo total **144,29s**, 910 linhas `PROGRESS:` emitidas.
- Streaming confirmado em tempo real: primeira marca de página (20/903)
  em 5,84s, última (903/903) em 69,56s — atualizações a cada ~1,5-2s ao
  longo de toda a fase OCR, não em blocos.
- Fase `epub`: marca `67%` parada de 74,94s a 141,32s (~66s) durante o
  split do HTML em 903 partes — comportamento real do Calibre nesta
  escala, documentado acima.
- **Zero regressão**: `.epub` extraído tem 903 arquivos HTML e 10578
  tags `<p>` — idêntico ao baseline já registrado na Fase 4.5 para este
  mesmo livro (10578 parágrafos).

**Livro de 208 páginas e livro de 80 páginas (100% via caminho OCR)**:
validados contra `samples/livro_completo_208pg.pdf` e
`samples/001-080.pdf`. A máquina de desenvolvimento (Intel Core m3
dual-core, 0,9GHz, sem ventoinha) estava sob contenção real de CPU
durante boa parte do teste de 208 páginas (múltiplas sessões do Claude
Code, navegador e editor abertos simultaneamente pelo usuário; `pmset -g
therm` confirmou `CPU_Speed_Limit = 50` — throttling térmico ativo — e
`load average` de ~33 num par de núcleos), fazendo o tempo por página
variar de forma não representativa do throughput normal da máquina
(chegou a ~20-24s por página em certos trechos, contra ~6-9s/página do
baseline histórico documentado nas Fases 2-4). Isso não é uma regressão
desta fase — as linhas `PROGRESS:` continuaram chegando em tempo real
mesmo sob contenção (streaming confirmado por timestamp em todo o
teste), só o throughput ficou mais baixo que o baseline. O teste de 80
páginas, rodado depois com menos contenção concorrente, ficou bem mais
próximo do baseline histórico:

| Livro | Páginas | Exit | Tempo total | Linhas PROGRESS | HTMLs no epub | `<p>` | Páginas confirmadas | Baseline (HTMLs/páginas) |
|---|---|---|---|---|---|---|---|---|
| PEREIRA | 903 | 0 | 144,29s (2m24s) | 910 | 903 | 10578 | 903/903 | 903 HTMLs, 10578 `<p>` (Fase 4.5) — **idêntico** |
| `livro_completo_208pg.pdf` | 208 | 0 | 2202,57s (36m43s)* | 215 | 195 | 1205 | 208/208 | 195 HTMLs, 1205 `<p>` (Fase 4/4.5) — **idêntico** |
| `samples/001-080.pdf` | 80 | 0 | 616,62s (10m17s) | 87 | 76 | 481 | 80/80 | 76 HTMLs (Fase 4) — **idêntico** |

\* tempo inflado por contenção real de CPU, não representativo do
throughput normal da máquina — ver acima.

Zero regressão em nenhum dos 3 livros: contagem de HTMLs (que o Calibre
gera ao dividir o EPUB por tamanho) e de parágrafos idêntica aos
baselines já registrados nas Fases 4/4.4/4.5, TOC com a mesma contagem
de capítulos já validada (8 entradas em 80 páginas, 26 em 208 páginas —
ambos batendo com a Fase 3), e streaming confirmado por timestamp real
em tempo real nos 3 casos (não em blocos de minutos como o sintoma
original).

### Limitações conhecidas

- Causa raiz exata de `PYTHONUNBUFFERED=1` não funcionar dentro do
  bootloader PyInstaller `--onefile` não foi isolada (ver risco residual
  acima) — a correção adotada (`reconfigure`) é robusta e testada, mas
  não vem acompanhada de uma explicação completa do porquê da alternativa
  falhar.
- A fase `epub` reflete fielmente as 3 marcas que o Calibre emite — não
  há como suavizar isso numa progressão mais granular sem inventar
  números que o próprio Calibre não fornece (o que seria menos honesto
  que uma barra "pulando" entre marcas reais).
- Validação de streaming em tempo real e ausência de regressão de
  parágrafos/páginas está **completa e fechada** nos 3 livros de
  calibração (PEREIRA 903p, 208p, 80p) — ver tabela acima. O teste de
  208 páginas rodou sob contenção real de CPU da máquina do usuário
  (múltiplas sessões/apps abertas simultaneamente), inflando o tempo
  total sem afetar a validade do streaming em si (confirmado por
  timestamp) nem a integridade do conteúdo (contagens idênticas ao
  baseline).
- Confirmação visual direta da UI (barras realmente desenhando na tela,
  animação da fase indeterminada) não foi possível nesta sessão — mesma
  limitação de automação de acessibilidade contra binário não assinado
  já documentada nas Fases 4.1-4.3 (`tccd` nega a automação,
  `screencapture` não mostra a janela do app neste ambiente de teste).
  Validado por evidência indireta forte (mecanismo de entrega idêntico
  ao já usado com sucesso desde a Fase 4.2 para o log bruto) mas
  pendente de um clique manual do usuário no `.app` reinstalado para
  fechar o critério de aceite com 100% de confiança — mesmo padrão já
  usado nas Fases 4.1-4.3 para esse tipo de limitação.

## Inspeção de qualidade: 4º livro de teste real, 1º em inglês (2026-09-04)

**Contexto**: `Fundamentals of Data Engineering (Third Early Release)`
(Joe Reis & Matt Housley), 210 páginas, processado pelo `.app` real com
`--lang por` (o app ainda não detecta idioma automaticamente — Parte 2
do backlog de UI/UX, ver seção anterior). Primeiro livro de teste em
inglês do projeto; os 3 anteriores (Gil 80/208pg, PEREIRA 903pg) são
todos em português. Inspeção pura — nenhuma correção de código aplicada
nesta rodada, conforme escopo definido.

### Achado 0 (pré-requisito): este PDF não é "provavelmente escaneado" — é quase 100% nativo

Antes de investigar qualidade de OCR em inglês, checado com dado real
(`pagina.get_text("text")` para as 210 páginas) qual caminho cada
página realmente usa: **203 de 210 páginas (96,7%) têm texto nativo
real** — só **7 páginas usam o caminho OCR** (pg-1, 11, 19, 28, 113,
154, 159), e as 7 são páginas de imagem cheia (gráficos/infográficos,
`get_images()` retorna exatamente 1 imagem cobrindo a página inteira em
cada uma, texto nativo vazio). Isso muda a premissa do item 1 do
meta-prompt original ("amostrar 4-5 páginas do meio do livro, caminho
OCR") — não há prosa real passando pelo caminho OCR neste livro para
comparar contra o baseline em português.

### Item 1 — qualidade do OCR em inglês com o modelo `por`: sem amostra de prosa disponível neste livro

Dado que só 7 páginas usam OCR e todas são gráficos/infográficos sem
prosa, não há como avaliar "qualidade de reconhecimento de texto
corrido em inglês" a partir deste livro especificamente — o resultado
é sobre um tipo de conteúdo (rótulos de eixo, texto embutido em
imagem, muito degradado mesmo antes de qualquer questão de idioma) que
não representa prosa normal em nenhum idioma. Texto OCR real das 7
páginas, para registro:

| Página | Conteúdo da imagem | Texto OCR (`por`), amostra |
|---|---|---|
| pg-11 | Gráfico Google Trends | `"CoogeTends Ene", "À bigéita", "Sea tem", "United States 1"` |
| pg-19 | Infográfico "Data Science Hierarchy of Needs" | `"TRE DATA SCIENCE", "AJSTESTNG", "SUPIE ML ALSORTANS"` |
| pg-28 | Gráfico de barras (ocupações em crescimento) | `"Fetest Grong Tech Oocupatins (4)"`, resto ruído simbólico |
| pg-113 | Gráfico/tabela | `"isa pm", "Vain 20 October 01", "ARMA AKONONCHA"` |
| pg-154 | Diagrama do ciclo de vida | `"Data Engineering Lie Cycle", "GENERATION", "UNDERCURRENTS"` (parcialmente legível) |
| pg-159 | Gráfico "Bounded Data" | `"Bounded Data"`, resto numérico/símbolos |

**Observação real, não conclusiva**: em pg-113, o modelo `por` produziu
fragmentos com "cara" de português mesmo lendo conteúdo majoritariamente
numérico/inglês em imagem (`"ARMA AKONONCHA"`, `"Vain 20 October"`) —
consistente com o corretor de idioma do Tesseract enviesando glifos
ambíguos para formas mais próximas do dicionário `por`. Não é uma prova
controlada (o conteúdo já estava muito degradado por ser gráfico, não
texto), mas é um sinal a favor de que usar `por` para ler inglês real
provavelmente distorce mais do que o neutro esperado — só não há dado
deste livro que isole esse efeito de forma limpa.

**Implicação real para a decisão da Parte 2**: para este tipo de
documento — PDF "born-digital" de e-book early-release, texto nativo
quase completo — a escolha de idioma do OCR importa muito pouco na
prática, porque o caminho nativo (que domina 96,7% do livro) é
extração de texto direta, sem OCR, portanto sem nenhuma dependência de
idioma. Isso não testa nem invalida a necessidade de detecção de
idioma para PDFs **escaneados** em inglês (nenhum existe ainda no
projeto) — só mostra que, para a classe de PDF nativo/early-release,
a urgência da Parte 2 é menor do que se assumia.

### Item 2 — padrão confirmado: legenda/rótulo de figura corrompido promovido a "título de capítulo" (2ª ocorrência)

Confirma o padrão já visto no livro do Gil (`ARCHITECTURE.md`, Fase 3,
`"COMO DELINEAR UM Ed tita: DE CRIQRLES"`, página do fluxograma
índice 105). Aqui: `PROGRESS`/log real mostrou `Detected chapter:
Fetest Grong Tech Oocupatins (4)` — o TOC do `.epub` confirma isso como
entrada real (`toc.ncx`, `playOrder="3"`, entre "Chapter 1" e "Chapter
2").

**Estrutura confirmada com dado real** (`pagina.get_text("text")` e
`pytesseract.image_to_data()` reais para a página, não suposição):
pg-28 tem **zero texto nativo** e **exatamente 1 imagem** cobrindo a
página inteira (um gráfico de barras) — estrutura idêntica à página do
fluxograma do Gil (`get_images()` também retornava "a página inteira"
lá, conforme já documentado na Fase 4.5). O OCR dessa imagem produz 24
"linhas" — a esmagadora maioria são fragmentos de 1-4 caracteres
(rótulos de eixo, marcas de grade do gráfico mal lidos: `"|"`, `"s"`,
`"="`, `"Ea"`, `"EE"`...):

| Linha OCR | Altura (px) | Razão à mediana da página | Nº caracteres |
|---|---|---|---|
| `"Fetest Grong Tech Oocupatins (4)"` (promovida a título) | 59,0 | **2,11x** | 33 |
| `"PE NO Gon Pet)"` | 52,0 | 1,86x | 14 |
| `"=="` (ruído puro) | 186,0 | **6,64x** | 2 |
| `"E MR"` | 83,0 | 2,96x | 4 |
| `"EE"` (ruído puro) | 82,0 | 2,93x | 2 |
| mediana da página | **28,0** | 1,0x (referência) | — |

**Mecanismo confirmado**: a mediana de 28,0px, usada como linha de base
para o critério de título (`LIMIAR_RAZAO_TITULO = 2.0`), é ela mesma
calculada sobre uma população quase toda ruído — não existe "corpo de
texto real" nesta página para servir de referência (é uma imagem cheia,
sem prosa nenhuma). Contra essa mediana degenerada, o único fragmento
razoavelmente legível e comprido o bastante (`"Fetest Grong Tech
Oocupatins (4)"`, 33 caracteres — na prática é o título/legenda embutido
no próprio gráfico, "Fastest Growing Tech Occupations") cruza a razão
de 2,11x e o mínimo de caracteres (`LIMIAR_TITULO_MIN_CHARS = 6`).
Fragmentos ainda mais desproporcionais (`"=="` a 6,64x, `"EE"` a 2,93x)
só não são promovidos porque são curtos demais (2 caracteres) — ou seja,
o filtro de comprimento mínimo é o único motivo de não haver MAIS
falsos positivos nesta mesma página, não o critério de altura.

**A legenda real da figura sobreviveu, ilesa, na página SEGUINTE**: `pg-29`
contém, como texto nativo normal, `"Figure 1-10. Data engineering is the
fastest-growing tech occupation (2020)"` — a legenda de verdade (correta,
sem ruído) está descrita em prosa na página seguinte à imagem, não
extraída da própria imagem. O que virou "título de capítulo" é uma
leitura ruidosa de texto **dentro do próprio gráfico** (provavelmente o
título do gráfico em si, renderizado em fonte grande dentro da imagem),
não a legenda real do livro.

**O que as duas ocorrências (Gil pg-105, este livro pg-28) têm em
comum, estruturalmente**:
1. A página inteira é **uma única imagem** (`get_images()` retorna 1
   imagem cobrindo ~100% da área da página) — sem nenhum texto nativo.
2. O OCR dessa imagem produz uma população de "linhas" dominada por
   ruído de 1-4 caracteres (rótulos de eixo, elementos decorativos,
   fragmentos de diagrama) — não uma distribuição de alturas de "corpo
   de texto real" que o critério de mediana pressupõe implicitamente.
3. Um fragmento de tamanho de fonte incomum mas comprimento
   "razoável" (aqui, texto embutido no próprio gráfico/figura) cruza os
   dois filtros (altura E comprimento) por coincidência, sem ser um
   título de capítulo de verdade.

**Sinal adicional investigado, conforme pedido no item 2 — "proximidade
de imagem extraída" já é, na prática, o MESMO sinal que identifica a
página como candidata a este defeito**: como `extrair_capa()` (Fase 4.5)
já usa `get_images()` por página, um sinal de baixo risco e
estruturalmente fundamentado seria: **antes de aceitar um título
detectado por `detectar_titulo()` no caminho OCR, checar se a página já
foi identificada como "página de imagem cheia" (native text vazio E
`get_images()` cobrindo quase 100% da área da página) — se sim, suprimir
a detecção de título nessa página inteira**, não só o candidato
específico. Diferente da tentativa de supressão de glifo decorativo já
tentada e abandonada na Fase 4.5 (colidia com texto real de altura
parecida, ex. `"se"` a 2,73x), este sinal não usa altura/razão como
critério — usa a AUSÊNCIA de texto nativo combinada com a presença de
uma imagem de página inteira, que é uma propriedade estrutural da
página, não do fragmento de texto individual. **Não implementado nesta
rodada** (fora de escopo — tarefa de inspeção), mas é a direção
recomendada mais promissora encontrada até agora para este padrão,
porque ataca a causa estrutural (página é 100% figura) em vez de tentar
achar mais um limiar de altura que sobreviva a mais um caso real.

> **RISCO RESIDUAL — 2 ocorrências em 2 livros diferentes confirma
> padrão, não uma prova geral.** Ambas as ocorrências conhecidas
> (Gil pg-105, FDE pg-28) são páginas de figura/gráfico de página
> inteira. Não se sabe se o sinal proposto (native vazio + imagem
> cobrindo a página) cobriria 100% dos casos futuros sem nunca gerar
> falso positivo do lado oposto (suprimir um título real que
> genuinamente caia numa página com imagem grande) — não testado.

### Item 3 — TOC (6 entradas, 210 páginas): confirmado, bate com a hipótese do meta-prompt

TOC real (`toc.ncx`): **6 entradas** — "Fundamentals of Data
Engineering" (capa/título, `playOrder=1`), "Chapter 1. Data Engineering
Described", "Fetest Grong Tech Oocupatins (4)" (o falso positivo do
item 2), "Chapter 2. The Data Engineering Lifecycle", "Chapter 3.
Choosing Technologies Across the Data Engineering Lifecycle", "Chapter
4. Ingestion". Confirma exatamente a hipótese do meta-prompt: título do
livro + 4 capítulos reais + 1 legenda corrompida = 6. **Nenhum capítulo
real ficou de fora do TOC** — os 4 capítulos genuínos deste early
release estão todos presentes e corretamente nomeados (o nome do
capítulo, extraído do texto nativo real, saiu perfeito nos 4 casos —
diferente da legenda corrompida, que só existe porque veio do caminho
OCR de uma imagem).

A entrada 1 (`"Fundamentals of Data Engineering"`, o título do livro na
capa) também é um título de capítulo detectado — comportamento
consistente com o `livro_split_000.html` sendo a página de rosto (não
um erro; mesmo tipo de entrada de título já aparece nos livros de
calibração em português quando a capa/rosto tem uma linha de texto
grande o bastante para cruzar `LIMIAR_RAZAO_TITULO`).

### Item 4 — cabeçalho repetido em inglês: **falso positivo real confirmado, não apenas perda de recall**

Log real da análise de cabeçalhos (`agrupar_cabecalhos`, 210 páginas):
**só 2 clusters cruzaram `LIMIAR_CABECALHO_MINIMO = 3`** — todos os
outros ~90 clusters distintos observados têm contagem 1-2. Isso por si
só já é forte evidência a favor da explicação (a) já registrada como
ambígua na Fase 4.3 para o PEREIRA: **este livro genuinamente não tem
cabeçalho de página repetido** (formato early-release de e-book, cada
página começa direto no meio da prosa corrida, sem cabeçalho de seção
impresso como nos livros de calibração em português). Essa é a 2ª
confirmação real dessa explicação, em 2 livros/formatos diferentes.

**Mas os 2 clusters que CRUZARAM o limiar não são cabeçalhos reais —
são falsos positivos, com conteúdo real removido do EPUB, confirmado
por inspeção do HTML final:**

**Cluster 1** (contagem=3): `'fundamentals of data'`, `'fundamentals of
data engineering'`, `'this book provides a snapshot of data engineering
today to the fullest'` — 3 frases de páginas DIFERENTES e sem relação
estrutural (título da capa + primeira frase real da introdução), sem
nada em comum a não ser vocabulário temático do livro inteiro.

Confirmado no PDF original (`pagina.get_text`) e no `.epub` gerado que
a linha foi de fato removida, **cortando uma frase real ao meio**:

| | Conteúdo |
|---|---|
| PDF original, pg-7, início | `"This book provides a snapshot of data engineering today. To the fullest\nextent, we're focusing on..."` |
| `.epub` gerado, pg-7 | `<p>extent, we're focusing on the "immutables" of data engineering...</p>` — **começa cortado no meio da frase**, a primeira sentença inteira ("This book provides a snapshot of data engineering today.") sumiu |

**Cluster 2** (contagem=3): `'figure 21 components and undercurrents of
the data engineering lifecycle'`, `'figure 27 the major undercurrents of
data engineering'`, `'undercurrents'` — 3 legendas de figuras
DIFERENTES (Figura 2-1 e Figura 2-7) mais uma linha solta ("Undercurrents",
provavelmente um subtítulo de seção em outra página), sem serem o mesmo
cabeçalho.

| | Conteúdo |
|---|---|
| PDF original, pg-53, início | `"Figure 2-1. Components and undercurrents of the data engineering lifecycle\nThe Data Lifecycle Versus the Data Engineering Lifecycle"` |
| `.epub` gerado, pg-53 | `<p>The Data Lifecycle Versus the Data Engineering Lifecycle</p>` — a legenda real da Figura 2-1 **desapareceu por completo** |

**Causa raiz identificada com precisão, não suposição** —
`_STOPWORDS_CABECALHO` (linha ~211) é **uma lista só de stopwords em
português** (`"como", "a", "as", "o", "os", "um", "uma", "de", "e",
"que", "do", "da", "dos", "das", "em", "para"`). Para texto em inglês,
palavras funcionais como `"of"`, `"the"`, `"to"`, `"this"`, `"and"`
**nunca são filtradas** e sobrevivem em `palavras_conteudo()` como se
fossem palavras de conteúdo reais — inflando artificialmente a
similaridade de contenção entre frases sem relação de verdade, só por
compartilharem o vocabulário genérico do livro inteiro ("data
engineering", que aparece em quase toda página de um livro cujo assunto
é exatamente esse).

**Confirmado por simulação direta com o código de produção** (não só
teoria): recalculado `similaridade_cabecalho()` para o par do Cluster 1
removendo manualmente `"of"` da lista de palavras de conteúdo:

| Par | Similaridade real (stopwords atuais, só PT) | Similaridade simulada (com "of"/"the"/"to"/"this" como stopword) |
|---|---|---|
| Cluster 1 (`"This book provides..."` vs. `"Fundamentals of Data Engineering"`) | **0,75** (cruza o limiar 0,70) | **0,667** (fica ABAIXO do limiar — não teria clusterizado) |
| Cluster 2 (`"Figure 2-1..."` vs. `"Figure 2-7..."`) | **0,857** | **0,80** (continua acima do limiar — a correção de stopwords sozinha NÃO resolveria este caso) |

Ou seja: a lacuna de stopwords em inglês explica e resolveria o
Cluster 1 de forma direta e calibrada (dado real, não estimativa), mas
**não é suficiente sozinha** para o Cluster 2 — ali a colisão vem de
sobreposição de vocabulário genuinamente temática ("figure", "data",
"engineering", "undercurrents" aparecendo em várias legendas de figura
do mesmo capítulo), um problema estrutural diferente (não é sobre
stopwords, é sobre um livro com vocabulário muito concentrado tendo
poucas palavras de conteúdo "distintivas" o bastante por linha curta).

**Achado adicional sobre o Cluster 2**: a linha isolada `"Undercurrents"`
(uma única palavra de conteúdo) bate 100% de contenção contra QUALQUER
linha mais longa que contenha essa palavra — o mesmo mecanismo de
"encadeamento por fragmento curto" já corrigido para OCR truncado na
Fase 2 (canônico = membro com mais palavras), mas aqui o "fragmento
curto" não é truncamento de OCR, é uma linha real e completa (um
subtítulo de seção de uma só palavra) — o `canonico` do cluster (a
legenda mais longa) acaba absorvendo essa linha de conteúdo genuíno
comparando contra si mesma, não contra um fragmento degradado.

> **RISCO RESIDUAL — primeiro falso positivo REAL confirmado do
> detector de cabeçalho, não apenas hipotético.** Diferente do risco já
> registrado na Fase 2 (cenário hipotético de "frase de transição
> incidental repetida" nunca observado), este é um caso real, observado,
> com conteúdo genuíno removido do EPUB. Livros com vocabulário muito
> concentrado num tema único (comuns em não-ficção técnica/monografias)
> e SEM cabeçalho estrutural real (o que já reduz a barra de contagem
> mínima para praticamente qualquer coincidência de 3 páginas) são o
> perfil de risco identificado. **Direção de correção recomendada, não
> implementada nesta rodada** (fora de escopo — tarefa de inspeção):
> (1) unir a lista de stopwords em português com uma lista equivalente
> em inglês (resolve o Cluster 1, calibrado e confirmado acima); (2)
> para o padrão do Cluster 2 (vocabulário temático genuinamente
> compartilhado), considerar não tratar como cabeçalho quando NENHUM par
> de membros do cluster bate numa comparação mais rigorosa (ex.: um
> limiar de similaridade mais alto, ou uma exigência de que o cluster
> tenha pelo menos 1 repetição EXATA da string normalizada, não só por
> contenção) — não calibrado, precisa de mais exemplos reais antes de
> qualquer mudança de limiar (mesma disciplina já usada para os outros
> limiares deste arquivo).

### Item 5 — formatação de parágrafo (recuo/zigue-zague): sem regressão, generaliza bem

Inspecionadas páginas de prosa corrida em pontos espalhados do livro
(pg-7, pg-30, pg-80, pg-150) — todas com parágrafos grandes e coesos
num só `<p>`, sem o padrão de zigue-zague (um `<p>` por linha física)
já corrigido na Fase 4.4. Livro 100% caminho nativo nas páginas de
prosa (só as 7 páginas de imagem cheia usam OCR — ver Achado 0), então
o critério exercitado é o `LIMIAR_RECUO_DELTA_PONTOS_NATIVO` (calibrado
originalmente só contra o PEREIRA) — **esta é a segunda validação
end-to-end real desse critério nativo, contra um segundo livro,
diferente do único usado na calibração original**, reduzindo (mas não
eliminando) o risco residual já registrado na Fase 4.4 sobre esse
critério ter sido calibrado com só 1 livro.

Achado incidental menor, não uma regressão: em pg-80, um fragmento
solto (`"2"`, provavelmente número de nota de rodapé) sobrevive como um
`<p>` próprio de 1 caractere, separado do parágrafo principal —
cosmético, mesma categoria de ruído residual já aceita em outras partes
do pipeline (ex. dígitos de sumário, Fase 1).

### Achado incidental: capa real, 3ª validação bem-sucedida

Confirmado (não só relatado pelo usuário): proporção da página 0
(0,7727) vs. imagem embutida (0,7624, diferença 1,3%) — dentro da
tolerância de 15% (`TOLERANCIA_PROPORCAO_CAPA`). Terceira validação
bem-sucedida da extração de capa da Fase 4.5 (depois de Gil 208pg e
PEREIRA 903pg), agora também confirmada num livro nativo estrangeiro.

### Resumo — nenhuma correção aplicada, 2 achados acionáveis registrados para o backlog

1. **Legenda/rótulo corrompido promovido a título** (item 2): padrão
   confirmado em 2 livros. Direção recomendada: suprimir detecção de
   título em páginas 100%-imagem (native vazio + `get_images()` cobrindo
   quase toda a área da página).
2. **Falso positivo real de cabeçalho** (item 4): stopwords em inglês
   ausentes causam pelo menos 1 caso confirmado de remoção de conteúdo
   real. Direção recomendada: unir lista de stopwords PT+EN (resolve o
   Cluster 1, confirmado por simulação); Cluster 2 precisa de uma
   segunda mudança, ainda não calibrada.

Nenhuma das duas foi implementada nesta rodada — inspeção, não correção,
conforme escopo definido no meta-prompt desta tarefa.

## Robustez das heurísticas de texto para português + inglês (2026-09-04)

Tarefa de correção (não mais inspeção), motivada pelos 2 achados da
inspeção acima. Escopo reformulado: não é "escolher o idioma certo pro
Tesseract" (já investigado e rebaixado de prioridade — livros
nativos/early-release quase não passam por OCR), é robustez das
heurísticas de TEXTO (clustering de cabeçalho/título) a português E
inglês, já que o problema afeta texto já corretamente extraído.

### Passo 0 — baseline real desta sessão, antes de qualquer mudança

Rodado o pipeline ATUAL (sem nenhuma mudança desta tarefa ainda) nos 3
livros de calibração em português, salvando `.epub`/logs como baseline
desta rodada específica — não reaproveitado nenhum resultado de sessão
anterior, mesmo documentado, para garantir que a comparação é contra o
estado real e atual do código:

| Livro | TOC gerado | Confere com histórico? |
|---|---|---|
| `samples/001-080.pdf` (80p) | 8 entradas | Sim (Fase 3) |
| `samples/livro_completo_208pg.pdf` (208p) | 26 entradas | Sim (Fase 3) |
| PEREIRA (903p) | 28 entradas | Sim (Fase 4.5) |

### Parte 1 — stopwords PT+EN no clustering de similaridade

**Implementado**: `_STOPWORDS_CABECALHO` dividida em
`_STOPWORDS_CABECALHO_PT` (lista original, inalterada) e
`_STOPWORDS_CABECALHO_EN` (18 palavras funcionais comuns em inglês —
"the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "is",
"are", "this", "that", "with", "as", "by", "at"), unidas por `|`.

**Confirmado por simulação e depois pela execução real** (não só teoria)
contra o par que motivou a correção:

| Par (Cluster 1, FDE) | Similaridade antes | Similaridade depois |
|---|---|---|
| `"This book provides a snapshot..."` vs. `"Fundamentals of Data Engineering"` | 0,75 (cruzava o limiar) | **0,667** (abaixo do limiar) |

Revalidado rodando `primeira_passada()` real (não uma função isolada)
contra o PDF do FDE com o código corrigido: o cluster que continha essas
duas frases não existe mais — `"This book provides a snapshot..."`
aparece agora como singleton (`contagem=1`), `"Fundamentals of Data /
Fundamentals of Data Engineering"` como outro singleton de `contagem=2`,
nenhum dos dois cruzando o mínimo de 3. **Confirmado, não apenas
simulado**: a frase real da introdução do livro deixa de ser removida do
EPUB.

### Parte 1.2 — Cluster 2 investigado, correção NÃO implementada (falta de calibração)

Recalculada a similaridade do Cluster 2 (duas legendas de figura
diferentes — Figura 2-1 e Figura 2-7 — mais um subtítulo solto,
"Undercurrents") com as stopwords em inglês já somadas: **0,80** — ainda
acima do limiar de 0,70. A união de stopwords sozinha não resolve este
caso porque a colisão aqui não vem de palavras funcionais contaminando o
cálculo, vem de vocabulário de conteúdo genuinamente compartilhado
("figure", "data", "engineering", "undercurrents" aparecendo em
legendas de figura diferentes do mesmo capítulo).

Investigado um sinal adicional candidato: **razão de tamanho entre os
dois conjuntos de palavras**. O par de truncamento OCR real já calibrado
na Fase 2 (`"como encaminhar"` vs. `"como encaminhar uma pesquisa"`) tem
razão de tamanho 2,0 (um conjunto bem menor que o outro — perfil
esperado de truncamento); o Cluster 2 tem razão 1,2 (conjuntos quase do
mesmo tamanho — não tem o perfil de um fragmento truncado). Essa
diferença é real e mensurável, mas **é baseada em só 1 exemplo de cada
categoria** — não o suficiente para calibrar um limiar de razão de
tamanho sem risco de overfitting a essa única amostra (mesma disciplina
já aplicada a outros limiares deste projeto, ex. a colisão "x*"/"se" da
Fase 4.5).

> **Decisão**: não implementar uma correção para o Cluster 2 nesta
> rodada. Registrado como risco residual conhecido, com direção de
> correção concreta (sinal de razão de tamanho, ou exigir 1 repetição
> exata da string normalizada) para quando houver mais exemplos reais
> desse padrão específico.

### Parte 1.3 — varredura do arquivo por outras heurísticas só-português

Revisado todo `foliant.py` em busca do mesmo padrão (lista/regra
hardcoded assumindo português). `_RE_RUIDO_INICIAL` (ruído decorativo),
`normalizar_linha()` e `similaridade_cabecalho()` são mecanicamente
agnósticos a idioma (classes de caracteres e coeficiente de conjunto,
não palavras específicas) — `_STOPWORDS_CABECALHO` era a única lista de
palavras hardcoded no arquivo.

**Achado adicional, fora do escopo do clustering, mas do mesmo padrão
geral ("pressuposto de português nunca declarado")**: `HTML_HEADER`
(linha ~122) tem `<html lang="pt-BR">` fixo, independente do idioma real
do conteúdo do livro. Para o FDE (livro em inglês), o EPUB gerado
declara `lang="pt-BR"` no HTML — metadado de acessibilidade incorreto
(leitores de tela usam esse atributo para escolher regras de
pronúncia/hifenização). **Não corrigido nesta rodada**: a forma correta
de preencher esse atributo dependeria de detecção de idioma do livro
(a própria Parte 2 do backlog de UI/UX, ainda não implementada) — mapear
o `--lang` do Tesseract (código de idioma do MOTOR de OCR, não
necessariamente o idioma do livro) para o atributo HTML seria uma
correção parcial e potencialmente enganosa. Registrado como risco
residual conhecido, não implementado.

### Parte 2 — supressão de título em página 100%-imagem: investigado e ABANDONADO (reversão de recomendação anterior)

A inspeção anterior (seção acima) recomendava suprimir a detecção de
título em páginas identificadas como "100% imagem" (native vazio +
`get_images()` cobrindo quase toda a página), usando o mesmo sinal que
`extrair_capa()` (Fase 4.5) já usa. **Essa recomendação foi testada
contra mais dados reais nesta rodada e não se sustentou** — registrado
aqui como reversão explícita, não escondido.

**Achado que invalida a recomendação anterior**: a página 1 do FDE (a
CAPA do livro, onde o título `"Fundamentals of Data Engineering"` é
**corretamente** detectado e desejado) também é 100% imagem — cobertura
de imagem de **100%** (mais alta até que a página do gráfico defeituoso,
58%). Qualquer limiar de cobertura de imagem que suprimisse a página do
gráfico também suprimiria essa detecção correta da capa.

| Página | Cobertura de imagem | Classificação desejada |
|---|---|---|
| FDE pg-1 (capa) | **100%** | preservar (título correto) |
| FDE pg-28 (gráfico, defeito conhecido) | 58% | suprimir |
| Gil pg-106 (fluxograma, defeito conhecido) | 166%* | suprimir |

\* >100% porque o retângulo da imagem, num livro 100% escaneado,
frequentemente extrapola levemente a caixa de corte da página.

**Segundo sinal testado, também não generaliza**: volume de texto OCR
(caracteres/palavras reconhecidos) e confiança média do OCR (`conf` do
Tesseract). Separam bem o caso do FDE (86 caracteres, confiança 52,7 —
bem abaixo do normal) mas **não** o caso já conhecido do Gil: a página
do fluxograma tem volume de texto (1089 caracteres, 171 palavras) e
confiança (94,2) comparáveis a uma página de prosa real (pg-21: 1496
caracteres, confiança 95,8) — o Tesseract lê os rótulos internos do
diagrama como palavras reais, com confiança alta, só que semanticamente
sem sentido (não é ruído de baixa confiança, é leitura "correta" de
conteúdo decorativo).

| Página | Volume (chars) | Confiança OCR média | Classificação |
|---|---|---|---|
| Gil pg-21 (prosa real) | 1496 | 95,8 | preservar |
| Gil pg-106 (fluxograma, defeito) | 1089 | **94,2** | suprimir (mas sinal não separa) |
| FDE pg-1 (capa, correto) | — (100% imagem) | 91,6 | preservar |
| FDE pg-28 (gráfico, defeito) | 86 | **52,7** | suprimir |

**Conclusão**: os dois casos reais conhecidos de "legenda corrompida
promovida a título" (Gil pg-106, FDE pg-28) **não compartilham o mesmo
perfil de sinal** — superficialmente parecem o mesmo padrão (página de
imagem cheia, título espúrio), mas ao medir com dado real, um é
"conteúdo semanticamente errado mas com alta confiança/volume de OCR" e
o outro é "conteúdo de baixíssima confiança/volume". Nenhum dos 3 sinais
testados (cobertura de imagem, volume de texto, confiança OCR) separa os
2 casos reais sem arriscar suprimir detecções corretas (a capa do FDE,
ou títulos reais de páginas escaneadas normais do Gil/PEREIRA — TODA
página desses livros 100%-escaneados também é "imagem cobrindo a
página").

> **Decisão, análoga à Fase 4.5 ("investigado e abandonado")**: não
> implementada nenhuma supressão de título por sinal estrutural. Os 2
> casos conhecidos continuam sem correção — mesmo estado de antes desta
> rodada, sem regressão (nunca foram suprimidos, continuam não sendo).
> Não reabrir com os mesmos 3 sinais (cobertura de imagem, volume de
> texto, confiança OCR) sem um sinal novo que separe os 2 casos reais
> conhecidos sem colidir com a capa do FDE ou com os títulos corretos
> dos livros 100%-escaneados.

### Validação final (Passo 0 → depois da correção de stopwords, 4 livros)

Comparado o cluster de cabeçalho gerado por `primeira_passada()` (função
de produção, mesma chamada que `main()` usa) antes/depois da correção de
stopwords, nos 3 livros PT (contra o baseline do Passo 0) e no FDE
(contra a análise já registrada na inspeção anterior):

| Livro | Diff de clusters | Impacto real |
|---|---|---|
| `samples/001-080.pdf` (80p) | **zero diferença** | nenhum |
| `samples/livro_completo_208pg.pdf` (208p) | **zero diferença** | nenhum |
| PEREIRA (903p) | 1 cluster dividido em 2 (`contagem=2` → dois de `contagem=1`) | **nenhum** — os dois ficam abaixo do mínimo (9) nos dois casos; a divisão é uma correção colateral (as duas frases — "American Journal of Medicine" e "New England Journal of Medicine" — são nomes de periódicos DIFERENTES que não deveriam ter sido agrupados, mesmo padrão de colisão por vocabulário genérico já documentado no FDE) |
| FDE (210p, inglês) | Cluster 1 resolvido (confirmado); Cluster 2 inalterado (esperado); **1 NOVO falso positivo introduzido** | ver abaixo |

**Pergunta direta que precisa de resposta direta: o mecanismo que criou
o novo falso positivo no FDE (remover palavra compartilhada pode
aumentar a razão de contenção) foi testado em português também, ou só
apareceu por acaso no livro em inglês?** Testado nos 3 — o diff da linha
acima não é um diff só dos clusters marcados como cabeçalho, é um diff
do **arquivo de clusters inteiro** (toda linha, marcada ou não) de cada
livro. "Zero diferença" em 80p/208p é uma prova direta, não uma
ausência de teste: se nenhuma linha do relatório mudou, nenhuma
comparação de similaridade teve resultado alterado — o que só é
possível se nenhuma linha desses 2 livros contém, como palavra
reconhecida, nenhum dos 18 tokens em inglês agora tratados como
stopword. O mecanismo não teve nenhuma pré-condição para disparar
nesses 2 livros.

No PEREIRA, a pré-condição ocorreu exatamente 1 vez (a palavra "of" nos
dois nomes de periódico em inglês citados na bibliografia em
português) — e nesse caso real, o efeito foi o oposto do problema do
FDE: separou dois clusters que não deveriam estar juntos, sem criar
nenhum cabeçalho falso novo (confirmado: o único cluster já marcado
`[CABEÇALHO]` no PEREIRA é idêntico, char a char, antes e depois).

**O que isso não prova**: que o mecanismo nunca vai acontecer num livro
em português. PEREIRA — um livro sobre como publicar artigos
científicos, com nomes de periódico e termos técnicos em inglês na
bibliografia — é justamente o perfil mais suscetível dos 3 livros PT
testados, e mesmo nele só 1 de ~578 clusters foi afetado, por acaso de
forma benigna. Um livro em português com mais palavras em inglês
espalhadas pelo corpo do texto (não só isoladas na bibliografia)
teria mais chances de expor o mesmo padrão observado no FDE. **Risco
residual real, testado contra 3 livros reais em português sem
reprodução do problema, não uma prova geral de que não pode
acontecer.**

**Achado real, não hipotético — a correção de stopwords introduziu um
novo falso positivo no FDE**: o cluster `"oreilly"` (antes `contagem=2`,
abaixo do limiar, sem efeito no EPUB) cresceu para `contagem=3` e passou
a cruzar o limiar. Origem confirmada de 2 dos 3 membros: pg-50 (uma nota
de rodapé, `"4 What Is Data Engineering? (O'Reilly 2020)..."`) e pg-52
(um **cabeçalho de seção real**, `"What Is the Data Engineering
Lifecycle?"`) — este último passa a ser removido do corpo da página 52,
uma perda de conteúdo estrutural real, do mesmo tipo dos Clusters 1/2.

**Mecanismo confirmado por cálculo direto** (não suposição): remover uma
palavra que estava presente nos DOIS lados de uma comparação de
contenção pode aumentar a razão, não só diminuir — porque o denominador
(`min(|A|,|B|)`) encolhe junto com o numerador, e pode encolher
proporcionalmente mais:

| | Similaridade sem stopwords EN | Similaridade com stopwords EN |
|---|---|---|
| `"...What Is Data Engineering? (O'Reilly 2020)..."` vs. `"What Is the Data Engineering Lifecycle?"` | 0,667 (abaixo do limiar) | **0,75** (cruza o limiar) |

Remover `"is"` (presente nos dois lados) e `"the"` (só no lado B)
encolheu o conjunto B de 6 para 4 palavras — proporcionalmente mais que
o conjunto A (de 6 para 5) — subindo a razão de contenção acima do
limiar.

> **Decisão sobre manter ou reverter a correção de stopwords, dado este
> efeito colateral real**: mantida. Razão: o problema original (ausência
> de stopwords em inglês) é um bug estrutural que afeta QUALQUER texto
> em inglês processado pelo pipeline, não só os 2 casos já conhecidos —
> reverter deixaria esse problema geral sem solução. O efeito colateral
> encontrado é 1 caso concreto novo, da mesma categoria de risco já
> aceita neste projeto (limiares de contenção por conjunto de palavras
> têm casos-limite que podem virar em qualquer direção conforme o
> vocabulário do livro) — mesmo padrão de troca aceita na Fase 4.4 (a
> fusão de parágrafos corrigiu o caso comum e introduziu uma regressão
> conhecida e documentada em listas numeradas, sem reverter a correção
> geral). Resultado líquido: 1 falso positivo corrigido (Cluster 1), 1
> conhecido e não corrigido por falta de calibração (Cluster 2), 1 novo
> encontrado e documentado (oreilly/lifecycle) — de 2 falsos positivos
> confirmados antes desta rodada para 2 depois, mas o bug ESTRUTURAL
> (stopwords só-português) que motivou a tarefa está corrigido, o que
> era o objetivo real desta rodada.

### Limitações conhecidas

- Cluster 2 (legendas de figura com vocabulário compartilhado) e o novo
  cluster oreilly/lifecycle (nota de rodapé + cabeçalho de seção com
  vocabulário compartilhado) continuam sem correção — mesma categoria de
  risco, ainda sem sinal calibrado que os resolva sem mais dados reais.
- `<html lang="pt-BR">` continua fixo no HTML gerado, independente do
  idioma real do livro — metadado de acessibilidade incorreto para
  livros não-portugueses, não corrigido nesta rodada.
- A supressão de título por página-100%-imagem foi tentada com 3 sinais
  diferentes (cobertura de imagem, volume de texto, confiança OCR) e
  nenhum generaliza aos 2 casos reais conhecidos sem risco de regressão
  — ver seção "Parte 2" acima para os números completos. Não reabrir com
  os mesmos 3 sinais sem um dado novo.
- `_STOPWORDS_CABECALHO_EN` (18 palavras) foi escolhida por
  conhecimento geral de inglês (artigos, preposições, conjunções
  comuns), não calibrada palavra a palavra contra um corpus — mesmo
  padrão de "generaliza por construção, mas amostra de validação
  estreita" já usado para outros limiares deste projeto. Só 1 livro em
  inglês existe no projeto para validar.

## Fase 4.7: encerramento robusto do sidecar ao fechar o app / botão de cancelar

### Sintoma confirmado na prática

Fechar a janela do `Foliant.app` não matava o sidecar (`foliant-core`) nem
seus processos filhos (`tesseract`) — `ps aux` mostrava `foliant-core`
rodando minutos depois do app fechado, consumindo CPU indefinidamente em
background numa máquina que já é o gargalo do projeto.

### Causa raiz — confirmada com teste real, não assumida

Reproduzido isolando o binário PyInstaller (fora do Tauri): rodar
`foliant-core samples/001-080.pdf ...` e inspecionar a árvore de
processos com `ps -o pid,ppid,command` revela **3 níveis**, não 1:

```
foliant-core (stub do bootloader --onefile, ver Fase 4)  <- pid que o Tauri conhece
  └─ foliant-core (processo Python real, forkado pelo stub)
       └─ tesseract (subprocess do pytesseract, 1 por página)
```

Lido o código-fonte da versão exata pinada em `Cargo.lock`
(`tauri-plugin-shell 2.3.6`): `CommandChild::kill()`
(`src/process/mod.rs`) chama `self.inner.kill()` — `SharedChild::kill()`,
que por baixo é `std::process::Child::kill()` no Unix, e manda `SIGKILL`
só no pid daquele `Child`, isto é, **só o stub do bootloader** (o nível
1). O processo Python real (nível 2) e o `tesseract` (nível 3) nunca
recebem sinal nenhum — ficam órfãos, reparented para o `launchd`, e
continuam rodando. Confirma exatamente o sintoma relatado.

Não há suporte a grupo de processos na API pública de
`tauri_plugin_shell::process::Command` (sem `.process_group()`/
`setsid` expostos) — confirmado lendo `process/mod.rs` inteiro, não só a
função `kill()`. Também não dá pra usar `killpg` do lado Rust sem
modificar como o sidecar é spawnado: como o processo é criado via
`std::process::Command` padrão (sem `setsid`), ele herda o **mesmo grupo
de processos do próprio app Tauri** — um `killpg` nesse grupo mataria o
app inteiro junto, não só o sidecar. Essa alternativa foi descartada por
esse motivo (risco maior que o problema original).

### Mecanismo escolhido: rastreamento de árvore de PIDs via `ps`/`kill`

Descartada a opção de grupo de processos (risco de matar o app junto,
acima) e descartada também a alternativa de adicionar uma dependência
nova (`sysinfo`/`libc`) só para isso — o projeto já usa `ps`/`kill` como
ferramenta de verificação manual em toda a validação documentada desta
fase (e das anteriores), então automatizar a mesma ferramenta em vez de
reimplementar a lógica com uma API de baixo nível mantém a superfície de
mudança pequena.

Implementado em `desktop/src-tauri/src/lib.rs`:
- Estado gerenciado (`SidecarPid`, um `Mutex<Option<u32>>`) guarda o pid
  do stub do bootloader (o único pid que o lado JS conhece, via
  `CommandChild.pid()`), atualizado por dois comandos novos
  (`registrar_pid_sidecar`/`limpar_pid_sidecar`) chamados de
  `main.js` logo após `command.spawn()` e no evento `close` do processo.
- `arvore_de_pids(raiz)`: roda `ps -axo pid=,ppid=` e faz BFS a partir do
  pid raiz para achar todos os descendentes, qualquer profundidade —
  cobre os 3 níveis confirmados acima sem hardcodar a profundidade.
- `matar_arvore(raiz)`: manda `SIGTERM` em todos os pids da árvore
  primeiro, espera 1,5s, e manda `SIGKILL` em quem sobreviver. O `SIGTERM`
  primeiro (em vez de `SIGKILL` direto) existe especificamente para dar
  chance ao handler de `foliant.py` (abaixo) rodar a limpeza do
  `TemporaryDirectory` antes do processo morrer.
- Um comando novo `cancelar_conversao` (botão "Cancelar" da UI) e o
  handler `on_window_event` para `WindowEvent::CloseRequested` chamam a
  mesma `matar_arvore`, lendo o pid do estado gerenciado. Verificado
  contra o código-fonte de `tauri 2.11.5` (`src/app.rs`) que
  `WindowEvent::CloseRequested { api }` com `api.prevent_close()` é a API
  atual — não assumido de memória. Não usado `prevent_close()`: matar a
  árvore é rápido o bastante (chamadas de sistema síncronas) para não
  precisar atrasar o fechamento da janela.

### Limpeza graciosa do lado Python — `SIGTERM` vira `KeyboardInterrupt`

O handler default do Python para `SIGTERM` mata o processo na hora, sem
rodar o `__exit__` do `with tempfile.TemporaryDirectory()` em
`foliant.py:main()` — deixaria o cache OCR (JSON-lines) e o HTML
intermediário órfãos em disco a cada cancelamento. Corrigido registrando
`signal.signal(signal.SIGTERM, handler)` como uma das primeiras linhas de
`main()`, onde o handler levanta `KeyboardInterrupt`. A exceção se
propaga através do `with` (rodando a limpeza durante o unwind, como
qualquer exceção Python) até ser capturada logo depois, fora do bloco,
onde o programa imprime `CANCELADO: conversão interrompida.` (prefixo
`CANCELADO:` que o lado JS usa para diferenciar cancelamento de erro
genérico) e sai com código 130.

**Teste real do tempo de reação ao sinal** (não assumido): SIGTERM
mandado direto pro pid do processo Python real, com uma página de OCR em
andamento — processo morre e imprime a mensagem de cancelamento em
**~600ms** (medido por polling a cada 300ms). Os 1,5s de espera antes do
`SIGKILL` de segurança dão margem confortável acima desse número medido.

### Validação — dado real, 2026-09-04, livro de 208 páginas, `.app` de produção

App reconstruído (`pnpm tauri build`), instalado em `/Applications`,
sidecar embutido conferido por `shasum -a 256` contra o binário-fonte
(idêntico). Testado via clique real na UI (automação de acessibilidade
via `osascript`/System Events — desta vez estável contra o binário sem
assinatura, diferente do artefato de TCC documentado nas Fases 4.1/4.2)
contra `samples/livro_completo_208pg.pdf`:

| Cenário | `ps aux` (`foliant-core`+`tesseract`) alguns segundos depois | `.epub` parcial no destino | Mensagem na UI |
|---|---|---|---|
| Clique em "Cancelar" durante OCR | **zero processos** (confirmado a cada 500ms até 3s) | nenhum | "Cancelando…" → "CANCELADO: conversão interrompida." → "Cancelado pelo usuário." |
| Fechar a janela durante OCR | **zero processos**, incluindo o próprio app (`foliant-desktop`) | nenhum | N/A (app encerrado) |

**Caminho feliz (não-regressão)**: mesmo `.app`, conversão completa do
livro de 80 páginas (`samples/001-080.pdf`) sem cancelamento, do início
ao fim, via clique real na UI — `.epub` de 810KB gerado, UI mostra
"Processo concluído com sucesso." (não confundido com "Cancelado",
confirmando que o novo rastreamento de pid não interfere no fluxo
normal).

**Risco residual explícito — extração `_MEI*` do PyInstaller pode
acumular indefinidamente, sem limpeza automática em nenhuma camada**: o
stub do bootloader (nível 1 da árvore) normalmente espera seu filho
(nível 2) terminar e só então limpa seu próprio diretório de extração
temporária (`_MEI*` em `tempfile.gettempdir()`) antes de sair. Se o stub
for morto por `SIGKILL` antes de completar essa limpeza (cenário possível
se o processo Python real não reagir ao `SIGTERM` dentro dos 1,5s de
margem — não observado nos testes reais desta fase, mas não garantido
para todo cenário futuro, ex.: página muito grande travando um
`image_to_data()` por muito mais que 1,5s), esse diretório fica órfão.
Não é uma falha do mecanismo de cancelamento em si (o objetivo — matar
`foliant-core` e `tesseract`, confirmado por `ps aux` — continua
cumprido), é uma limitação separada do bootloader do PyInstaller, fora do
controle deste código.

**Confirmado, não apenas hipotético, que isso pode acumular sem limite**:
(1) é uma limitação conhecida e documentada do próprio PyInstaller há
vários anos, sem correção — issues
[#902](https://github.com/pyinstaller/pyinstaller/issues/902),
[#2379](https://github.com/pyinstaller/pyinstaller/issues/2379) e
[#5518](https://github.com/pyinstaller/pyinstaller/issues/5518), todos
confirmando que a limpeza só acontece em saída normal, nunca quando o
processo é morto à força, e que não há nenhum mecanismo de "limpar
sobras da execução anterior" no próximo start; (2) verificado nesta
máquina que a limpeza diária automática do macOS (`/etc/defaults/periodic.conf`,
`daily_clean_tmps_dirs="/tmp"`) só cobre `/tmp`, não
`tempfile.gettempdir()` (que aponta para `/var/folders/.../T`, a mesma
pegadinha documentada desde a Fase 2) — inspecionado esse diretório real
nesta máquina e encontrados arquivos/pastas de mais de um mês atrás ainda
presentes, confirmando que nada os remove automaticamente nessa janela de
tempo. Ou seja: cancelamentos malsucedidos repetidos (o processo não
reagir a tempo ao `SIGTERM`) acumulam `_MEI*` indefinidamente, sem
qualquer aviso ao usuário — risco real de disco enchendo aos poucos, não
só teórico. Nota visível adicionada ao `README.md` (seção "Limitações
conhecidas") para que o usuário final saiba o que procurar caso note uso
de disco crescendo sem explicação óbvia, já que a causa (processo já
terminado há muito) não teria relação aparente com o sintoma (disco
cheio). Não corrigido nesta fase (fora de escopo: exigiria patchear o
bootloader compilado do PyInstaller ou trocar de `--onefile` para
`--onedir`, mudança maior e não pedida) — mitigado só por documentação e
por instruções manuais de limpeza no `README.md`.

## Fase 4.8: rótulo travado da fase HTML + colapso do painel de log ao concluir

### Bug do rótulo "processando…" travado

`atualizarProgresso()` em `desktop/src/main.js` tem duas responsabilidades
misturadas: (1) marcar como `concluida` toda fase anterior à que acabou
de reportar progresso, e (2) atualizar o texto/barra da fase atual. A
fase "html" (ver Fase 4.6 acima — sem contador granular, só um evento
`atual:0,total:0`) nunca passa pelo caminho (2) com um valor final,
porque `foliant.py` não emite um segundo evento de conclusão para ela.
Sua única transição para "concluída" acontece via caminho (1), quando a
fase "epub" começa — e esse caminho atualizava classe CSS e largura da
barra, mas não o texto do contador, deixando "processando…" gravado
para sempre. Corrigido fazendo o caminho (1) também escrever
`"concluído"` no contador, mas só quando o texto atual for exatamente
`"processando…"` — para não sobrescrever fases com contador granular
(`ocr`, `epub`), que já chegam a esse ponto com seu próprio texto final
("210/210", "100%") já escrito por si mesmas.

### Colapso do log ao concluir: `<details>` nativo em vez de esconder de vez

Pedido do usuário: não poluir a tela no caminho feliz, mas sem perder o
log para depuração de conversões futuras problemáticas. Descartada a
opção de remover/esconder o log de forma irreversível (só um `hidden`
sem alternativa de reabrir) porque o log é a única fonte de diagnóstico
disponível nesse app (não há telemetria, não há arquivo de log
persistido em disco — ver ausência de qualquer sistema de logging
estruturado no restante do projeto). Escolhido `<details>`/`<summary>`
nativo do HTML: colapsa visualmente sem remover nada do DOM, sem exigir
JS para o toggle em si (só para decidir o estado inicial), e é a mesma
primitiva HTML que qualquer contribuidor futuro reconhece sem precisar
ler `main.js`. Regra de quando colapsar: reaproveita o mesmo callback
`command.on("close", ...)` que já existia (não foi criado nenhum sinal
novo) — colapsa (`open = false`) só quando `dados.code === 0` **e** não
houve cancelamento; em erro ou cancelamento o log fica como estava
(aberto), porque nesses casos ele é a informação principal, não
secundária. Uma nova conversão sempre reabre o log e esconde o banner de
sucesso incondicionalmente no início do `submit`, para não herdar o
estado visual da execução anterior.

Avaliado (e descartado nesta fase) adicionar um atalho "abrir pasta no
Finder" no banner de sucesso via `tauri-plugin-opener`: o plugin já está
registrado no lado Rust (`Cargo.toml`, `lib.rs`, capability
`opener:default` em `capabilities/default.json`), mas o binding JS
(`@tauri-apps/plugin-opener`) não está instalado em
`desktop/package.json` — adicionar essa dependência é uma mudança de
build (não só de UI), fora do escopo contido pedido para esta fase.

## Fase 4.9: updater automático (tauri-plugin-updater)

### Motivação

O ciclo de release manual (rebuild sidecar → rebuild frontend → `tauri
build` → remover o app antigo → reinstalar → repetir o aviso do
Gatekeeper) já causou um incidente real nesta sessão: uma auditoria de
qualidade foi conduzida contra um `.app` desatualizado sem ninguém
perceber. `tauri-plugin-updater` resolve a detecção e instalação
automática de novas versões, usando uma chave de assinatura própria do
Tauri — independente da assinatura de código da Apple, que o projeto já
decidiu não comprar (ver Fase 4, "Decisão Tesseract/Calibre" e a nota de
Gatekeeper no `README.md`).

### Duas correções de premissa encontradas antes de codar

1. **GitHub Releases não era infraestrutura já em uso.** `gh api
   repos/thiago-p-almeida/foliant/releases` retornou lista vazia nesta
   sessão, e o `README.md` nunca referenciou um link de release — o
   "Download" documentado sempre foi build local. Adotar o padrão de URL
   `.../releases/latest/download/latest.json` como endpoint do updater
   **cria** esse canal de distribuição agora, não reaproveita algo que já
   existia. Só funciona de fato quando o mantenedor publicar manualmente
   o primeiro Release com os artefatos — não feito nesta tarefa (fora de
   escopo, ver abaixo).
2. **Assinatura ad-hoc foi avaliada e descartada** como solução para o
   aviso do Gatekeeper na primeira instalação manual. Pesquisa (issues
   oficiais do Tauri/Apple, ver referências no fim desta seção) confirma
   que `codesign --sign -` (grátis, sem conta Apple Developer) **não**
   remove o aviso de "Abrir Assim Mesmo" — só notarização paga da Apple
   remove por completo. Não vale a complexidade adicional só por esse
   motivo; registrado aqui para nenhuma sessão futura reabrir essa
   investigação sem saber que já foi descartada e por quê.

### Mecanismo

- **Chave de assinatura**: par gerado com `tauri signer generate` fora
  do repositório, em `~/.tauri/foliant-updater.key` (privada, protegida
  por senha aleatória gerada com `openssl rand -base64 32`, permissões
  `600`) e `~/.tauri/foliant-updater.key.pub` (pública). **A chave
  pública** está commitada em `desktop/src-tauri/tauri.conf.json`
  (`plugins.updater.pubkey`) — é seguro publicá-la, só serve para
  verificar assinaturas, nunca para criá-las. **A chave privada nunca
  toca o repositório** — vive só nesta máquina, em `~/.tauri/`, fora de
  qualquer diretório versionado, então não precisou de entrada nova no
  `.gitignore`. **Se a chave privada ou a senha forem perdidas, não é
  possível publicar nenhuma atualização futura que os apps já instalados
  aceitem** — o usuário deve fazer backup próprio de ambas (ex.: gerenciador
  de senhas) em local seguro fora deste projeto.
- **Endpoint de produção** (committed):
  `https://github.com/thiago-p-almeida/foliant/releases/latest/download/latest.json`
  — padrão de URL estático do GitHub Releases, sem precisar de servidor
  próprio.
- **UX de checagem**: automática e silenciosa ao abrir o app (sem
  diálogo de confirmação antes de baixar/instalar — mesmo padrão do
  exemplo oficial do plugin; atualizar o próprio app não é uma ação
  destrutiva de dados do usuário, diferente das ações de conversão, que
  seguem 100% explícitas) **+** botão manual "Verificar atualizações"
  para checagem sob demanda. Qualquer falha (rede, assinatura inválida)
  é logada visivelmente, nunca falha em silêncio.
- **Guarda contra relançamento durante conversão em andamento**
  (exigência de revisão antes da implementação): `relaunch()` mataria o
  sidecar sem o encerramento gracioso da Fase 4.7 se disparado no meio
  de uma conversão. `desktop/src/main.js` mantém uma flag
  `conversaoEmAndamento` (true entre o início do `submit` e o handler de
  `close` do processo) e uma variável `atualizacaoPendente`: se
  `verificarAtualizacao()` encontra uma atualização enquanto uma
  conversão está ativa, ela é **adiada** (log avisa isso explicitamente)
  em vez de aplicada na hora, e só é instalada no handler de `close` da
  conversão em curso, depois que ela termina. Opção escolhida (versus
  "matar o sidecar graciosamente e instalar na hora") por ser mais
  simples e por não haver motivo para interromper um trabalho do usuário
  já em andamento só porque uma atualização apareceu.

### Achados reais de validação (não suposição)

Testado localmente por completo (build "antiga" v0.2.0 → "nova" v0.2.1,
servidor HTTP local simulando o endpoint, nunca publicado de verdade)
antes de qualquer consideração de release real — ver evidência detalhada
em `TASKS.md`, Fase 4.9. Dois achados que corrigem expectativas da fase
de investigação, não confirmadas às cegas:

1. **O endpoint do updater exige HTTPS por padrão mesmo em builds
   locais** — `tauri-plugin-updater` valida o esquema da URL no
   deserializador da config (`src/config.rs`, `validate_endpoints`) e
   recusa `http://` fora de modo dev, com uma mensagem de erro clara.
   Contornado **só para os builds de teste** com a flag
   `dangerousInsecureTransportProtocol: true` passada via `tauri build
   --config` (nunca commitada em `tauri.conf.json` — o endpoint real de
   produção é HTTPS via GitHub Releases, então a flag não é necessária
   ali).
2. **Confirmado com teste real, não suposição** (era a Ressalva 2 da
   aprovação do plano): depois de um update real aplicado pelo próprio
   updater (download via `reqwest` interno do plugin, não navegador),
   `xattr -r` no `.app` resultante e no binário do sidecar embutido não
   mostrou **nenhum** atributo estendido — em particular, sem
   `com.apple.quarantine`. Isso é consistente com o mecanismo real do
   macOS: o atributo de quarentena é aplicado por aplicativos
   "quarantine-aware" (Safari, Mail, Finder ao extrair um `.zip` baixado
   etc.) via uma API específica no momento do download/extração pelo
   usuário — não é algo que o kernel aplica a qualquer dado que chegue
   pela rede. Um downloader interno de um processo Rust (`reqwest`) não
   aciona esse mecanismo. **Conclusão real, testada**: atualizações
   aplicadas pelo próprio updater não devem reacender o aviso do
   Gatekeeper — só a primeira instalação manual (`.dmg` baixado via
   navegador, que **esse sim** recebe quarentena) precisa do passo
   "Abrir Assim Mesmo" documentado no `README.md`.

### Processo de publicar uma nova versão (a partir de agora)

1. Bump de versão em três arquivos: `desktop/src-tauri/Cargo.toml`,
   `desktop/src-tauri/tauri.conf.json` e `desktop/package.json` (mantidos
   em sincronia por convenção do projeto, não por exigência técnica do
   Tauri — só `tauri.conf.json` é a fonte de verdade lida em runtime).
2. Build assinado:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/foliant-updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<senha guardada no gerenciador de senhas>"
   cd desktop && pnpm tauri build
   ```
   Isso gera, além do `.dmg`/`.app` de sempre, `Foliant.app.tar.gz` e
   `Foliant.app.tar.gz.sig` (graças a `"createUpdaterArtifacts": true`
   em `tauri.conf.json`).
3. Montar `latest.json` (schema: `version`, `notes`, `pub_date`,
   `platforms."darwin-x86_64".{url,signature}` — `signature` é o
   conteúdo do `.sig` gerado no passo 2).
4. Publicar um GitHub Release anexando `.dmg`, `Foliant.app.tar.gz`,
   `Foliant.app.tar.gz.sig` e `latest.json` — o padrão de URL
   `/releases/latest/download/<arquivo>` só resolve para o Release mais
   recente publicado (não rascunho/pre-release).

### Fora de escopo (confirmado, não implementado nesta fase)

- **Automação via GitHub Actions** para assinar/publicar builds a cada
  tag — possibilidade futura real (o repositório já tem `origin` no
  GitHub), mas a chave privada precisaria de um processo de secret
  management mais cuidadoso (GitHub Actions secrets, rotação, etc.) que
  merece tarefa própria, não decidido de forma apressada aqui.
- Publicar de fato um Release real no GitHub como parte desta tarefa —
  toda a validação foi local, com servidor HTTP de teste.

### Referências consultadas

- Documentação oficial do plugin Updater (v2.tauri.app/plugin/updater).
- Discussões sobre ad-hoc signing e quarentena em macOS sem conta Apple
  Developer (issues públicas do `tauri-apps/tauri` e
  `tauri-apps/tauri-docs`, e fóruns da Apple Developer sobre
  `com.apple.quarantine` em Ventura 13.1+).

## Fase 4.10: incidente — app instalado nunca recebeu a Fase 4.8

Evidência completa (timestamps, git log, saída de `grep`) em
`TASKS.md`, Fase 4.10. Resumo da causa raiz: o código da Fase 4.8 estava
correto e commitado no sentido de "salvo em disco" (nunca havia pedido
de commit git — política do projeto é só commitar sob pedido explícito),
foi validado via harness headless (mesma limitação de Accessibility das
Fases 4.1/4.2), mas os builds reais gerados durante a validação da Fase
4.9 foram todos copiados para diretórios de scratchpad de teste — nunca
para `/Applications`. O `.app` que o usuário efetivamente abre continuou
sendo um build de antes da Fase 4.8 existir. Não é regressão de lógica;
é uma lacuna no processo de "validar via harness headless" quando esse
harness não cobre — e não pode cobrir, dado o ambiente sandboxed — o
passo final de "o binário instalado é realmente o novo?".

**Mudança de processo adotada a partir de agora**: qualquer tarefa que
altere `desktop/src/*` e só puder ser validada via harness headless
(por não haver acesso de Accessibility neste ambiente) deve, antes de
pedir validação visual ao usuário, confirmar explicitamente que
`/Applications/Foliant.app` tem timestamp posterior à mudança de
código — e reconstruir/reinstalar se não tiver. Esta é a primeira
ocorrência documentada deste padrão específico neste projeto (build
correto nunca chegando ao `.app` instalado) — a checagem deixa de ser
best-effort e passa a ser parte do critério de conclusão de qualquer
fase de frontend a partir de agora.

Sobre o alcance do updater automático (Fase 4.9) para mudanças de
frontend: tecnicamente ele cobriria — `createUpdaterArtifacts` empacota
o `.app` inteiro, com o `dist/` já embutido no binário pelo próprio
Tauri em tempo de build, não carregado à parte em runtime. Mas isso é
irrelevante enquanto nenhum Release real for publicado no GitHub (ainda
não foi, ver Fase 4.9): sem Release, o updater não tem nenhum efeito
prático, e todo o ciclo de atualização — visual ou de backend — continua
100% manual.

## Fase 4.11: correções de UI + opener + drag-and-drop

Evidência de validação completa em `TASKS.md`, Fase 4.11. Aqui, só as
decisões técnicas não óbvias.

**Binding JS do opener instalado** (pendência aberta desde a Fase 4.8):
`@tauri-apps/plugin-opener` adicionado a `desktop/package.json`. O lado
Rust já tinha `tauri-plugin-opener` registrado desde a Fase 4.8 — só
faltava mesmo o pacote JS. Permissão `opener:allow-open-path` adicionada
**sem escopo de caminho** (`{"identifier": "opener:allow-open-path"}`,
sem `"allow": [...]`), diferente do padrão de escopo mínimo usado em
`shell:allow-spawn` (que restringe a um binário e argumentos
específicos). Motivo: o `opener:allow-open-path` do plugin suporta
escopo por glob de caminho (`{"path": "..."}`, ver
`tauri-plugin-opener-2.5.5/src/scope.rs`), mas o destino do EPUB é
**inteiramente escolhido pelo usuário** via diálogo nativo de salvar
(`@tauri-apps/plugin-dialog`, `save()`) — pode ser qualquer lugar do
disco. Restringir a um glob fixo (ex.: `$HOME/**`) só criaria uma falsa
sensação de escopo, sem reduzir de fato a superfície de risco (o usuário
já escolheu esse caminho explicitamente no fluxo normal do app, mesmo
nível de confiança). `opener:default` já cobre `allow-reveal-item-in-dir`
(usado por "Ver na Pasta") — nenhuma permissão adicional foi necessária
para esse botão.

**Drag-and-drop — mecanismo escolhido**: `getCurrentWebview().onDragDropEvent()`
de `@tauri-apps/api/webview`, não os eventos HTML5 padrão (`ondrop`,
`ondragover`). O Tauri intercepta o drop no nível nativo do webview por
padrão (`dragDropEnabled: true`, valor padrão não alterado neste
projeto), o que impede os eventos DOM de drag-and-drop de disparar —
só a API própria do Tauri recebe o evento. Escopo do drop: **a janela
inteira**, não só o campo "PDF de entrada" — decisão deliberada dado que
é uma janela pequena e de propósito único (converter um PDF por vez),
então restringir a área de drop a um `<label>` específico só adicionaria
fricção sem benefício real de UX. Validação de extensão feita no lado
JS (checagem simples de sufixo `.pdf`, case-insensitive) — não há
validação de conteúdo real do arquivo (magic bytes) nesta camada, mesmo
nível de confiança já implícito no filtro do diálogo nativo de seleção
(`filters: [{ name: "PDF", extensions: ["pdf"] }]`), que também não
valida o conteúdo do arquivo, só a extensão.

**Feedback do updater — por que a checagem automática continua
silenciosa**: decisão deliberada, não descuido. Mostrar "você já está
atualizado" toda vez que o app abre seria ruído (mesmo padrão que
Chrome/VS Code/Slack seguem — só interrompem o usuário quando há algo
para fazer). A checagem manual (clique explícito no botão) é o único
caminho que garante uma resposta visível, porque aí o usuário
deliberadamente pediu uma resposta.

## Fase 4.12: correção do escopo do "Abrir EPUB" + aviso de drag-and-drop

Evidência completa em `TASKS.md`, Fase 4.12. Aqui, só a decisão técnica
não óbvia.

**Por que "Abrir EPUB" precisou de um comando Rust próprio, em vez de
só ajustar a permissão do plugin `opener`**: o comando IPC `open_path`
do `tauri-plugin-opener` (2.5.5) checa um escopo próprio de
caminhos-permitidos construído só a partir das entradas declaradas na
capability (`opener:allow-open-path`) — sem uma entrada `"allow":
[{"path": ...}]`, nada passa. Como o destino do EPUB é escolhido
livremente pelo usuário via diálogo nativo (`save()` do
`@tauri-apps/plugin-dialog`), não existe um caminho fixo conhecido em
tempo de build para declarar na capability. A extensão automática de
escopo que o plugin de diálogo faz ao usuário escolher um arquivo cobre
só o escopo do `@tauri-apps/plugin-fs`/asset protocol — **não** o
escopo próprio, independente, do plugin `opener` (confirmado lendo o
código-fonte do `Scope` do opener: ele só enxerga as entradas
declaradas na sua própria capability). E o `opener` não expõe nenhuma
API Rust para estender esse escopo em runtime (ao contrário do `fs`,
que tem `app.fs_scope().allow_file(...)`).

Com isso, as únicas opções reais eram: (a) um glob estático amplo
(`"**"` ou equivalente) cobrindo qualquer pasta do sistema — abriria
mão do princípio de permissão mínima já seguido no resto do projeto
(`shell:allow-spawn` escopado a um binário específico, por exemplo); ou
(b) um comando Rust próprio do app que chama `app.opener().open_path()`
diretamente — essa chamada de baixo nível não passa pelo crivo de
`is_path_allowed()`, que só existe no wrapper `#[tauri::command]`
exposto para IPC, não na struct `Opener` em si. Escolhida a opção (b):
dois comandos novos (`registrar_epub_gerado`/`abrir_epub_gerado`) que
guardam e depois abrem **só o caminho exato que o próprio backend
acabou de gerar**, verificado inteiramente no lado Rust — resultado
mais restrito que qualquer glob estático teria sido (o app só pode
abrir um arquivo: o que ele mesmo produziu), sem precisar de nenhuma
permissão nova na capability. `opener:allow-open-path` foi removida do
`capabilities/default.json` por não ser mais usada.

**Confirma o padrão de risco já documentado desde a Fase 4.11**: os
dois bugs desta fase (permissão do opener e feedback ausente do
drag-and-drop) só apareceram na validação manual real, não no harness
headless — reforça que qualquer mudança envolvendo permissões do SO ou
API nativa sem stub fiel precisa de confirmação manual, mesmo com
testes headless 100% verdes.

## Fase 4.13: design system real aplicado ao app (`desktop/src`)

Evidência completa em `TASKS.md`, Fase 4.13. Aqui, só as decisões
técnicas não óbvias.

**Fonte Inter é variável, não estática — muda a extração prevista**: a
suposição inicial (herdada do meta-prompt desta fase) era extrair 6
arquivos woff2 estáticos (2 subsets × 3 pesos) do standalone HTML. A
inspeção real do manifest de blobs embutido no standalone mostrou que
os 7 uuids de fonte ali (um por subset Unicode do Google Fonts) são
reutilizados **idênticos** nas 21 regras `@font-face` (7 subsets × 3
pesos — mesmo uuid do subset em `font-weight: 400`, `500` e `700`).
Isso só faz sentido se o arquivo por trás de cada uuid for uma fonte
variável (eixo `wght`) — confirmado abrindo o arquivo decodificado com
`fontTools`: `fvar` presente, eixo `wght` 100-900. Resultado prático: 1
arquivo (`inter-variable.woff2`, subset "latin", 48KB) cobre os 3 pesos
usados pelo design system, via um único `@font-face` com
`font-weight: 100 900` — mais simples e mais leve que os 6 arquivos
originalmente previstos.

**`AppWindow` do handoff não foi traduzido para o app real**: o próprio
`.prompt.md` do componente é explícito — é a moldura do UI kit para
apresentar as 8 telas lado a lado, não um componente de produto
("não é um componente de produto, é o enquadramento do UI kit"). A
janela nativa do Tauri já fornece titlebar/bordas; recriar isso como
chrome falso dentro do WebView teria duplicado o que o SO já desenha.

**Bug de `[hidden]` sobrescrito por `display: flex`/`inline-flex`**:
regras de autor sempre vencem o user-agent stylesheet, independente de
especificidade — então `button { display: inline-flex }` e
`.callout`/`.progresso { display: flex }` faziam o botão "Cancelar", o
painel de progresso e os banners de sucesso/aviso ficarem visíveis
mesmo com o atributo `hidden` presente (usado por `main.js` para
controlar visibilidade). Corrigido com `[hidden] { display: none
!important; }`. Só foi pego porque a validação renderizou o HTML real
em vez de revisar o CSS isoladamente — reforça, de outro ângulo, a
mesma lição das Fases 4.10-4.12: renderizar/executar de verdade
encontra bugs que a leitura de código não encontra.

**Mesma limitação de Accessibility de sempre, reconfirmada**: a janela
nativa do app (dev e produção) não é capturável por `screencapture`
neste ambiente, mesmo com a API de Accessibility confirmando que ela
existe, está visível, não minimizada e é a app frontmost — não é bug do
app, é a mesma restrição de sandboxing documentada desde a Fase 4.11.
Contornado renderizando os arquivos reais do bundle (`dist/index.html`
e `dist/styles.css`, antes do build embutir no binário) em Chrome
headless real, servidos por um HTTP server local — valida marcação e
CSS de verdade, mas não substitui clique real na janela nativa (mesmo
risco residual já aceito em fases anteriores).

## Fase 4.13.1: completar a tradução do design system + harness de execução real

Evidência completa em `TASKS.md`, Fase 4.13.1. Aqui, só as decisões
técnicas não óbvias.

**Por que a auditoria achou 8 lacunas em vez das 3 relatadas pelo
usuário**: comparação linha a linha entre `foliant.py`/`desktop/src/`
reais e os 3 arquivos de composição do handoff
(`ui_kits/foliant-app/{ScreensStart,ScreensConvert,ScreensResult}.jsx`)
— não os componentes isolados (`components/*.jsx`), que já tinham sido
lidos na Fase 4.13. A causa raiz de duas lacunas concretas, achadas
assim: (1) `ScreensConvert.jsx` envolve Título/Autor/Idioma num
`Disclosure` — informação que o próprio agente de exploração da Fase
4.13 já tinha reportado, mas que se perdeu na compressão do plano
final; (2) `main.js` só logava cancelamento/erro em texto, nunca com
`Callout` visível — só apareceu porque a validação da Fase 4.13 nunca
exercitou esses dois caminhos (só rodou uma conversão bem-sucedida).

**Descoberta real durante a auditoria**: dois itens que pareciam
exigir funcionalidade nova de backend (contagem de páginas e
classificação texto-vs-escaneado) na verdade já eram computados dentro
do pipeline e descartados sem nunca serem expostos —
`extrair_texto_pagina()` (`foliant.py:657`) já decide por página via
`pagina.get_text("text").strip()`, e `doc.page_count` já dá o total
antes de qualquer processamento. A mudança real foi só instrumentação
(uma passagem adicional e independente, rápida por não envolver
renderização/OCR, emitindo uma linha `ANALISE:` nova), não uma feature
nova de análise. Os outros dois itens que pareciam parecidos (tempo
estimado, threshold de confiança do Tesseract para "sucesso com
ressalva") são genuinamente diferentes — exigem calibração contra
dados reais, não só exposição de um valor já calculado — e foram
propositalmente adiados para uma Fase 4.15 à parte, por decisão
explícita do usuário.

**Harness de execução real via `importmap`, não só leitura de
código**: a Fase 4.13 só validou HTML/CSS estático em Chrome headless
(os imports do Tauri em `main.js` — `@tauri-apps/plugin-shell` etc. —
são specifiers nus que o navegador não resolve, então o módulo inteiro
falhava ao carregar e nenhum handler JS rodava). Esta fase contornou
isso com um `<script type="importmap">` remapeando esses specifiers
para um módulo stub local — `main.js` real passa a carregar e executar
de verdade no navegador, sem precisar copiar ou modificar o arquivo.
O stub do `Command.sidecar()` guarda o callback de `stdout.on("data",
cb)` num global (`window.__dispararStdout`), permitindo ao script de
teste simular linhas de stdout (`ANALISE:`/`PROGRESS:`) e ao de
`close` (`window.__fecharProcesso`) simular o processo terminando —
validando por execução real que o guard `cancelamentoSolicitado`
escolhe o `Callout` certo (cancelado, não erro) mesmo quando o
processo cancelado también sai com código != 0, exatamente a mesma
ambiguidade que a Fase 4.7 já tinha documentado ("não existe evento
distinto de cancelado vindo do sidecar"). Esse padrão de harness (sem
nenhuma dependência nova instalada, só um arquivo stub + importmap) é
reaproveitável para validação de lógica JS em fases futuras, sem
esperar acesso à janela nativa.


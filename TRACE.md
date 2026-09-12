# TRACE — um episódio real de engenharia neste projeto

Este documento não é um resumo do projeto. É a reconstrução, com dados
reais extraídos do histórico já registrado em [`TASKS.md`](TASKS.md) e
[`ARCHITECTURE.md`](ARCHITECTURE.md), de um único episódio de trabalho —
a Fase 4.4 ("correção de recuo de linha") — mostrando a sequência real:
instrução → hipótese → implementação → evidência que a contradisse →
correção → validação. Nada aqui foi reescrito para parecer mais limpo do
que foi; o ponto do episódio é justamente que a primeira versão estava
incompleta, e isso ficou registrado, não escondido.

## Por que este episódio, e não outro

Quase todo o histórico de fases deste projeto segue o mesmo padrão
disciplinado (calibrar com dado real → validar em volume → registrar
risco residual). A Fase 4.4 é o exemplo mais forte porque o erro não foi
um bug de implementação — foi um **erro de escopo silencioso**: o
critério de correção foi implementado, testado e passou nos próprios
testes... contra um caminho de código que a produção nunca ia executar
para o PDF que motivou o pedido. Só apareceu porque, antes de declarar a
tarefa concluída, o pipeline real (não um script de pesquisa isolado) foi
rodado contra o mesmo PDF.

---

## 1. Instrução original

Sintoma relatado pelo usuário no EPUB de um livro de 903 páginas
(PEREIRA): texto com "zigue-zague" visual de recuo. O próprio usuário já
tinha identificado a causa raiz antes de pedir a correção — `foliant.py`
gerava um `<p>` por linha física de texto extraído, e o CSS aplica
`text-indent` a todo `<p>` igualmente, recuando toda linha, não só o
início real de um parágrafo.

## 2. Primeira hipótese e implementação

Pesquisa de sinais de layout feita com dados reais antes de decidir o
critério (posição X por página, estatística agregada de 1.379 linhas,
sinal de gap vertical testado e descartado). O critério resultante
(`LIMIAR_RECUO_DELTA_PX`) foi implementado e calibrado — mas só contra o
**caminho de OCR** (`extrair_linhas_ocr`), usando dados obtidos
renderizando e OCRizando páginas do livro de 903 páginas **via um
script de pesquisa isolado**, não via o pipeline de produção.

## 3. A evidência que contradisse a hipótese

Antes de declarar a correção concluída, o pipeline real
(`extrair_texto_pagina`, o código de produção) foi rodado na mesma
página para conferir o resultado — e não a função isolada usada na
calibração. Resposta real, verbatim de `ARCHITECTURE.md`:

> "ao rodar o pipeline de verdade (`extrair_texto_pagina`) na mesma
> página para conferir — ficou claro que `inicio_paragrafo` voltava
> `None`: o PDF do livro de 903 páginas **tem texto nativo real**
> (`pagina.get_text("text")` retorna texto direto, sem OCR nenhum), e o
> pipeline sempre prioriza esse caminho quando disponível."

Ou seja: o livro que motivou o pedido nunca passava pelo caminho OCR em
produção. A correção implementada na etapa 2 — calibrada, testada,
aparentemente pronta — **nunca chegaria a rodar** para o caso real que
gerou a instrução original. O script de pesquisa usado para calibrar
tinha renderizado+OCRizado a página manualmente, sem nunca checar se a
produção usaria esse caminho.

Este é o ponto central do episódio: um teste que passa não prova que o
código testado é o código que vai rodar. A única forma de descobrir isso
foi rodar o pipeline de produção contra o dado real, não confiar na
calibração isolada.

## 4. O que mudou depois da evidência

Implementado o critério equivalente para o caminho **nativo**,
calibrado separadamente com o mesmo livro, via
`pagina.get_text("dict")["blocks"][...]["lines"][...]["bbox"]`:

- margem de continuação em `x0=15.0pt`, início de parágrafo em
  `x0=37.5pt`, sem variação em nenhuma linha observada;
- achado adicional durante essa segunda calibração: subtítulos de seção
  (ex. "▸3.11 Revisões externas") têm recuo **menor** que um parágrafo
  comum, mas fonte 1,3–1,5x maior — sem um segundo sinal de tamanho,
  esses subtítulos seriam classificados como continuação e colados ao
  parágrafo anterior. Implementado um override por razão de tamanho de
  fonte (`LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO = 1.3`), só para o caminho
  nativo — não implementado no caminho OCR por falta de dado real que o
  justificasse ali.

### Evidência real, antes/depois (página 60, mesmo trecho)

**Antes** (um `<p>` por linha física — o zigue-zague relatado):

```html
<p class="calibre1">Nas primeiras revisões, o autor se encarrega de assegurar que as palav</p>
<p class="calibre1">suas intenções. Não raramente, no caso de se tratar de autor exigente,</p>
<p class="calibre1">são necessárias para que ele se torne satisfeito com o que produziu. E</p>
<p class="calibre1">é conveniente fazer-se o "teste da gaveta": deixar o texto repousar, e</p>
```

**Depois** (parágrafo fundido, recuo só no início real):

```html
<p class="calibre1">Nas primeiras revisões, o autor se encarrega de assegurar que as
palavras reflitam suas intenções. Não raramente, no caso de se tratar de
autor exigente, várias revisões são necessárias para que ele se torne
satisfeito com o que produziu. Entre as revisões, é conveniente fazer-se
o "teste da gaveta": deixar o texto repousar, esquecido por alguns dias,
antes de voltar a lê-lo.</p>
```

Subtítulos confirmados protegidos (não grudaram no parágrafo ao redor):
`"▸B Foco das revisões"`, `"▸3.11 Revisões externas"`,
`"▸7.5 Perdas de participantes"`, `"▸A Quantidade de perdas"`,
`"▸12.15 Idioma do resumo"`, `"▸12.16 Preparação do resumo"`.

## 5. Validação de não-regressão nos livros já calibrados

Rodado o pipeline completo (não uma função isolada) contra os dois
livros usados nas Fases 2–3, ambos 100% via caminho OCR, para confirmar
que a correção do caminho OCR não regrediu:

| Livro | Exit code | Páginas confirmadas | Parágrafos típicos |
|---|---|---|---|
| `samples/001-080.pdf` (80 páginas) | 0 | 80/80 | 100–1444 caracteres (antes: ~70/`<p>`) |
| `samples/livro_completo_208pg.pdf` (208 páginas) | 0 | 208/208 | 101–910 caracteres |

Nenhum crash, nenhuma página perdida. Contagem de páginas verificada por
`grep` direto no HTML extraído do `.epub`, não assumida a partir do log.

## 6. Risco residual declarado, não escondido

Registrado explicitamente em `ARCHITECTURE.md`, "os três graus de
confiança, para não confundir":

- **Critério OCR**: calibrado com 1.379 linhas agregadas de 40 páginas +
  1 página avulsa, **validado end-to-end contra 2 livros completos**
  (80 e 208 páginas).
- **Critério nativo**: calibrado com só **3 páginas avulsas** de exame
  direto de geometria, validado end-to-end só contra um subconjunto de
  **24 páginas** do único livro nativo real do projeto — nenhum livro
  completo, nenhum segundo livro nativo para cross-validar. "O grau de
  confiança aqui é bem mais baixo que o do caminho OCR, apesar dos dois
  critérios terem nascido da mesma investigação."

Não há um livro nativo alternativo no projeto para testar esse terceiro
critério contra um layout diferente — isso fica declarado como limite
conhecido, não inferido por quem lê o código depois.

---

## Nota — mesma disciplina aplicada ao fechar a tarefa

Dois pontos adicionais, revisados antes de considerar a Fase 4.4
encerrada, seguem o mesmo padrão de "verificar em vez de assumir":

**Documentação obsoleta encontrada por acidente.** Ao checar se a
distinção entre os três graus de confiança acima estava clara na
documentação (pedido: só confirmar clareza), foi encontrada uma seção
antiga em `ARCHITECTURE.md`, sobrevivente de antes desta correção, ainda
afirmando que nenhum PDF nativo real existia no projeto — direto ao lado
da seção já corrigida que documentava o oposto. Verbatim:

> "Isso invalida a alegação anterior desta mesma seção ('não existe
> nenhum PDF de texto nativo real neste projeto') — nunca tinha sido
> reconferida depois que o livro de 903 páginas entrou como caso de
> teste real."

Não era literalmente o que tinha sido pedido, mas é a mesma disciplina
de checar em vez de presumir que a documentação já estava certa,
aplicada um nível acima do código.

**Suposição inicial sobre uma limitação estava errada.** A nota original
sobre listas/citações com recuo em bloco dizia "não é regressão, mesmo
comportamento de antes". Inspeção real — busca programática por blocos
de recuo uniforme no livro inteiro (903 páginas) seguida de comparação
byte a byte do EPUB gerado antes/depois em 3 páginas candidatas —
mostrou que essa suposição estava **errada**: listas bibliográficas
numeradas perdem a delimitação de entrada.

**Antes** (cada referência numerada em seu(s) próprio(s) `<p>`):

```html
<p class="calibre1">2. Merton RK. The sociology of science: [...] Chicago:</p>
<p class="calibre1">University of Chicago Press; 1973.</p>
<p class="calibre1">3. Bachelard G. La formation de l'esprit scientifique. [...]</p>
```

**Depois** (a fusão gruda o fim da referência 2 com o início da
referência 3 no mesmo `<p>` — o marcador "3." vira texto no meio da
frase):

```html
<p class="calibre1">University of Chicago Press; 1973. 3. Bachelard G.
La formation de l'esprit scientifique. Paris: Librairie Phi[...]</p>
```

Reclassificado de "nota neutra" para **regressão real**, registrado em
`TASKS.md` com uma direção de correção futura específica e testável
("detectar marcador de item no início da linha, tipo `^\d+\.\s`, como
sinal de 'início de novo item' que sobrepõe o critério de posição X"),
não implementada sem calibrar contra mais exemplos reais primeiro — o
mesmo padrão de "não corrigir sem dado real" usado no resto do episódio.

---

## O padrão, resumido

1. Uma hipótese confiante, calibrada e testada, ainda pode estar errada
   sobre **onde** ela se aplica — o teste que passa não substitui rodar
   o código de produção real contra o caso real.
2. Quando a evidência contradiz a suposição, o registro documenta o erro
   e a correção, não só o resultado final — inclusive quando o erro era
   do próprio agente, numa etapa anterior da mesma tarefa.
3. Fechar uma tarefa inclui reabrir suposições próprias ("não é
   regressão") contra evidência nova antes de aceitar o rótulo antigo.

---

# Segundo episódio — Fase 4.5 ("supressão de logo/figura"): uma hipótese
# certa sobre o mecanismo, abandonada por ser inútil na prática

O primeiro episódio acima mostra uma hipótese que estava certa sobre o
código, mas errada sobre onde ele rodaria. Este episódio é o caso
seguinte: a hipótese estava certa sobre o mecanismo (altura/razão de
fonte isola glifo decorativo de texto real), a implementação funcionou
exatamente como projetada — e ainda assim foi revertida, porque medir o
efeito real revelou que ela era ao mesmo tempo redundante no único caso
que resolvia com segurança e insuficiente no caso que motivou o pedido.

## 1. Instrução original

Relato do usuário, com imagens anexadas: o logo decorativo do selo GEN
aparecia como ruído de texto no EPUB gerado (`"x* Grupo Editorial
Nacional"`), e todo EPUB gerado usava capa genérica do Calibre
("Generating default cover" no log), nunca a capa real do livro.
Hipótese de escopo maior levantada a partir do relato: já que EPUBs
tratam imagem como binário real via `<img>`, o Foliant deveria extrair
capa/logos/figuras reais do PDF em vez de deixar esses elementos
gráficos serem OCRizados como texto.

## 2. Investigação com dado real antes de qualquer código

Localizada a página do selo GEN (página 4 do PDF, livro do Gil, 208
páginas, 100% caminho OCR). Dados reais de `pytesseract.image_to_data()`
na DPI de produção (`RENDER_DPI=200`):

| Elemento | Altura (px) | Razão vs. mediana da página | Nº caracteres |
|---|---|---|---|
| Ícone do logo, fragmento 1 (`"*"`) | 85.0 | **3.7x** | 1 |
| Ícone do logo, fragmento 2 (`"x*"`) | 47.0 | **2.06x** | 2 |
| Legenda pequena do logo | 11-15 | ~0.6x | 5-8 |
| Corpo de texto normal | 20-25 | ~1.0x | — |

Comparado aos dois grupos já calibrados no projeto (título de capítulo:
razão 2.0-2.5x; ornamento decorativo já documentado: razão 5.8x), o
fragmento 1 (3.7x) cai claramente no vale entre os dois — um limiar de
3.5x, combinado com comprimento de texto ≤3 caracteres, parecia isolar
esse fragmento sem risco aparente. O fragmento 2 (2.06x), o `"x*"` que
de fato motivou o pedido, não tinha essa folga: caía dentro da faixa de
um título real (2.0-2.5x).

## 3. A colisão medida, não suposta

Baixar o limiar para tentar cobrir também o fragmento 2 exigia checar se
esse limiar mais baixo não capturava texto real em outro lugar do mesmo
livro. Varredura de `image_to_data()` nas páginas 8-39 em busca de
conteúdo curto (≤3 caracteres) legítimo para comparação: a página 21
(conteúdo tabular degradado pelo OCR) tem a palavra real `"se"` com
razão **2.73x** — mais alta que a razão do próprio fragmento do ícone
(2.06x) que se queria capturar. Não existe limiar de razão que pegue o
`"x*"` sem também remover texto real já presente no mesmo livro.

## 4. O achado que só apareceu comparando antes/depois byte a byte

A heurística de altura/razão foi implementada e validada mesmo assim,
para cobrir ao menos o fragmento 1 (3.7x, sem colisão conhecida). Só ao
comparar o EPUB gerado antes/depois byte a byte é que ficou claro que
essa heurística nova era **totalmente redundante**: o fragmento 1
(`"*"` isolado) já era removido por código pré-existente sem nenhuma
relação com detecção de imagem — `_RE_RUIDO_INICIAL` (regex de
pontuação decorativa solta no início de linha) já reduzia essa linha a
string vazia, descartada pelo filtro `if p.strip()`. Confirmado
diretamente: `limpar_linha('*')` → `''` (já removido antes da mudança),
`limpar_linha('x*')` → `'x*'` (inalterado — `'x'` não está na classe de
ruído da regex).

Ou seja: a heurística nova só conseguia cobrir, com segurança, o único
caso que já não precisava dela — e o caso que precisava dela (`"x*"`,
razão 2.06x) é exatamente o caso que a colisão da etapa 3 impede de
resolver sem regredir texto real.

## 5. Decisão de reverter, por dado, não por opinião

Capa real foi mantida — implementação separada (`extrair_capa`),
validada com sucesso em 2 livros de calibração (diferença de proporção
0.1% e 2.8% entre página e imagem embutida), aditiva e segura por
padrão (`None` = comportamento antigo do Calibre, sem regressão
possível). A supressão de glifo decorativo foi revertida e registrada
como **investigada e abandonada**, não como TODO em aberto — o ruído
`"x*"` continua presente no EPUB gerado, sem regressão em relação ao
estado anterior a esta fase (nunca foi removido, continua não sendo).
Extração de figuras internas (ex. fluxogramas) foi descartada por
achado relacionado: a única via possível seria recorte posicional sobre
o pixmap renderizado, e uma página real do mesmo livro (capítulo "Como
delinear um estudo de coorte") mostra fragmentos decorativos misturados
palavra-a-palavra dentro do mesmo bloco do título real — sem fronteira
segura de recorte.

## O padrão, resumido

1. Uma hipótese pode estar certa sobre o mecanismo (o sinal de
   altura/razão realmente separa glifo de texto na maioria dos casos) e
   ainda assim ser inútil ou arriscada na prática, se o caso que ela
   cobre com segurança já era resolvido por outro caminho e o caso que
   motivou o pedido colide com texto real.
2. A colisão só apareceu porque foi medida contra outras páginas do
   mesmo livro, não assumida como improvável.
3. A redundância só apareceu porque o efeito real (diff byte a byte)
   foi comparado antes/depois, não porque o teste da heurística nova
   passou — o teste passando não provou que a heurística fazia algo que
   o código não já fazia.

---

# Terceiro episódio — inspeção do 1º livro em inglês: um pressuposto
# nunca declarado, invisível até o primeiro dado real que o quebrou

Os dois episódios acima são sobre hipóteses explícitas — algo que foi
decidido, calibrado e testado, e que depois se revelou errado sobre
**onde** rodaria (episódio 1) ou **inútil na prática** apesar de certo
no mecanismo (episódio 2). Este episódio é de um tipo diferente: não
havia hipótese nenhuma para errar, porque a decisão nunca foi tomada
conscientemente. A lista de stopwords usada para agrupar cabeçalhos e
títulos foi escrita cobrindo só palavras funcionais em português —
"como", "a", "de", "que" — sem nunca declarar, em código ou em
documentação, "isto assume que o texto processado está em português".
Era um pressuposto silencioso, e continuou silencioso e correto — por
puro acaso — durante toda a calibração anterior, porque os 4 livros de
teste do projeto até aqui eram todos em português. Só quebrou quando um
5º livro, em inglês, entrou como dado real.

## 1. A tarefa era inspeção, não correção — e a própria pergunta já continha um pressuposto

Pedido: avaliar a qualidade do EPUB gerado para `Fundamentals of Data
Engineering (Third Early Release)`, 210 páginas, processado com
`--lang por` (parâmetro de idioma do OCR — o app ainda não detecta
idioma automaticamente). Um dos itens pedidos era comparar a qualidade
do OCR em inglês contra o baseline em português, amostrando "4-5
páginas do meio do livro, caminho OCR".

Antes de amostrar qualquer coisa, checado com dado real
(`pagina.get_text("text")` nas 210 páginas) qual caminho cada página
realmente usa — e a pergunta original não se sustentava: **203 de 210
páginas (96,7%) têm texto nativo real**; só 7 usam OCR, e as 7 são
imagens de página inteira (gráficos/infográficos), sem prosa nenhuma.
Não havia amostra de "prosa em inglês via OCR" para comparar contra
nada. Em vez de forçar uma resposta a partir de um dado que não
existia, o item foi reportado como "sem dado conclusivo — a pergunta,
como formulada, não se aplica a esta classe de documento (PDF nativo
'born-digital')". Verificar se a pergunta ainda fazia sentido, antes de
gastar esforço respondendo-a errado, é a mesma disciplina dos episódios
anteriores aplicada um passo antes de qualquer investigação técnica.

## 2. O pressuposto nunca declarado, exposto por outro item da mesma inspeção

Outro item pedia inspecionar o comportamento do detector de cabeçalho
repetido em inglês. Log real da análise (`agrupar_cabecalhos`, 210
páginas): de ~90 clusters distintos, só 2 cruzaram
`LIMIAR_CABECALHO_MINIMO = 3`. Inspecionados os dois — nenhum é um
cabeçalho estrutural real:

- **Cluster 1**: `'fundamentals of data'`, `'fundamentals of data
  engineering'`, `'this book provides a snapshot of data engineering
  today to the fullest'` — três frases de páginas sem relação (título
  da capa + primeira frase da introdução), sem nada em comum a não ser
  vocabulário temático do livro inteiro.
- **Cluster 2**: legendas de duas figuras diferentes (Figura 2-1 e
  Figura 2-7) mais um subtítulo solto de uma palavra ("Undercurrents"),
  agrupados pela mesma razão.

Confirmado no `.epub` gerado que os dois clusters foram removidos como
se fossem cabeçalho — e, diferente de todo risco residual já registrado
neste projeto para os limiares de cabeçalho/título (sempre descrito
como "perda de recall", nunca como conteúdo removido incorretamente),
aqui é **conteúdo real do usuário desaparecendo do EPUB**:

| | Conteúdo |
|---|---|
| PDF original, pg-7 | `"This book provides a snapshot of data engineering today. To the fullest\nextent, we're focusing on..."` |
| `.epub` gerado, pg-7 | `<p>extent, we're focusing on the "immutables" of data engineering...</p>` — a frase inteira anterior sumiu, o parágrafo começa cortado no meio |
| PDF original, pg-53 | `"Figure 2-1. Components and undercurrents of the data engineering lifecycle\nThe Data Lifecycle Versus the Data Engineering Lifecycle"` |
| `.epub` gerado, pg-53 | `<p>The Data Lifecycle Versus the Data Engineering Lifecycle</p>` — a legenda real da Figura 2-1 desapareceu por completo |

## 3. A causa raiz, identificada com precisão — não suposição

`_STOPWORDS_CABECALHO` é uma lista só de português (`"como", "a", "as",
"o", "os", "um", "uma", "de", "e", "que", "do", "da", "dos", "das",
"em", "para"`). Para texto em inglês, palavras funcionais como `"of"`,
`"the"`, `"to"`, `"this"`, `"and"` nunca são filtradas — sobrevivem em
`palavras_conteudo()` como se fossem palavras de conteúdo reais,
inflando a similaridade de contenção entre frases sem relação de
verdade, só porque compartilham o vocabulário genérico de um livro cujo
assunto inteiro é "data engineering".

Confirmado por simulação direta contra o código de produção — não por
teoria — recalculando `similaridade_cabecalho()` com essas palavras
tratadas como stopword:

| Par | Similaridade real (stopwords só PT) | Simulada (com stopwords EN) |
|---|---|---|
| Cluster 1 | **0,75** (cruza o limiar 0,70) | **0,667** (fica abaixo — não teria clusterizado) |
| Cluster 2 | **0,857** | **0,80** (continua acima — precisaria de uma segunda correção) |

A lacuna de stopwords em inglês explica e resolveria o Cluster 1 de
forma direta e já calibrada. Não é suficiente sozinha para o Cluster
2 — ali a colisão vem de vocabulário genuinamente compartilhado entre
legendas de figura do mesmo capítulo, um problema estrutural diferente,
não coberto por uma lista de stopwords maior.

## 4. A correção foi validada, mas não aplicada — por decisão de escopo, não por incapacidade

A tarefa era inspecionar, não corrigir. A causa raiz foi identificada,
a correção do Cluster 1 foi simulada e confirmada contra o código real
antes mesmo de ser proposta como recomendação — mas não implementada
nesta rodada. Registrado em `TASKS.md`/`ARCHITECTURE.md` como
recomendação com causa raiz e direção documentadas, não como "TODO"
vago: unir a lista de stopwords PT+EN resolve o Cluster 1; o Cluster 2
precisa de um segundo critério (ex.: exigir ao menos 1 repetição exata
da string normalizada, não só contenção), ainda não calibrado contra
mais exemplos reais.

## Por que este episódio é de um tipo diferente dos dois anteriores

1. Nos episódios 1 e 2, havia uma hipótese explícita para errar — algo
   que alguém decidiu e escreveu, e que a evidência depois contradisse.
   Aqui não havia decisão nenhuma para revisitar: a lista de stopwords
   em português nunca foi uma escolha consciente de "só português" —
   era, sem ninguém declarar, a única coisa que o código já sabia fazer,
   porque nunca tinha visto outro idioma.
2. Risco residual não declarado não é o mesmo que risco residual
   inexistente. As seções de risco residual deste projeto (limiar de
   cabeçalho, limiar de título, limiar de recuo) sempre nomeiam
   cenários hipotéticos que poderiam quebrar o limiar — mas um
   pressuposto sobre **idioma** nunca tinha sido cogitado como algo a
   declarar, porque nunca tinha sido testado como variável. Ele só virou
   visível quando um dado real mudou essa variável pela primeira vez.
3. A disciplina de "verificar antes de responder" (episódio da Parte 1
   deste episódio, item 1 acima) e a de "simular a correção antes de
   recomendá-la" (item 3) são o mesmo padrão dos episódios anteriores —
   o que muda aqui é só a origem do problema: não uma calibração que não
   generalizou, mas uma suposição que nunca tinha sido posta à prova.

---

# Quarto episódio — corrigindo o pressuposto exposto: uma reversão e um
# efeito colateral de três atos

O terceiro episódio terminou com uma recomendação: unir stopwords PT+EN
resolveria o Cluster 1, e suprimir detecção de título em páginas
100%-imagem resolveria o padrão de legenda corrompida. A tarefa seguinte
foi implementar essas recomendações — e no processo, uma delas foi
derrubada por dado real antes de virar código, e a outra revelou um
efeito colateral que só apareceu na validação de ponta a ponta, não na
simulação inicial. Dois momentos, ambos do mesmo padrão de disciplina:
não aceitar a própria recomendação anterior como certa só porque parecia
bem fundamentada — testar de novo, contra mais dados, antes de
implementar ou de declarar concluído.

## Episódio 4a — a recomendação de supressão de título, derrubada antes de virar código

A recomendação do terceiro episódio parecia sólida: páginas 100%-imagem
(sem texto nativo, com uma imagem cobrindo quase toda a área) são onde o
padrão de "legenda corrompida promovida a título" acontece — suprimir
detecção de título nessas páginas resolveria os 2 casos conhecidos (Gil
pg-106, FDE pg-28) sem reabrir a colisão já documentada na Fase 4.5
("x*"/"se").

**O achado que derrubou a recomendação**: antes de implementar, medida a
cobertura de imagem da página 1 do FDE — a CAPA do livro, onde o título
`"Fundamentals of Data Engineering"` é **corretamente** detectado e
desejado. Cobertura de imagem: **100%** — mais alta até que a página do
gráfico defeituoso que motivou a recomendação (58%). Qualquer limiar de
cobertura que suprimisse o gráfico também suprimiria essa detecção
correta da capa.

| Página | Cobertura de imagem | Classificação desejada |
|---|---|---|
| FDE pg-1 (capa) | **100%** | preservar (título correto) |
| FDE pg-28 (gráfico, defeito conhecido) | 58% | suprimir |
| Gil pg-106 (fluxograma, defeito conhecido) | 166% | suprimir |

Testado um segundo sinal candidato — volume de texto OCR e confiança
média do Tesseract (`conf`) — na esperança de que separasse os casos
sem depender de cobertura de imagem. Também não generalizou: a página
do fluxograma do Gil (defeito conhecido) tem volume de texto (1089
caracteres, 171 palavras) e confiança (94,2) **comparáveis a uma página
de prosa real** (pg-21: 1496 caracteres, confiança 95,8) — o Tesseract
lê os rótulos internos do diagrama como palavras reais, com confiança
alta, só que semanticamente sem sentido. Não é ruído de baixa
confiança; é leitura "correta" de conteúdo decorativo.

| Página | Volume (chars) | Confiança OCR média | Classificação |
|---|---|---|---|
| Gil pg-21 (prosa real) | 1496 | 95,8 | preservar |
| Gil pg-106 (fluxograma, defeito) | 1089 | **94,2** | suprimir (sinal não separa) |
| FDE pg-1 (capa, correto) | — (100% imagem) | 91,6 | preservar |
| FDE pg-28 (gráfico, defeito) | 86 | **52,7** | suprimir |

Os 2 casos reais conhecidos de "legenda corrompida" não compartilham o
mesmo perfil de sinal — um é conteúdo semanticamente errado mas de alta
confiança/volume (Gil), o outro é conteúdo de baixíssima
confiança/volume (FDE). Nenhum dos 3 sinais testados (cobertura de
imagem, volume de texto, confiança OCR) separa os dois sem risco de
suprimir detecções corretas — nem a capa do FDE, nem os títulos reais
de qualquer página normal dos livros 100%-escaneados (Gil, PEREIRA),
onde TODA página também é "imagem cobrindo a página" por definição.

**Decisão, análoga à Fase 4.5 ("investigado e abandonado")**: nenhuma
supressão implementada. Os 2 casos conhecidos continuam sem correção —
mesmo estado de antes, sem regressão. Não reabrir com os mesmos 3
sinais sem um dado novo que separe os 2 casos reais sem colidir com a
capa do FDE ou com os títulos corretos dos livros 100%-escaneados.

## Episódio 4b — o efeito colateral de stopwords, em três atos

### Ato 1 — a correção resolve o problema geral

`_STOPWORDS_CABECALHO` dividida em PT (lista original) e EN (18
palavras funcionais comuns em inglês — "the", "a", "an", "of", "to",
"and", "or", "in", "on", "for", "is", "are", "this", "that", "with",
"as", "by", "at"). Confirmado por execução real (`primeira_passada()`,
não uma função isolada) contra o PDF do FDE: o Cluster 1 (a frase de
introdução do livro vs. o título da capa, similaridade 0,75 antes) não
cluster mais — `"This book provides a snapshot..."` aparece agora como
singleton, similaridade real de 0,667. A frase real da introdução deixa
de ser removida do EPUB.

### Ato 2 — a validação final revela um problema novo, não previsto

Na mesma execução real usada para confirmar o Ato 1, um cluster que
antes tinha `contagem=2` (`"oreilly"` — uma nota de rodapé de citação —
mais uma variante) **cresceu para `contagem=3`** e passou a cruzar o
limiar, ganhando um terceiro membro: `"What Is the Data Engineering
Lifecycle?"` — um **cabeçalho de seção real**, da página 52. Esse
cabeçalho passou a ser removido do corpo da página — uma perda de
conteúdo estrutural real, do mesmo tipo do Cluster 1 antes de ser
corrigido, só que causada pela própria correção.

**Mecanismo confirmado por cálculo direto, não suposição**: remover uma
palavra presente nos dois lados de uma comparação de contenção pode
AUMENTAR a razão, não só diminuir — porque o denominador
(`min(|A|,|B|)`) encolhe junto com o numerador, e pode encolher
proporcionalmente mais.

| | Similaridade sem stopwords EN | Similaridade com stopwords EN |
|---|---|---|
| `"...What Is Data Engineering? (O'Reilly 2020)..."` vs. `"What Is the Data Engineering Lifecycle?"` | 0,667 (abaixo do limiar) | **0,75** (cruza o limiar) |

Remover `"is"` (presente nos dois lados) e `"the"` (só de um lado)
encolheu o conjunto menor de 6 para 4 palavras — proporcionalmente mais
que o outro conjunto (de 6 para 5) — subindo a razão acima do limiar. O
oposto exato do efeito que a correção pretendia.

### Ato 3 — investigação sistemática do alcance real do risco, motivada por uma pergunta direta

Depois de encontrar o Ato 2, a pergunta natural era: isso também
acontece em português, ou é só um acidente do inglês? A pergunta foi
feita explicitamente antes de decidir manter ou reverter a correção —
não assumido "é só um caso de inglês" sem checar.

**Método**: diff do arquivo de clusters **inteiro** (todas as linhas,
não só as já marcadas como cabeçalho) de cada um dos 3 livros de
calibração em português, comparando a execução de `primeira_passada()`
antes e depois da correção de stopwords.

**Resultado, com a nuance que importa**:
- 80 e 208 páginas: **zero diferença** — nenhuma linha do relatório de
  clustering mudou. Isso é uma prova direta, não ausência de teste: se
  nenhuma comparação de similaridade teve resultado alterado, é porque
  nenhuma linha desses 2 livros contém, como palavra reconhecida,
  nenhum dos 18 tokens em inglês agora tratados como stopword — o
  mecanismo do Ato 2 não teve nenhuma pré-condição para disparar.
- 903 páginas (PEREIRA): a pré-condição ocorreu exatamente 1 vez — a
  palavra "of" nos nomes de dois periódicos científicos em inglês
  ("American Journal of Medicine", "New England Journal of Medicine")
  citados na bibliografia em português. Nesse único caso real, o efeito
  foi o OPOSTO do problema do FDE: separou corretamente dois clusters
  que não deveriam estar juntos (nomes de periódico diferentes). O
  único cluster já marcado `[CABEÇALHO]` no PEREIRA — o cabeçalho real
  de página já validado — ficou idêntico, char a char, antes e depois.

**O que isso não prova**: que o mecanismo do Ato 2 nunca vai acontecer
em português. PEREIRA — um livro sobre como publicar artigos
científicos, com nomes de periódico e termos técnicos em inglês na
bibliografia — é justamente o perfil mais suscetível dos 3 livros PT
testados, e mesmo nele só 1 de ~578 clusters foi afetado, por acaso de
forma benigna. Um livro em português com mais palavras em inglês
espalhadas pelo corpo do texto (não isoladas na bibliografia, como em
PEREIRA) teria mais chance real de reproduzir o mesmo padrão do FDE.
Declarado explicitamente como **risco residual real, testado contra 3
livros sem reprodução do problema — não uma prova geral de que é
impossível**.

### A decisão final, com o resultado líquido declarado

Correção de stopwords **mantida**. Razão: o problema original (ausência
de stopwords em inglês) é um bug estrutural que afeta qualquer texto em
inglês processado pelo pipeline, não só os 2 casos já conhecidos —
reverter deixaria esse problema geral sem solução por causa de 1
caso-limite novo. Resultado líquido, declarado sem arredondar para
"resolvido": de 2 falsos positivos confirmados antes desta rodada, para
2 depois (1 corrigido — Cluster 1 —, 1 mantido por falta de calibração —
Cluster 2 —, 1 novo encontrado e documentado — oreilly/lifecycle) — mas
o bug estrutural que motivou a tarefa está corrigido, que era o
objetivo real.

## Por que este episódio (4a + 4b) é o mais forte do TRACE até agora

1. O episódio 4a mostra a mesma disciplina do episódio 2 (Fase 4.5) —
   uma hipótese que parecia certa sobre o mecanismo, derrubada por medir
   contra mais um caso real antes de confiar nela — mas desta vez a
   recomendação nem chegou a virar código: foi derrubada na própria
   verificação pré-implementação.
2. O episódio 4b não é só "encontrei um problema e decidi conviver com
   ele". É "encontrei um problema (Ato 2), testei sistematicamente sua
   extensão real antes de decidir (Ato 3), e declarei com precisão onde
   ele pode e não pode se repetir — incluindo o cenário específico que
   aumentaria o risco — sem esperar esse cenário acontecer de fato para
   documentá-lo".
3. A diferença entre os dois é a diferença entre aceitar risco residual
   às cegas e aceitar risco residual de olhos abertos: a correção foi
   mantida não porque o efeito colateral foi ignorado, mas porque seu
   alcance real foi medido, e o resultado dessa medição — não a
   ausência de investigação — é o que embasa a decisão.

---

# Quinto episódio — Fases 4.10 a 4.12: quando o próprio método de
# validação tem um ponto cego estrutural

## Por que este episódio é diferente de todos os anteriores

Os quatro episódios anteriores são sobre hipóteses de calibração de
texto/heurística (recuo, logo, stopwords, título) — em todos, o erro
era sobre **onde ou como** um critério se aplicava, descoberto rodando
o pipeline de produção contra dado real. Este episódio é o primeiro
inteiramente sobre **infraestrutura de teste e deploy** do app desktop:
a lição não é "o critério não generalizou", é "o método usado para
validar as mudanças — necessário porque este ambiente sandboxed não tem
acesso de Accessibility para clicar de verdade na janela nativa — tem
um ponto cego estrutural para duas categorias inteiras de bug". E essa
lição não apareceu uma vez: apareceu duas, em sequência, na mesma
sessão de trabalho.

Uma correção de registro antes de contar a história: uma versão inicial
da documentação da Fase 4.10 (em `ARCHITECTURE.md`/`TASKS.md`) descreveu
o incidente abaixo como "a segunda ocorrência" de um padrão já visto na
Fase 4.4 ("zigue-zague"). Isso estava **errado** — conferido agora
contra o conteúdo real da Fase 4.4, ela é uma correção pura de
heurística de texto em `foliant.py`, sem nenhum componente de app
desktop ou de deploy. Essa referência cruzada foi removida dos dois
documentos ao escrever este episódio. O episódio real não perde força
por isso — é a **primeira** ocorrência documentada deste padrão
específico, não a segunda, e mesmo assim se repete de novo, com uma
causa raiz diferente, poucas fases depois.

---

## Parte A — o incidente de deploy (Fase 4.10)

### O que aconteceu

A Fase 4.8 corrigiu dois bugs visuais do app desktop (rótulo de fase
travado, painel de log sem colapsar) e validou a correção via um
harness headless (Chrome + Playwright servindo `desktop/src/` real, com
os módulos do plugin Tauri substituídos por stubs — necessário porque
este ambiente não tem acesso de Accessibility para automatizar cliques
na janela nativa). Duas fases depois (Fase 4.9), múltiplos builds reais
do app foram gerados e testados de ponta a ponta para validar o
mecanismo de updater automático. O usuário então rodou o `Foliant.app`
já instalado até o fim, num livro de 903 páginas, e os **mesmos dois
bugs da Fase 4.8 reapareceram**.

### A causa raiz, com evidência, não suposição

> "`desktop/src/main.js` e `index.html` no repositório **já continham**
> as duas correções da Fase 4.8 [...] — confirmado por grep antes de
> qualquer outra hipótese."

O código-fonte estava certo. O problema era mais simples e mais fácil
de não notar:

> "`/Applications/Foliant.app/Contents/MacOS/foliant-desktop` tinha
> timestamp de **2026-09-04 20:00:31** — anterior a `desktop/dist/`
> (2026-09-04 22:03:59, gerado durante os builds reais da Fase 4.9, já
> contendo as correções da Fase 4.8) [...] Ou seja: os múltiplos builds
> reais feitos durante a validação da Fase 4.9 [...] foram todos
> copiados para diretórios de scratchpad para teste — **nenhum foi
> copiado para `/Applications`**. O app instalado na máquina do usuário
> nunca foi trocado desde antes da Fase 4.8 existir."

Antes de aceitar essa hipótese, duas alternativas óbvias foram
descartadas com evidência, não por eliminação de conveniência: duplicata
de instalação (`mdfind`/`find` só encontraram um `Foliant.app` real — o
caminho espelhado em `/System/Volumes/Data/Applications/` é o mesmo
arquivo via firmlink do APFS, mesmo inode confirmado por `stat -f "%d
%i"`) e regressão de código (descartada pelo grep inicial). Restou só a
explicação real: um build correto, já validado, que nunca chegou ao
lugar onde o usuário o executa.

### A mudança de processo — adotada depois do fato, não antes

> "toda tarefa futura que altere `desktop/src/*` e for validada só via
> harness headless [...] deve terminar com um checklist explícito antes
> de pedir validação visual ao usuário: (a) o `dist/` mais recente
> contém as strings da mudança? (b) o `/Applications/Foliant.app`
> instalado tem timestamp **posterior** ao commit/mudança mais recente
> em `desktop/src/`? Se a resposta a (b) for não, o app precisa ser
> reconstruído e reinstalado antes de qualquer pedido de validação ao
> usuário — não depois."

Vale registrar sem suavizar: essa checagem não existia antes de este
incidente acontecer. Não foi uma precaução prevista — foi uma reação a
um erro real já cometido. A Fase 4.11, que vem a seguir, mostra essa
mesma disciplina de "verificar timestamp antes de pedir validação"
sendo aplicada de verdade, pela primeira vez, exatamente como prometido.

---

## Parte B — os dois bugs que só o teste manual real encontrou (Fases 4.11-4.12)

### Sucesso aparente completo

A Fase 4.11 implementou cinco itens de polimento de UI (correção de
sobreposição de layout, feedback do botão "Verificar atualizações",
botões de ação pós-conversão via plugin `opener`, drag-and-drop de PDF,
rótulo mais claro do campo de idioma). Desta vez, a lição da Fase 4.10
foi aplicada à risca: `dist/` verificado por grep antes de instalar,
timestamp do `.app` confirmado posterior a todas as mudanças, smoke
test real de conversão rodado no binário recém-instalado. A suite de
testes headless (que já cobria a Fase 4.8/4.9 como regressão) fechou em
**20 de 20 asserções novas passando**, mais as 18 de regressão das fases
anteriores.

Por todos os critérios que o método de validação deste projeto conseguia
medir, a fase estava pronta.

### O que a validação manual real encontrou

A validação manual do usuário — não o harness, que não existe caminho
para automatizar neste ambiente sandboxed — encontrou dois bugs reais
que os 20 checks headless simplesmente não podiam capturar, por
natureza:

> "1. `'Abrir EPUB'` falhava com `Not allowed to open path`. 'Ver na
> Pasta' funcionava com o mesmo arquivo.
> 2. Drag-and-drop de arquivo não-PDF era rejeitado corretamente, mas
> sem nenhum aviso fora do log colapsado."

O primeiro é uma permissão real do sistema operacional, mediada pelo
runtime nativo do Tauri — um stub de `openPath()`/`revealItemInDir()`
no harness headless sempre "funciona", porque é só uma função JS vazia
que grava num objeto global; ele não pode reproduzir uma checagem de
escopo que só existe no binário Rust compilado. O segundo não é bem uma
lacuna do harness (o teste headless *tinha* confirmado a rejeição, só
não tinha verificado se havia feedback visível fora do log) — mas
reforça o mesmo ponto: 20/20 verde não significa "sem bugs", significa
"sem bugs nas dimensões que os asserts cobriam".

### A causa raiz real do bug de permissão (lida no código-fonte do plugin, não suposta)

> "lido `tauri-plugin-opener-2.5.5/src/commands.rs` — o comando IPC
> `open_path` (usado por `openPath()` da JS) recebe `command_scope` e
> `global_scope` e chama `scope.is_path_allowed(...)` antes de executar
> [...] sem nenhuma entrada de escopo [...] a lista fica vazia e
> **tudo** é negado. Já `reveal_item_in_dir` (usado por 'Ver na
> Pasta') **não recebe parâmetro de escopo nenhum** na assinatura do
> comando — não há checagem de escopo nessa API do plugin [...] Essa
> assimetria entre os dois comandos do mesmo plugin era a causa real —
> não falta de permissão 'geral' do opener."

A investigação não parou na causa raiz — foi atrás do padrão
recomendado para o cenário real (caminho de destino escolhido livremente
pelo usuário em tempo de execução, não fixo em tempo de build), e
confirmou, lendo o código-fonte, que a extensão automática de escopo do
diálogo de salvar cobre só o `fs`/asset protocol, nunca o escopo próprio
do `opener` — e que o `opener` não expõe API Rust nenhuma para estender
esse escopo em runtime, ao contrário do `fs`.

### A correção: tornar o acesso mais restrito, não mais amplo

O caminho fácil aqui seria alargar a permissão declarada — um glob
estático como `"**"` resolveria o erro imediatamente. Foi
deliberadamente rejeitado por contrariar o princípio de permissão
mínima já seguido no resto do projeto (`shell:allow-spawn`, por
exemplo, é escopado a um binário e argumentos específicos, não a
"qualquer comando"). A correção real foi na direção oposta:

> "dois comandos novos em `lib.rs` — `registrar_epub_gerado(caminho)`
> [...] e `abrir_epub_gerado()` (sem receber caminho nenhum da JS — lê
> o estado registrado e chama `app.opener().open_path(...)` direto)
> [...] Resultado: **escopo real mínimo** — só é possível abrir
> exatamente o arquivo que o próprio backend acabou de gerar nesta
> sessão, verificado no lado Rust [...] mais restrito do que qualquer
> glob estático teria sido, e sem precisar de nenhuma entrada de
> permissão nova."

O comando customizado contorna a checagem de escopo do plugin chamando
a API interna do `Opener` diretamente (a checagem só existe no wrapper
`#[tauri::command]` exposto para IPC, não na struct `Opener` em si) —
mas em vez de usar esse atalho para abrir qualquer caminho, ele só abre
o único caminho que o próprio app gerou, rastreado em estado Rust. A
permissão `opener:allow-open-path`, que não resolvia o problema mesmo
alargada (sem entradas de escopo, qualquer glob declarado exigiria de
qualquer forma uma entrada de `"allow"` explícita), foi removida por não
ser mais necessária.

---

## O padrão, resumido

1. Um harness automatizado headless, por mais completo que seus próprios
   checks pareçam (20/20, neste caso), tem um ponto cego **estrutural**
   para duas categorias de bug que não existem no ambiente onde ele
   roda: permissões reais do sistema operacional mediadas pelo runtime
   nativo, e estado de processo/binário já em execução ou já instalado
   em disco. Nenhum stub, por mais fiel que pareça, reproduz essas duas
   coisas — porque a fidelidade do stub é justamente o que as remove da
   equação.
2. Isso não é motivo para abandonar o harness — ele seguiu pegando
   regressão de tudo que já cobria, nas três fases deste episódio, sem
   nenhuma falha. É motivo para nunca tratar "passou no harness" como
   sinônimo de "validado", em especial para qualquer mudança que toque
   permissão de arquivo/SO ou ciclo de vida de processo/deploy.
3. O mesmo tipo de lacuna (build correto que não chega ao lugar certo,
   teste que não cobre a dimensão real do bug) gerou uma mudança de
   processo concreta só depois de acontecer — não antes. Registrar isso
   sem suavizar é mais valioso para o histórico do projeto do que
   apresentar a lição como se tivesse sido prevista desde o início.
4. A mesma lacuna se confirmou de novo, com uma causa raiz totalmente
   diferente, poucas fases depois — o que transforma isto de "um erro
   pontual" em "um padrão de risco da própria metodologia de trabalho
   deste projeto", que deve ser assumido como esperado, não como
   exceção, em toda tarefa futura de frontend/desktop.
5. A correção da referência à Fase 4.4 (acima) é, ela mesma, uma
   instância do mesmo princípio — só que na direção oposta. A afirmação
   errada não nasceu de uma investigação solitária: veio **repassada
   como fato já estabelecido** na própria instrução que pediu este
   episódio, que por sua vez a tinha herdado de uma sessão anterior. Só
   foi corrigida porque o mesmo hábito de "checar a fonte antes de
   aceitar" foi aplicado à instrução recebida, não só ao código sendo
   escrito. "Verificar antes de aceitar" vale nas duas direções do
   fluxo de trabalho — não é responsabilidade de um único papel.

---

# Sexto episódio — a hipótese errada sobre múltiplas entradas de scope do shell

A Fase 4.14 declarou duas entradas em `shell:allow-spawn.allow` com o
mesmo `name` (`binaries/foliant-core`), uma para o shape de conversão (8
args) e outra para o novo `--inspect` (2 args), presumindo que o motor de
permissões do Tauri as tratasse como alternativas — a primeira que
validasse, valeria. Essa suposição nunca foi testada contra uma
invocação real do sidecar dentro do app nativo (as validações anteriores
usavam o binário isolado via terminal ou um harness headless com stubs
de `@tauri-apps/*`, que não exercitam o motor de ACL de verdade). No
primeiro teste manual real, toda tentativa de `--inspect` falhava com
`"Scoped command argument at position 3 must match regex validation
^.+$ but it was not found"` — um erro que só faz sentido para a entrada
de 8 args, não para a de 2. A leitura do código-fonte do
`tauri-plugin-shell` (vendorizado em `~/.cargo/registry`) confirmou a
causa: a resolução de escopo usa `.find(|s| s.name == command_name)`,
pegando sempre a primeira entrada com aquele nome — não há iteração de
alternativas, e a segunda entrada era permanentemente inatingível. A
correção validada é dar um nome distinto por shape de args
(`binaries/foliant-core-inspect`), registrado como uma segunda entrada
em `externalBin` apontando para uma cópia do mesmo binário — cada nome
vira uma chave de busca isolada, sem abrir mão de nenhuma restrição de
shape. Lição: qualquer validação de ACL/scope do Tauri precisa, cedo ou
tarde, de um teste real dentro do app nativo — harnesses com API
stubada não cobrem essa camada, por mais fiel que seja o resto do
teste.

---

# Oitavo episódio — a conversão que "dava certo" sem produzir nada

A causa raiz do EPUB vazio investigado no ciclo anterior estava num
`elif` de três linhas em `construir_html`: quando uma página não gerava
nenhum parágrafo real e também não tinha título detectado, o código
escrevia `<p>&#160;</p>` — um espaço em branco — só para a seção não
ficar vazia no HTML. Essa linha nunca foi pensada como uma decisão sobre
qualidade de conversão; era só um detalhe de formatação para o Calibre
não reclamar de uma `<section>` vazia. O efeito colateral, nunca
percebido até o ciclo anterior, é que ela mascarava silenciosamente
páginas onde o OCR não extraiu absolutamente nada — o pipeline saía com
`exit 0` e a mensagem "Concluído", como se tivesse convertido um livro
de verdade. A evidência que expôs isso foi literal: um PDF de 3 páginas
de ruído puro gerou um `.epub` de 3 páginas, cada uma com o conteúdo
`<p> </p>` — nenhum erro, nenhum aviso, um "sucesso" completamente
vazio.

A correção não introduziu nenhum critério novo de qualidade de OCR nem
um threshold de confiança do Tesseract (isso continua não calibrado, é
a Fase 5.x futura). Ela apenas nomeia e usa a mesma condição binária que
já existia, silenciosamente, na linha que decidia entre parágrafos reais
e o `&#160;` de preenchimento — sem parágrafos e sem título é o único
sinal usado. Essa condição passa a alimentar uma lista de páginas
afetadas, retornada por `construir_html` e consumida por `main()`: se a
lista cobre todas as páginas do documento, a conversão é abortada antes
mesmo de invocar o Calibre (`FALHA:{"motivo": "sem_texto_legivel"}`,
exit 1) — evitando gastar o passo mais caro do pipeline num resultado
que já se sabe inútil; se cobre só parte, o EPUB é gerado normalmente,
com um marcador explícito no lugar do conteúdo ausente em cada página
afetada (`RESSALVA:{"paginas_sem_texto": [...]}`), e a UI mostra a tela
"com_ressalva" — um scaffold que existia desde a Fase 4.14 mas nunca
tinha sido acionado por nenhum caminho real do app.

Um ponto adicional, verificado antes de aceitar a numeração de página
proposta em vez de assumida: o número reportado ao usuário é a posição
física da página no arquivo (a mesma de `id="pg-N"`), não um rótulo de
numeração impressa que o PDF possa declarar via `/PageLabels`. Testado
com um PDF construído de propósito para divergir nos dois números
(front-matter em numeração romana, corpo em arábica) — confirmado que o
valor reportado é sempre a posição física, nunca o rótulo. Para o caso
real do Foliant (PDFs escaneados), essa é a escolha certa: esse
metadado praticamente não existe em PDFs de scanner, e mesmo quando
existe, nem todo visualizador o respeita — mas fica registrado como
risco residual conhecido, não como garantia universal.

---

# Nono episódio — dist desatualizado mascarando edições de frontend

Os 3 ajustes de UI (seletor de idioma, aviso de idiomas suportados,
renomeação do card) foram editados corretamente em `desktop/src/*`, mas
o teste manual inicial não refletiu nenhuma das mudanças. Causa:
`desktop/dist` (gitignored) é gerado a partir de `desktop/src` via
`pnpm build:web`, e o `.app` instalado embute um snapshot compilado
desse `dist` no binário Rust — editar a fonte não altera o binário já
instalado. O rebuild nunca tinha sido executado após as edições.
Corrigido rodando `build:web` → `tauri build` → reinstalação manual do
`.app`. Lição: qualquer validação manual de mudança de frontend precisa
confirmar, antes de testar, que o pipeline completo (`build:web` +
`tauri build` + reinstalação) rodou após a última edição — não basta
confirmar timestamp do `.app` (lição do ep. 5), é preciso confirmar que
o timestamp é POSTERIOR à edição mais recente do código-fonte.

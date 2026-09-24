# TRACE — um episódio real de engenharia neste projeto

Este documento não é um resumo do projeto. É a reconstrução, com dados
reais extraídos do histórico já registrado em [`TASKS.md`](TASKS.md) e
[`ARCHITECTURE.md`](ARCHITECTURE.md), de um único episódio de trabalho —
a Fase 4.4 ("correção de recuo de linha") — mostrando a sequência real:
instrução → hipótese → implementação → evidência que a contradisse →
correção → validação. Nada aqui foi reescrito para parecer mais limpo do
que foi; o ponto do episódio é justamente que a primeira versão estava
incompleta, e isso ficou registrado, não escondido.

> **Nota de numeração (registrada na Fase 4.20, atualizada ao gravar o
> décimo terceiro episódio).** A sequência de episódios pula o
> **sétimo**: os títulos saltam do sexto direto para o oitavo. Não há
> episódio perdido — é um número reservado e não usado. Mantido como
> está de propósito: renumerar quebraria todas as cross-refs existentes
> em `ARCHITECTURE.md`, `TASKS.md` e nos comentários de `foliant.py`,
> que citam os episódios pelo número atual. (O décimo terceiro, que
> antes também aparecia como lacuna nesta nota, foi preenchido — ver
> abaixo.)

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

---

# Décimo episódio — metadado de idioma do EPUB dessincronizado do idioma real de OCR/conteúdo

`convert_to_ebook()` passava `--language "por"` fixo ao Calibre desde o
commit inicial do pipeline v2 (`9b2e43e`), independente do `--lang`
recebido via CLI e já usado corretamente no Tesseract
(`primeira_passada(..., lang=args.lang)`). Todo EPUB gerado — mesmo
convertendo um PDF em espanhol ou inglês com `--lang spa`/`--lang eng`
— declarava `<dc:language>por</dc:language>` no OPF, um metadado de
acessibilidade incorreto (leitores de tela usam esse campo para regras
de pronúncia/hifenização). Nunca percebido porque os testes anteriores
sempre rodaram em português ou nunca inspecionaram o metadado do
arquivo final gerado, só o conteúdo/HTML.

Corrigido propagando `args.lang` até `convert_to_ebook()` (novo
parâmetro `lang: str`, usado em `--language lang` em vez do literal).
Formato confirmado com teste real do Calibre antes de aplicar a
correção: o mesmo código ISO 639-2 que o `--lang` do Tesseract já usa
(`por`, `spa`, `eng`, ...) é aceito nativamente por `--language`, sem
tradução — `ebook-convert ... --language spa` produz
`<dc:language>es</dc:language>` no OPF. Validado depois da correção
com a fixture `tests/fixtures/ressalva_parcial.pdf` nos três casos
(`spa`→`es`, `eng`→`en`, padrão sem flag→`pt`), sem regressão no
fluxo comum em português.

Distinto do problema já registrado em `ARCHITECTURE.md` (linhas
2262-2273) sobre `<html lang="pt-BR">` fixo no `HTML_HEADER` — aquele é
sobre o idioma do *conteúdo do livro* (ainda sem detecção automática,
fora de escopo, permanece como risco residual conhecido); este era
sobre o idioma do *motor de OCR* nunca chegando ao metadado do Calibre,
um simples desacoplamento entre duas variáveis que já existiam no
código, uma delas ligada corretamente e a outra hardcoded desde o
início.

---

# Décimo primeiro episódio — dois metadados de idioma divergentes no mesmo EPUB

O commit `b4453b4` (episódio anterior) propagou `args.lang` ao
`--language` do Calibre, corrigindo o OPF — mas `HTML_HEADER`
continuava com `<html lang="pt-BR">` hardcoded, um achado que já
estava registrado em `ARCHITECTURE.md` (linhas 2262-2273) *antes*
desse commit, mas não foi revisitado na hora de aplicá-lo. Resultado:
um EPUB convertido de um PDF em inglês passou a declarar
`<dc:language>en</dc:language>` no OPF e `<html lang="pt-BR">` no HTML
do mesmo arquivo — dois metadados de idioma divergentes no mesmo
e-book, uma inconsistência pior do que antes do fix parcial (antes,
ao menos os dois lados concordavam, mesmo que ambos errados).

Corrigido propagando `args.lang` também ao `HTML_HEADER`, via um
mapeamento estático de código (`_LANG_OCR_PARA_HTML`, ISO 639-2/T de
3 letras usado pelo Tesseract/Calibre → BCP 47 de 2 letras exigido
pelo atributo `lang` do HTML5) — conversão determinística de formato,
não detecção de idioma. Validado com a fixture
`tests/fixtures/ressalva_parcial.pdf` nos três casos (`por`→`pt`,
`eng`→`en`, `spa`→`es`): OPF e HTML do mesmo EPUB agora concordam. O
risco residual identificado desde o achado original permanece e está
documentado nos dois pontos do `ARCHITECTURE.md`: `args.lang` é o
idioma declarado ao motor de OCR, não uma validação do idioma real do
conteúdo do livro.

**Lição, generalizável a qualquer par de metadados espelhados neste
projeto**: uma correção parcial aceita conscientemente como trade-off
num lugar (aqui, o OPF) precisa ser propagada ao mesmo tempo para o
lugar espelhado (aqui, o HTML) — ou a "correção parcial" não fica
neutra, ela cria uma inconsistência nova e pior do que o bug original
que motivou a correção.

# Décimo segundo episódio — inspeção de fidelidade de formatação: sete
perguntas, cinco achados reais, dois "não se aplica"

Investigação pura (nenhum código de produção alterado), motivada por
dois problemas já observados pelo usuário no EPUB gerado: aspas mal
formatadas e dúvida sobre extração de imagens de corpo. Em vez de
supor, cada um dos sete itens foi testado chamando as próprias funções
de `foliant.py` (`extrair_texto_pagina`, `limpar_linha`,
`unir_linhas_em_paragrafos`) sobre páginas reais de
`samples/Artigos Científicos... PEREIRA.pdf` (903 páginas, texto
nativo) e `samples/001-080.pdf` (escaneado, caminho OCR) — o mesmo
livro nativo que já tinha revelado o bug de recuo de linha no Quarto
episódio.

**1. Aspas — CONFIRMADO, acha a causa exata.** `_RE_RUIDO_INICIAL`
(linha ~189) trata até 3 caracteres decorativos no INÍCIO de qualquer
linha como ruído a descartar — e a classe de caracteres inclui aspas
retas E curvas (`"'""`). Isso não é um problema de OCR confundindo
aspas: acontece também no caminho nativo. Evidência real, página 800
do PEREIRA: a linha original `'“Muitas regras para a realização...'`
(abre uma citação de Ramón y Cajal) sai de `limpar_linha()` como
`'Muitas regras para a realização...'` — aspa de abertura apagada. A
aspa de fechamento, 5 linhas depois, sobrevive (não está no início de
linha) e fica órfã: `'...estímulos alentadores.”'` no parágrafo
final. Mesma função roda idêntica no caminho OCR (nenhuma
diferenciação de fonte), então o defeito é estrutural ao
`limpar_linha()`, não a uma falha específica de reconhecimento.

**2. Imagens no corpo — CONFIRMADO: gap arquitetural total, não
parcial.** `get_images()`/`extract_image()` só são chamados dentro de
`extrair_capa()` (linha ~811), restrito à página 0. Não existe
nenhuma outra chamada a essas APIs nem qualquer emissão de `<img>` no
HTML gerado (`grep` confirma). Ambos os livros de amostra têm figuras
reais no corpo — 39 páginas com imagem (além da pg. 0) em "Fundamentals
of Data Engineering" e 37 no PEREIRA — nenhuma delas chega ao EPUB.
Não é uma lacuna nunca percebida por acidente sutil: é ausência total
e sem exceção de qualquer caminho de código que leia imagem de corpo.

**3. Itálico/negrito — CONFIRMADO: informação existe na fonte e é
descartada no código, mais um limite de ferramenta no caminho OCR.**
No caminho nativo, `extrair_linhas_nativas()` (linha ~549) monta o
texto só com `span["text"]`, nunca lendo `span["flags"]` (bit de
itálico) nem o nome da fonte (que indicaria negrito) — e a informação
existe de fato: página 800 do PEREIRA tem o título de obra "Regras e
conselhos sobre a investigação científica" em itálico real no PDF
(`flags=6`, bit itálico setado), que sai como texto plano idêntico ao
resto do parágrafo. No caminho OCR, o próprio `pytesseract.image_to_data()`
não expõe estilo de fonte (chaves do dict: `level, page_num, block_num,
par_num, line_num, word_num, left, top, width, height, conf, text` —
nenhum campo de estilo) — limite da ferramenta, não do código.

**4. Hifenização de fim de linha — CONFIRMADO, mas como comportamento
CORRETO, não bug.** Testado com um caso real de quebra por hífen em
`samples/001-080.pdf` (caminho OCR, página 3): a linha `'...prover a
melhor informa-'` mais a linha seguinte produzem corretamente
`'...prover a melhor informação científica e distribuí-la...'` no
parágrafo final — override 1 de `linhas_inicio_paragrafo()` (hífen no
fim da linha anterior força continuação) e a lógica de junção em
`unir_linhas_em_paragrafos()` (remove o hífen e cola direto) funcionam
como projetado. Não é item de correção.

**5. Layout em colunas múltiplas — NÃO SE APLICA.** Busca automatizada
por páginas com duas concentrações de `x0` de linha abaixo de ~70% da
largura da página, nos dois PDFs nativos disponíveis, achou candidatos
só no PEREIRA (64 páginas) — mas inspeção manual de várias delas
(pg. 41, pg. 100) mostra que são tabelas de 2-3 colunas (rótulo/código/
ano), não texto corrido em colunas de leitura. Nenhuma amostra
disponível tem de fato um artigo em layout de coluna dupla de texto
corrido — não construí um PDF sintético forçado para este item,
conforme escopo definido.

**6. Tabelas — CONFIRMADO, o achado mais grave da lista.** Duas tabelas
reais testadas (PEREIRA pg. 41 e pg. 800, ambas nativas — sem depender
de OCR). Em ambos os casos o resultado é o mesmo: nenhuma estrutura de
linha/coluna sobrevive. Exemplo pg. 41 (tabela rótulo/código-NBR/ano):
o HTML final gerado funde a tabela inteira, a nota de rodapé da tabela
e a PRÓXIMA tabela num único parágrafo de texto corrido de ~90
palavras, com números e anos soltos sem nenhum vínculo visual ou
estrutural ao rótulo a que pertenciam (ex.: `'2011 Numeração e
coordenação Editoração de traduções'` — três células de duas linhas
diferentes da tabela grudadas numa frase sem sentido). Isso quebra
legibilidade, não é só perda estética.

**7. Notas de rodapé — CONFIRMADO, dois defeitos empilhados.** O livro
usa numeração de nota sobrescrita colada à palavra (sem espaço) —
ex. `'...se pronunciou:1'`, `'...obra mencionada1'` (pg. 800) — que já
sai ambígua no texto plano (sem sobrescrito, parece parte da frase).
Pior, na pg. 41 a nota de rodapé real da tabela (marcada por `*` no
original: `'*A expressão "normas brasileiras" é usualmente
empregada...'`) tem o `*` removido pelo MESMO bug do item 1
(`_RE_RUIDO_INICIAL` também trata `*` como ruído inicial) — a nota
perde o único vínculo visual que a ligava ao marcador da tabela, e
ainda fica fundida ao texto de corpo adjacente pelo defeito do item 6.
Nenhuma nota de rodapé nas amostras inspecionadas mantém qualquer
referência restaurável à chamada no texto principal.

**Severidade (legibilidade/estrutura vs. estética) — não é decisão de
prioridade, só classificação para orientar uma decisão futura:**
- Quebra estrutura/legibilidade: **tabelas (6)** — conteúdo tabular
  vira texto corrido sem sentido; **notas de rodapé (7)** — perde
  vínculo com a chamada, funde-se ao corpo.
- Perda de conteúdo, sem quebrar legibilidade da prosa ao redor:
  **imagens de corpo (2)** — figura inteira ausente, texto ao redor
  continua legível; **aspas (1)** — perde par de aspas mas a frase
  continua compreensível.
- Estético, sem perda de informação legível: **itálico/negrito (3)**
  — ênfase perdida, texto ainda correto e completo.
- Não é bug: **hifenização (4)** funciona; **colunas múltiplas (5)**
  não tem amostra real disponível para testar.

**Não investigado nesta rodada** (fora do escopo/tempo desta etapa):
qualidade/resolução da imagem extraída em comparação ao original (não
chegou a ser testado porque nenhuma imagem de corpo é extraída — item
2 já bloqueia essa sub-pergunta); teste do item 1 especificamente pelo
caminho OCR com um diálogo real citado entre aspas (a causa já foi
confirmada estrutural ao `limpar_linha()`, comum aos dois caminhos, o
que tornou um segundo teste redundante para confirmar a MESMA causa —
mas nenhum exemplo OCR de aspas foi inspecionado lado a lado); PDF
sintético multi-coluna para validar se o critério de ordem de leitura
do PyMuPDF quebraria nesse cenário (decisão de escopo: instrução
pedia para não forçar teste artificial nos itens sem evidência real
disponível).

# Décimo terceiro episódio — correção real da limpeza de ruído decorativo: aspas e marcador de nota preservados

Implementação da correção identificada no décimo segundo episódio
(itens 1 e 7: aspas retas/curvas removidas indevidamente da classe de
ruído inicial; `*` colado a palavra tratado como decorativo sem
distinção). O décimo segundo episódio foi investigação pura — este é o
fix aplicado depois, sobre `_RE_RUIDO_INICIAL` (`foliant.py`).

**Mudança na regex**: a classe de caracteres tratados como ruído
decorativo no início de linha deixou de incluir aspas (retas `'` `"` e
curvas `" " ' '`) por completo — nenhum caso real de "aspa solta = ruído
genuíno de OCR" apareceu na investigação, só regressão (a aspa de
abertura da citação de Ramón y Cajal, PEREIRA pg. 800). O `*` passou a
só ser tratado como ruído quando **não** está colado a uma palavra —
lookahead negativo `(?!\w)` — para preservar o marcador de nota de
rodapé (`"*Reúne instruções..."`, PEREIRA pg. 41) sem deixar de limpar
os dois casos reais de `*` puramente decorativo já validados antes da
regressão: a linha isolada `"*"` do ícone do logo GEN OCRizado
(`samples/001-080.pdf` pg. 4, Fase 4.5) e o marcador de margem repetido
`"* "` (sempre seguido de espaço) que se repete no início de dezenas de
linhas de corpo do mesmo livro, páginas 23 a 77 — confirmado por OCR
real nesta correção, não suposição.

Padrão final: `_RE_RUIDO_INICIAL = re.compile(r'^(?:[—\-;\s]|\*(?!\w)){1,3}')`.

**Validação**: rodada contra os 3 fixtures de regressão
(`tests/fixtures/`) — sem mudança de comportamento nos dois casos de
falha/ressalva (nenhum deles depende de `_RE_RUIDO_INICIAL` para o
resultado que já era esperado), confirmando que a correção não abre
regressão nova nos casos já cobertos por teste automatizado.

# Décimo quarto episódio — extração de imagem de corpo: gap fechado, dois
bugs reais achados só na validação ponta a ponta

Implementada a extração de imagens de corpo (diagramas/gráficos) para
PDFs de texto nativo, reaproveitando `get_text("dict")` (blocos de
imagem já vêm ordenados junto do texto, bytes inclusos — sem precisar de
`get_images()`/`extract_image()` separado). Filtro de 20pt exclui
glifos decorativos (validado: 2 ícones de borda de tabela do PEREIRA
pg. 645).

Dois bugs reais, achados só ao rodar o pipeline de produção completo
contra os livros de amostra (não um script de pesquisa):

**1. Causa raiz: resolução de link simbólico, não o diretório em si.**
`tempfile.TemporaryDirectory()` no macOS cai em `$TMPDIR` (algo como
`/var/folders/.../T/tmpXXXXXXXX`) — um caminho sob `/var`, que é link
simbólico para `/private/var`. `--cover` (path absoluto passado direto
na linha de comando ao Calibre) sempre funcionou; `<img src="...">` de
imagem de corpo (arquivo irmão de `livro.html`, só referenciado de
dentro do HTML, nunca passado como argumento) falhava SILENCIOSAMENTE —
exit 0, a tag `<img>` sobrevivia no HTML, mas o arquivo nunca entrava no
`.epub` final. Confirmado por eliminação (mesmos bytes, mesmo modo
0644, mesmo processo) que a única variável era o diretório pai, e por
teste direto que `os.path.realpath()` do path original já resolve para
`/private/var/folders/...` — usar esse caminho RESOLVIDO faz o Calibre
encontrar as imagens. Tentativa inicial (`dir="/private/tmp"`
hardcoded) resolvia o sintoma no Mac mas quebrava Linux (path
inexistente); substituída por `tmp_dir = Path(os.path.realpath(tmp))` —
cross-platform por construção (`realpath()` é no-op onde não há link
simbólico a resolver, caso típico do Linux; mecanismo é padrão do SO,
não exclusivo de macOS). Sem máquina Linux disponível para testar
diretamente nesta sessão — validado por leitura de código que o fix não
depende de nenhum caminho/comportamento exclusivo de macOS, mas a
validação real em Linux fica como risco residual não testado.

**2. Legenda de figura fundida ao parágrafo seguinte.** Marcador de
imagem contaminava a mediana de recuo da página (usada para classificar
início de parágrafo), fundindo a legenda de figura com o parágrafo de
corpo seguinte dentro do mesmo `<figcaption>`. Corrigido excluindo
marcadores do cálculo estatístico e capturando a legenda direto dos
blocos crus de `get_text("dict")`, antes da fusão de parágrafos — não
depois.

Validado com os 2 livros completos (FDE 210pg., PEREIRA 903pg.), o
livro 100% escaneado (zero regressão — extração só cobre caminho
nativo) e os 3 fixtures de falha/ressalva.

# Décimo quinto episódio — texto duplicado da capa no corpo do EPUB: heurística ingênua corrigida antes de virar regressão

Investigação partiu de uma dúvida concreta: `extrair_capa()` já extrai a
imagem da página 0 como capa (`--cover`), mas o *texto* dessa mesma
página continuava passando pelo fluxo normal de OCR/nativo e virando
parágrafo de corpo — achado real, confirmado com o EPUB já commitado do
PEREIRA (903pg.): `livro_split_000.html` continha `<p>Maurício Gomes
Pereira Artigos Científicos Como Redigir, Publicar e Avaliar</p>`,
repetindo texto já mostrado visualmente pela capa. `--inspect`
(autopreenchimento de título/autor) foi confirmado como caminho
totalmente independente (usa `doc.metadata`, nunca lê texto de página) —
não havia risco de acoplamento entre os dois usos.

**Primeira tentativa, descartada em fixture antes de chegar a produção.**
Heurística inicial: suprimir texto da página 0 sempre que `extrair_capa()`
retornasse uma imagem (`capa_path is not None`). Rodar os 3 fixtures de
regressão do episódio 8 revelou o problema na hora: `extrair_capa()`
extrai a primeira imagem embutida da página 0 **independente do que ela
contém** — qualquer página 0 renderizada como imagem (inclusive conteúdo
real, inclusive ruído sintético) passa. `ressalva_parcial.pdf` (página 1
com texto real desenhado sobre imagem, simulando OCR) teve esse texto
**apagado silenciosamente do corpo** — o mesmo risco que a investigação
original já tinha sinalizado como hipotético ("se esse padrão existir em
algum PDF de usuário, supressão incondicional perderia texto real") se
materializou de imediato num fixture do próprio repo, não em produção.
`falha_ocr_ilegivel.pdf` (3 páginas de ruído puro, usado para garantir
que 100% de páginas ilegíveis aborta a conversão) também regrediu: a
página 0 deixou de contar como "sem texto", e o gate `FALHA:sem_texto_legivel`
parou de disparar.

**Correção: comparar com metadado, não só checar se há imagem.** Sinal
trocado para `pagina0_e_duplicata_de_metadados()` — só suprime quando
`capa_path is not None` **E** o texto da página 0, normalizado e
comparado palavra a palavra, é integralmente "coberto" pelo
título+autor já conhecidos via `doc.metadata` (mesmos campos que
`inspecionar_pdf` usa). Comparação por palavra, não substring exata: o
OCR da capa do PEREIRA saiu na ordem "autor, depois título"
("Maurício Gomes Pereira Artigos Científicos...") — diferente da ordem
dos campos separados no metadado, mas as mesmas palavras. Sem
título/autor no metadado, não há sinal confiável — não suprime.

Revalidado nos mesmos 2 livros completos do episódio 14 (FDE 210pg.,
PEREIRA 903pg.) e nos 3 fixtures de falha/ressalva:
- **PEREIRA**: duplicação confirmada removida (`pg-1` fica vazio),
  capa intacta em `titlepage.xhtml`, extração de imagem de corpo
  (episódio 14) intacta em `pg-2`/`pg-3`.
- **FDE**: texto da página 0 **não** suprimido — corretamente, porque
  além de título/autor há subtítulo/selo de edição real ("Plan and
  Build Robust Data Systems", "RAW & UNEDITED"), então o residual da
  comparação ultrapassa o limiar e a heurística conservadoramente
  recua. Mesmo comportamento documentado na Fase 4.5 (título de capa
  promovido a `<h2>`, preservado) — nenhuma regressão.
- **3 fixtures**: `falha_ocr_ilegivel` volta a abortar corretamente
  (nenhum tem metadado de título/autor, então a heurística nunca
  dispara nelas); `ressalva_parcial` preserva o texto real da página 1.
- **`capa_path is None`** (PDF sem imagem extraível na página 0, ex.
  currículo nativo): comportamento herdado, sem nenhuma mudança.

**Risco residual explícito, não resolvido por falta de amostra**: não é
"qualquer PDF com capa extraível e texto real seria suprimido" — a
segunda camada (`pagina0_e_duplicata_de_metadados()`) já descarta esse
caso genérico, confirmado pelo próprio fixture que a expôs
(`ressalva_parcial.pdf`) e pelo FDE. O risco que sobra é mais estreito:
um PDF **com metadado de título/autor preenchido**, cuja página 0
misture capa com conteúdo de leitura genuíno que colida por acaso com as
palavras do título/autor, dentro do limiar de `≤15 caracteres residuais`
(`foliant.py:1093`) — nesse caso específico, a supressão dispararia
mesmo havendo conteúdo real. Não há, na amostra disponível (PEREIRA:
capa pura; FDE: capa com subtítulo real, corretamente não suprimida),
nenhum PDF que exponha esse caso. Registrar como limitação conhecida,
não como garantia universal — mesmo espírito da ressalva já registrada
na Fase 4.5 sobre a tentativa (abandonada) de supressão incondicional de
título de capa.

# Décimo sexto episódio — detecção de tabela: três sinais testados, nenhum viável sem falso positivo

Investigação motivada pelo achado mais grave do décimo segundo episódio
(item 6): tabelas nativas do PEREIRA (pg. 41 e pg. 800/801, confirmadas
visual e textualmente) viram texto corrido sem estrutura de
linha/coluna no EPUB gerado. Objetivo desta rodada: avaliar se existe
sinal real — não heurística inventada — para detectar um bloco de
tabela e aplicar CONTENÇÃO (preservar como texto pré-formatado, sem
reconstruir a estrutura visual). Investigação pura, nenhum código de
produção alterado.

**Sinal 1 — `page.find_tables()` (API nativa do PyMuPDF 1.28.2),
estratégia default (`lines_strict`/`lines`)**: 0 tabelas detectadas nas
3 páginas de tabela confirmadas. Falso-negativo puro — nunca dispara
nessas condições, inútil como sinal.

**Sinal 2 — `find_tables(strategy='text')`**: dispara em praticamente
toda página testada, tabela ou prosa, com bbox cobrindo ~100% da
página e `.extract()` sem sentido (quebra palavras soltas em
"colunas"). Falso positivo generalizado — inutilizável pelo motivo
oposto ao sinal 1.

**Sinal 3 — geometria manual (`get_text("dict")["blocks"]`, gap
horizontal entre linhas na mesma faixa de Y)**: o único com
sensibilidade real. Baseline medido (não estimado) de espaçamento entre
palavras em prosa normal: máximo absoluto 15.36pt, em qualquer página
testada. Gap entre células de linhas diferentes, nas 3 páginas de
tabela confirmadas: de 36.1pt a 267.2pt — margem clara para um
threshold em ≥30pt. Acertou as 3 tabelas conhecidas e passou limpo no
teste negativo direto pedido (3 páginas de prosa pura). Mas o teste
negativo foi além do pedido — rodado contra as 903 páginas do livro
inteiro, não só as 3 amostradas — e revelou **4 falsos positivos reais
e estruturais**: páginas de bibliografia com URL fragmentada em runs de
texto separados (gaps de 23pt a 101pt), cuja faixa **se sobrepõe
diretamente** à faixa de gap de tabela real (36pt-267pt). Não existe
threshold único que separe os dois casos sem também perder a tabela de
menor gap conhecida (36.1pt). Threshold mais baixo (20pt) introduz um
segundo tipo de falso positivo (marcadores decorativos "•" alinhados à
primeira linha do parágrafo, gap ≈22.5pt, 4 páginas de prosa) — abaixar
o limiar piora, não resolve.

**Por que ir além das 3 páginas pedidas mudou a conclusão**: um teste
negativo de 3 páginas escolhidas a dedo (meio do livro, prosa óbvia)
teria reportado zero falso positivo e validado o sinal geométrico como
seguro. Só ao escanear o livro inteiro (903 páginas, 45s de execução —
barato o bastante para não ser um obstáculo) apareceu o caso real que
derruba o sinal — mesma lição estrutural do décimo segundo episódio
(inspeção de fidelidade): um teste negativo pequeno demais mascara
exatamente o tipo de exceção que só aparece em escala real.

**Custo**: `find_tables()` default, 147.6ms/página (~2min13s
extrapolado para os 903 páginas do PEREIRA); `strategy='text'`,
304.6ms/página (~4min35s) — mais caro e ainda mais falso positivo.
Sinal geométrico manual: as 903 páginas inteiras em 45s (~50ms/página),
mas descartado pelo falso positivo, não pelo custo.

**Decisão**: não implementar contenção de tabela nesta rodada. Tabelas
continuam sem tratamento especial — texto corrido, comportamento atual
preservado. Falso negativo (tabela não tratada) é aceito como status
quo; falso positivo (bibliografia virando bloco monoespaçado) é o risco
assimétrico que motivou a rejeição dos 3 sinais. Mesmo padrão da Fase
4.5 (supressão de título de capa: investigada, sem solução viável
identificada, não forçada) — "não é viável com o método disponível" é
tratado aqui como conclusão de investigação válida, não como tarefa
inacabada.

# Décimo sétimo episódio — detecção de imagem em página escaneada: premissa original falsa, sinal substituto promissor mas subamostrado

Investigação motivada pelo mesmo gap do décimo quarto episódio: extração
de imagem de corpo funciona no caminho nativo (`get_text("dict")`), mas
não existe equivalente no caminho OCR — `extrair_texto_pagina()`
(`foliant.py:883-890`) roda `pytesseract.image_to_data()` só para
reconstruir texto, nunca para localizar regiões não-textuais.
Investigação pura, nenhum código de produção alterado.

**Premissa original — falsa**: a hipótese de partida era que
`image_to_data()` retorna `conf == -1` para blocos que o Tesseract não
reconhece como texto, e que esse sinal poderia indicar região de
imagem. Inspecionado o dict bruto em várias páginas: `conf == -1`
**nunca ocorre no nível de palavra** (`level == 5`) — só nos níveis
agregados 1-4 (página/bloco/parágrafo/linha), que são estruturais e
aparecem em TODA página, com ou sem imagem (confirmado nas 208 páginas
do teste negativo abaixo: zero exceções). Como sinal de "região não
reconhecida como texto", `conf == -1` é inútil — não discrimina nada.

**Sinal substituto — palavras de confiança muito baixa (`conf < 10`,
nível palavra)**: o Tesseract não recusa reconhecer marcas não-textuais
(traços de gráfico, eixos, barras) — ele as lê como texto e produz
"palavras" garbled com confiança próxima de zero (ex.: `conf=0`), não
`conf=-1`. Esse é o sinal real disponível.

**Amostra positiva conhecida**: `samples/livro_completo_208pg.pdf`
(208p., 100% escaneado, obra "Gil") tem exatamente **uma** figura de
conteúdo real confirmada visualmente em todo o livro — página de índice
178 (0-indexed), "Figura 20.2", um cronograma/gráfico de Gantt.
Confirmado por dois métodos independentes: inspeção visual de contact
sheet das 208 páginas e ranking por densidade de tinta (fração de
pixels escuros no thumbnail) — nenhum outro candidato a figura de
conteúdo apareceu nos dois métodos combinados (as demais páginas de
maior densidade são títulos de capítulo em negrito grande, não
figuras). `image_to_data()` na pg. 178 produz 7 palavras `conf<10`,
espacialmente dentro da região do gráfico (x 364-1445 de 1606, y
713-2068 de 2290) — coincide com a posição real confirmada
visualmente.

**Teste negativo AMPLIADO (obrigatório, rodado no livro completo, não
em amostra)**: as 208 páginas do livro inteiro, não só 2-3.
`conf<10` sozinho **não discrimina**: 84/208 páginas (40%) têm pelo
menos 1 palavra `conf<10` — inclusive várias páginas de prosa pura sem
nenhuma figura. A pg. 126 (prosa pura, sem figura) tem **17** palavras
`conf<10` — mais que a própria página com figura real (7). Contagem ou
fração de palavras de baixo-conf, isoladamente, teria dado falso
positivo maior que o verdadeiro positivo.

**Filtro de tamanho testado**: altura de bbox (`height`, em px de
render a 200 DPI) separa os dois grupos de forma nítida. Palavras
`conf<10` de página de prosa comum têm no máximo ~76px de altura
(ruído de OCR em pontuação solta ou palavra isolada mal lida); a pg.
178 tem 4 das 7 palavras `conf<10` com altura entre 186px e 664px —
2,5x a 8,7x mais altas que qualquer falso positivo observado. Com
limiar `height > 100px`: **0 falsos positivos nas 207 páginas
negativas** (nenhuma delas tem qualquer palavra `conf<10` com altura
>100px) e a página 178 mantém 4 palavras qualificadas. Mecanismo
provável: o Tesseract funde múltiplas "linhas" de marcas não-textuais
(eixo rotacionado, barras) numa única bbox de "palavra" alta, porque
não há estrutura de linha de base para segmentar — comportamento que
não ocorre em texto real, mesmo mal reconhecido.

**Risco residual explícito — N=1 no positivo**: ao contrário do teste
negativo (207 páginas reais, resultado forte), o teste positivo tem
uma única figura conhecida disponível no corpus atual do projeto. Os
outros PDFs escaneados de amostra (`001-080.pdf`, `081-160.pdf`,
`161-208.pdf`) são a MESMA obra "Gil" (confirmado em
`scripts/calibracao_ocr_resultados/RELATORIO.md`), não uma segunda
figura independente; o PEREIRA (903p.) é quase todo nativo (só 1
página cai no caminho OCR); o "Fundamentals" é nativo com poucas
páginas OCR, sem figura escaneada conhecida. Calibrar e validar um
limiar (`height > 100px`) contra uma única figura positiva é o mesmo
tipo de risco amostral que derrubou o sinal de tabela no décimo sexto
episódio — só que aqui o risco está do lado do RECALL (o mecanismo que
gera o sinal — fusão de marcas rotacionadas/densas numa bbox alta —
pode não se repetir em outros tipos de figura, ex. foto ou diagrama de
linha limpo sem marca rotacionada), não do lado do falso positivo, que
foi testado a fundo e ficou zerado.

**Extração da região (viabilidade, não custo proibitivo)**: recortar a
região candidata do pixmap já renderizado (`pixmap.crop(...)` via PIL)
custa ~12ms, desprezível. Salvar o recorte custa ~0.7s em PNG ou
~0.14s em JPEG (medido num recorte de página inteira, pg. 178) — caro
comparado a um recorte típico bem menor, mas ainda pequeno frente ao
custo-base de ~6,08s/página já pago pelo próprio `image_to_data()`
(Fase 4.15). Diferença estrutural do caminho nativo: lá o byte original
da imagem embutida é gravado direto (`write_bytes`, grátis); no
caminho OCR não existe imagem original — só o raster já renderizado a
200 DPI — então qualquer imagem extraída aqui é necessariamente uma
recompressão com perda desse raster, nunca a qualidade da imagem
original do scanner.

**Decisão**: não implementar nesta rodada. Diferente do décimo sexto
episódio (falso positivo genuíno e irredutível em qualquer limiar), o
sinal aqui passou limpo no teste negativo completo — mas com evidência
positiva grande demais insuficiente (N=1) para calibrar um limiar de
produção com confiança. Próximo passo, se este caminho for retomado:
localizar ou adquirir um segundo livro escaneado com figura de
conteúdo real e de tipo visual diferente (foto ou diagrama sem marca
rotacionada) antes de fixar `height > 100px` como limiar de produção —
sem isso, "0 falso positivo" é um resultado real mas não garante
recall aceitável fora do único caso testado.

# Décimo oitavo episódio — mapeamento de extração de figura em página escaneada: o sinal do 17º episódio detecta a coisa errada, e o corpus não tem o caso-alvo

Rodada de mapeamento e análise, sem implementação, antes de decidir a
direção de extração de figura no caminho OCR. Três achados, todos
medidos nesta máquina (macOS 13.7.8, Tesseract 5.5.3, RENDER_DPI=200).

**1. O sinal do décimo sétimo episódio é um detector de texto
rotacionado, não de figura.** O 17º episódio registrou que palavras
`conf<10` com `height > 100px` marcam região de figura, e hipotetizou o
mecanismo como "o Tesseract funde múltiplas linhas de marcas
não-textuais numa única bbox de palavra alta, porque não há estrutura
de linha de base para segmentar". Extraí o TSV bruto da pg. 178 do
`livro_completo_208pg.pdf` e inspecionei as 18 palavras `conf<10` uma
a uma. Não são marcas não-textuais fundidas — são os rótulos de linha
do gráfico de Gantt, que estão **impressos rotacionados 90°** na
página, lidos de lado:

```
h=414 w= 55 conf=0.0 'otlerizr/otist|bilerler(tr/or]'
h=270 w= 38 conf=0.0 'OpdeZITeUonprINdO'  -> "Operacionalização"
h=206 w= 38 conf=0.0 'sasopesinbsad'      -> "pesquisadores"
h=194 w= 37 conf=0.0 'opseongadsa'        -> "Especificação"
h=161 w= 36 conf=0.0 'opóeiogera'         -> "Elaboração"
h= 93 w= 29 conf=3.4 'BI9JoD'             -> "Coleta"
```

Todas com largura entre 24px e 55px — são palavras únicas viradas, não
blobs. O resultado negativo do 17º episódio (0 falsos positivos em 207
páginas) continua válido e continua forte. O que muda é a
interpretação do recall: não é "N=1, recall desconhecido" — é **recall
estruturalmente limitado a figuras que contenham texto rotacionado**.
O limiar não dispararia numa foto, num gráfico de barras com rótulos
horizontais, ou num fluxograma com caixas de texto na horizontal.
Calibrar `height > 100px` contra mais amostras do mesmo tipo visual
não resolveria isso — confirmaria o artefato.

**2. `ocr_photo` do hOCR: testado e reprovado como detector, pelo mesmo
perfil do `find_tables()` do 16º episódio.** A produção usa
`image_to_data` (TSV), que carrega `block_num` como identificador mas
**não carrega tipo de bloco**. O Tesseract 5.5.3 já classifica regiões
e expõe isso em hOCR/ALTO/PAGE — saídas que o projeto nunca usou.
Custo marginal é essencialmente zero: `tesseract entrada saida tsv
hocr` produz os dois arquivos numa **única invocação**, com o
reconhecimento compartilhado; só a serialização duplica.

Na FDE p.112 o Tesseract emite 12 `ocr_photo`, 25 `ocr_separator` e 2
`ocr_caption`. Teste negativo em 12 páginas de prosa escaneada do
`001-080.pdf`: 11 das 12 disparam pelo menos um `ocr_photo`, mas todos
os de área ≥1% são a **sombra de lombada na borda do scan** (68-85px
de largura por ~2290px de altura, razão de aspecto ~1:30, filtrável
por geometria trivial); o resto fica abaixo de 0,5% de área. Precisão,
portanto, seria gerenciável.

O recall é que mata. Na pg. 178 — a única figura de conteúdo real
conhecida em todo o corpus escaneado — o hOCR emite **um único bloco
`ocr_photo` de largura zero** (`bbox=(0,1324,0,1794)`). Um gráfico de
line-art sobre papel escaneado não é classificado como foto. As
páginas vizinhas (176, 177, 179, 180) não emitem nada relevante.

É exatamente o perfil do `find_tables()` no décimo sexto episódio:
precisão aceitável, recall ~0 no caso que motivou a investigação.
Decisão: não implementar como detector. Vale conhecer como sinal
auxiliar barato caso uma rodada futura componha vários sinais, mas não
sustenta uma rodada sozinho.

**3. Viabilidade computacional de método clássico: resolvida, e não era
o gargalo.** A restrição real não era CPU — era que `numpy`, OpenCV,
scipy e onnxruntime **não estão instalados** (o `.venv` tem só pillow,
pymupdf, pytesseract, packaging, pyinstaller), e o projeto tem norma
explícita contra introduzir numpy (`scripts/calibrar_ocr.py:60-73`).
Mas o Pillow já expõe os operadores morfológicos em C:
`ImageFilter.MaxFilter` (dilatação), `MinFilter` (erosão),
`Image.point()` (binarização), `Image.resize(BOX)` (downsample por
área). Protótipo medido — binarização, downsample 8x (1606x2290 ->
200x286), closing 5x5, componentes conectados em Python puro sobre a
imagem reduzida:

| Página | Pillow | CC Python | maior comp: área / fill |
|---|---|---|---|
| Gil pg.178 (figura) | 0,055s | 0,056s | 60,5% / 68,8% |
| FDE p.112 (figura) | 0,058s | 0,041s | 39,1% / 48,0% |
| Gil-80 p.22 (prosa) | 0,103s | 0,178s | 63,5% / 82,8% |
| Gil-80 p.46 (prosa) | 0,083s | 0,098s | 64,4% / 82,4% |
| Gil-80 p.70 (prosa) | 0,087s | 0,138s | 68,8% / 84,1% |

0,10-0,29s por página, contra os 6,08s/página já pagos pelo OCR —
2% a 5% de overhead, com zero dependência nova. A questão "CPU-only em
hardware de 2016 aguenta método clássico?" está respondida: aguenta.

O que **não** está respondido é o poder discriminante. A área do maior
componente não separa nada (figura 60,5% contra prosa 63,5-68,8% —
sobreposição direta, a mesma armadilha do 16º episódio). O *fill
ratio* aponta uma direção (figuras 48,0-68,8%, prosa 82,4-84,1%), mas
com n=2 contra n=3 e apenas 13,6 pontos entre o pior caso de figura e
o melhor de prosa. Isso é uma pista, não um limiar — e fixar um corte
aí agora seria repetir o erro amostral do 16º episódio com amostra
ainda menor.

**Decisão da rodada**: nenhum detector, nenhum limiar, nenhuma
dependência nova. O gargalo não é método — é amostra (ver
`ARCHITECTURE.md`, "Estado do corpus"). O trabalho executado nesta
rodada foi a validação do caminho de entrega, que está em produção
hoje e nunca tinha sido inspecionado.

# Décimo nono episódio — teste em Kindle real: três defeitos do Foliant, um da Amazon, e a primeira amostra real de página-figura (N=7)

Primeiro teste do EPUB num e-reader de verdade (Kindle 10, via Send to
Kindle — ou seja, a Amazon reconverteu o EPUB para formato próprio
antes de exibir). Quatro defeitos relatados. Investigação sem correção,
exceto a checagem do item 4.

**Separar defeito do Foliant de efeito da Amazon** foi o primeiro
passo, e mudou a conclusão de um dos quatro: abrindo o `.epub`
descompactado no Chrome (instrumento validado na Fase 4.20), três dos
quatro defeitos **já existem no arquivo antes** de a Amazon tocar nele;
o quarto não.

## 1. Página-figura lida como OCR — origem Foliant, e o achado mais importante

A Figura 3-1 (MAD Landscape, PDF idx 112) não aparece como imagem: o
`livro_split_112.html` (`pg-113`) tem **1964 caracteres de texto lixo e
zero `<img>`**. Mecanismo, direto no código: `extrair_texto_pagina`
([foliant.py:886](foliant.py#L886)) decide pelo texto nativo —
`texto_nativo = pagina.get_text("text").strip()`; vazio, cai no ramo
OCR ([foliant.py:899-901](foliant.py#L899-L901)), e
`extrair_linhas_ocr` não tem caminho de imagem nenhum. O Tesseract lê
as marcas do diagrama como palavras e devolve lixo.

**A legenda grudada é consequência disso, não um bug independente.** A
legenda "Figure 3-1. Matt Turck's MAD data landscape" está impressa na
página **seguinte** (idx 113), em texto nativo. Como não há bloco de
imagem antes dela naquela página, `_RE_LEGENDA_FIGURA`
([foliant.py:604](foliant.py#L604)) nunca dispara — a heurística só
olha o bloco imediatamente **após** um bloco `type==1`. A legenda vira
linha de texto comum e é fundida ao parágrafo seguinte. Na mesma
página, a legenda da Figura 3-2, cuja imagem é nativa e está logo
acima, virou `<figcaption>` corretamente. É o risco residual já
declarado em [foliant.py:590-603](foliant.py#L590-L603) ("legenda ANTES
da imagem ou separada por texto intermediário"), agravado por a figura
estar em **outra página**.

### A amostra que faltava: N=7, e todas são páginas-figura

O FDE tem 210 páginas, 203 nativas e **7 sem texto nativo**: idx **0,
10, 18, 27, 112, 153, 158**. Inspecionadas visualmente uma a uma:

| idx | pg-N | o que é |
|---|---|---|
| 0 | pg-1 | capa (já tratada por `extrair_capa`) |
| 10 | pg-11 | screenshot do Google Trends |
| 18 | pg-19 | pirâmide "Data Science Hierarchy of Needs" |
| 27 | pg-28 | gráfico de barras "Fastest Growing Tech Occupations" |
| 112 | pg-113 | MAD Landscape |
| 153 | pg-154 | diagrama "Data Engineering Life Cycle" |
| 158 | pg-159 | diagrama "Bounded / Unbounded Data" |

**Todas as 7 são páginas-figura.** É a primeira amostra real do caso
"página inteira é figura" registrada no projeto — a Fase 4.20 tinha
documentado N=0 para *figura embutida em página de texto*, que continua
N=0; esta amostra é de outra coisa, e é justamente a que estava
causando dano.

Todas as 7 têm **exatamente 1 bloco `type==1`**. Cobertura da página:
capa 100%, as outras 6 entre **56,7% e 58,2%**.

### Teste negativo: a geometria por página, sozinha, é catastrófica

Se o critério fosse só "sem texto nativo + bloco de imagem dominante",
aplicado página a página:

| livro | páginas escaneadas | cobertura mediana | páginas com cobertura > 55% |
|---|---|---|---|
| Gil 80p | 80 | 99,8% | **77 / 80** |
| Gil 208p | 208 | 100,0% | **196 / 208** |

Num livro 100% escaneado **praticamente toda página** passaria no teste
geométrico — e cada falso positivo aqui significa **perder o OCR de uma
página inteira de texto**, o pior erro possível neste projeto. O gate
de documento ("majoritariamente nativo") não é um refinamento: é o que
faz todo o trabalho.

**E esse gate não é calibrável com o corpus atual.** Os dois extremos
disponíveis são 0% de páginas nativas (Gil, os dois) e 96,7% (FDE,
203/210). Não existe nenhum livro intermediário no repositório —
qualquer limiar entre 0 e 96,7 separa os casos conhecidos igualmente
bem, o que é outra forma de dizer que a amostra não escolhe limiar
nenhum. Fixar um número agora seria inventá-lo. Mesmo padrão do décimo
sexto episódio, e o motivo de esta rodada não implementar nada.

### Tensão com a invariante da Fase 4.20

A invariante diz: no caminho OCR, o recorte **não remove** o texto OCR
da região, porque falso positivo deve custar redundância, nunca perda
de texto. Aqui o texto OCR é **lixo puro** — mantê-lo ao lado da imagem
preservaria exatamente as ~4 telas de ruído que motivaram o relato.

As duas coisas são conciliáveis porque tratam de casos diferentes, e a
distinção precisa ficar explícita antes de qualquer implementação: a
invariante protege **recorte de região dentro de uma página com texto
real em volta**; o caso das 7 páginas é **a página inteira ser a
figura**, onde não existe texto real nenhum a preservar. Registrado
como tensão a resolver com decisão explícita, não como já resolvida.

### Por que `com_ressalva` não disparou

O gate é `if paragrafos:` ([foliant.py:1330](foliant.py#L1330)). A
página produziu 1964 caracteres de lixo — `paragrafos` não é vazio,
então o fluxo entra no primeiro ramo e nunca chega ao
`paginas_sem_texto.append` de [foliant.py:1337](foliant.py#L1337). O
critério distingue "nenhum texto" de "algum texto"; **não distingue
texto de lixo**. É exatamente a lacuna que a Fase 4.15 registrou ao
adiar o threshold de confiança — e o caso real N=1 que ela citou
(`conf_media=37,09`) é esta mesma página.

## 2. Números de nota soltos — origem Foliant

Confirmado: são chamadas de nota sobrescritas extraídas como bloco
próprio. No PDF idx 110, o "1" de "relational databases, C¹" é:

```
bloco 5   bbox=(212.4, 442.1, 218.6, 454.6)
text='1'  size=11.25pt (mediana da página 15.00pt, razão 0.75)
flags=0 [NÃO marcado como superscript]  font=ArialMT
```

Dois problemas somados:
1. O PDF põe o sobrescrito num **bloco separado**, não como span dentro
   da linha — então ele vira uma linha própria, depois um `<p>` próprio.
2. **A ordem da lista de blocos não é a ordem visual.** O bloco 5 está
   em y=442, dentro da faixa do bloco 2 (369-498), mas vem **por último**
   na lista que `get_text("dict")` devolve. Como
   `extrair_linhas_nativas` percorre os blocos em ordem de lista
   ([foliant.py:678](foliant.py#L678)), o número cai no fim da página.

Daí o padrão relatado: a página termina em frase cortada e logo abaixo
aparece o número solto. `flags=0` é relevante para qualquer correção
futura: **o sinal de sobrescrito não está no flag** — o PDF levanta o
glifo por posição. Sobram tamanho relativo (0,75) e o fato de o bloco
ser um único dígito.

Contagem no EPUB: **40 parágrafos compostos só de dígitos**, numerados
em sequência que reinicia por capítulo (1-18, depois 1-6, etc.) — o
padrão de numeração de notas.

## 3. Quebra de página forçada — origem Foliant, mas removê-la não resolve

Das 210 seções com parágrafo, **94 (44,8%) terminam em frase cortada**
(última letra minúscula ou vírgula) e 26 (12,4%) terminam num parágrafo
só-dígito do item 2.

O ponto que não era óbvio: **remover `--page-breaks-before`
([foliant.py:1374](foliant.py#L1374)) não corrigiria a frase cortada.**
`unir_linhas_em_paragrafos` roda **por página**, antes da geração de
HTML — um parágrafo partido na virada de página já é dois `<p>`
distintos. Verificado no arquivo: `pg-111` termina em "...Every vendor
will say their product is going to" e `pg-112` começa em "change the
industry and..." — a mesma frase, em dois `<p>` de seções diferentes.
Tirar a quebra aproximaria os dois visualmente, mas cada um manteria
`text-indent: 1.2em` e margem própria: continuaria lendo como dois
parágrafos.

A correção real seria fusão de parágrafo **entre páginas**, o que exige
segurar o último parágrafo da página anterior — mudança pequena em RAM
(um parágrafo), mas que altera a fronteira de streaming e interage com
o cabeçalho repetido e com a detecção de título.

O que depende da quebra hoje: nada funcional. Os `id="pg-N"` são
usados pela tela de ressalva do app
(`desktop/src/main.js:697-700`), mas vêm do atributo `id`, não do
`page-break`. A flag também governa como o Calibre fatia os
`livro_split_NNN.html`; sem ela o corte passaria a ser por tamanho.

## 4. Legenda justificada — NÃO é do Foliant

Único dos quatro que não está no arquivo. Medido no Chrome, no
`pg-114` do EPUB gerado:

```
body.textAlign=start | figure.textAlign=center
figcaption.textAlign=center | figcaption.fontSize=12px | figcaption.textIndent=0px
```

A legenda **já sai centralizada** e o corpo do documento nem é
justificado. A justificação observada vem da conversão Send to Kindle
ou da configuração de alinhamento do próprio Kindle, que sobrepõe o CSS
do livro. Nada a corrigir no Foliant por esta evidência.

Uma fragilidade real, porém, fica anotada: o `center` da legenda é
**herdado** de `figure`, não declarado em `figcaption`
([foliant.py:171-173](foliant.py#L171-L173)). Se um conversor achatar
ou descartar o elemento `figure` — plausível em KF8 —, a herança se
perde. Declarar `text-align: center` direto no `figcaption` seria
robustez barata contra isso, mas é hipótese sobre o conversor da
Amazon, não medição: não aplicado nesta rodada.

## Nota sobre os arquivos de teste

Os dois `.epub` em `saida/trilha_a/` tiveram
`META-INF/calibre_bookmarks.txt` gravado dentro deles pelo
`ebook-viewer` do Calibre durante a validação da Fase 4.20 (posição de
leitura). Todos os arquivos de conteúdo mantêm mtime original e a
renderização não muda, mas os `.epub` no disco não são mais
byte-idênticos aos gerados. Vale saber ao comparar hashes.

# Vigésimo episódio — cobertura de imagem por página: um sinal por página que separa os dois casos conhecidos, sem calibrar o gate de documento

Continuação direta do décimo nono episódio: a hipótese do estrategista
era que "página sem texto nativo cuja imagem não ocupa a página
inteira" pudesse ser um sinal **por página** (sem depender da proporção
de páginas nativas do documento inteiro, que o episódio anterior já
tinha mostrado não calibrável com o corpus atual). Medição pura, sem
amostragem: todas as 80 páginas de `001-080.pdf`, todas as 208 de
`livro_completo_208pg.pdf`, as 7 páginas sem texto nativo do FDE e a 1
do PEREIRA — script isolado no scratchpad, `foliant.py` não tocado.

**O sinal separa os dois casos conhecidos com folga.** Entre as páginas
escaneadas do Gil que de fato têm uma imagem (77/80 e 196/208 —
detalhe abaixo), a cobertura mínima observada é **98,93%** (mediana
99,83%/99,95%). Nas 6 páginas-figura do FDE (excluída a capa, que tem
caminho próprio), a cobertura vai de **56,74% a 58,16%**. O intervalo
vazio entre as duas populações, neste corpus, é de **~40,8 pontos
percentuais** — nenhuma página escaneada real chega perto do teto das
páginas-figura. Nenhuma página do Gil com imagem real ficou abaixo de
95%; nenhuma página-figura do FDE chegou perto de 95%.

**Achado não previsto: 3 páginas verdadeiramente em branco no Gil (12
na versão de 208 páginas)** — idx 7, 9, 35 (mais 85, 104, 164, 170,
176, 182, 192, 198, 205 na versão completa). Zero blocos de imagem,
zero texto, zero `get_drawings()`; renderizada a 50 DPI, a página é
página em branco de verdade (confirmado visualmente, não suposição —
provavelmente separador de capítulo/verso em branco do original
físico). Isso **não** é "cobertura parcial": é ausência total de
conteúdo, uma categoria própria que um gate por cobertura precisa tratar
à parte (nem "página inteira é imagem" nem "página é figura parcial").
Sem essa checagem seriam contadas erroneamente como cobertura baixa (na
minha primeira passada do script, cobertura=0,0 nessas páginas
disparava o alarme de "abaixo de 95%" — só a inspeção visual revelou
que eram brancas de verdade, não uma figura pequena nem uma margem
cortada).

**PEREIRA (idx 0, a única página sem texto nativo do livro) tem
cobertura 97,18%** — dentro da faixa de "página inteira escaneada",
mas *abaixo* do mínimo observado no Gil (98,93%). Com N=1 esse ponto
isolado não decide nada, mas já avisa que o piso de 98,93% do Gil é
característico de **um** scanner, não uma constante física — outro
scanner real (margem cortada, leve rotação, sangria diferente) poderia
produzir uma página 100%-escaneada com cobertura mais baixa que 98,93%,
estreitando a folga de 40,8 pontos.

**Nenhuma das páginas medidas teve mais de 1 bloco de imagem
(`type==1`) ou mais de 1 imagem via `get_images()`.** O teste "página
com múltiplas imagens" desenhado na tarefa não teve nenhum caso
positivo para inspecionar — outra lacuna do corpus, não uma conclusão
de que múltiplas imagens por página seja um caso raro em geral.

> **Correção (vigésimo primeiro episódio).** A frase acima, como
> escrita originalmente ("nenhuma página, nos 4 documentos medidos"),
> era mais forte do que o dado sustentava e está corrigida aqui. Esta
> rodada mediu **todas** as páginas do Gil, mas nos outros dois livros
> só as páginas **sem texto nativo** (7 no FDE, 1 no PEREIRA) — 296 das
> 1.401 páginas do corpus. Varrendo as 1.401, existem **5 páginas com 2
> blocos de imagem** (FDE idx 37 e 170; PEREIRA idx 644, 685 e 710),
> todas com texto nativo. O enunciado correto é o mais estreito: das
> 296 páginas sem texto nativo, nenhuma tem mais de um bloco. Não muda
> nenhuma conclusão (as 5 nunca chegariam a esse critério), mas o
> escopo da medição não estava declarado.

**Distância às bordas nas 6 páginas-figura do FDE**: margem esquerda e
direita idênticas em ~88,5pt e topo em 72pt em 5 das 6 páginas (a
exceção, idx 18/pg-19, tem base diferente — 87,7pt em vez de 72pt,
imagem mais alta). Os valores repetidos sugerem um template de layout
do PDF que centraliza a figura numa caixa fixa, não uma medida da
imagem "encolhendo" organicamente por conteúdo — ou seja, a folga de
40,8 pontos pode ser em parte um artefato de **como este PDF em
particular** posiciona figuras, e não generalizável a qualquer PDF com
página-figura.

**Custo por página**: Gil, 0,7-82ms (média ~9ms) por página — barato,
mesma ordem de grandeza do décimo sétimo episódio. FDE mais caro
(41-566ms) por imagens maiores/mais complexas embutidas — ainda
tratável no orçamento de uma passada de inspeção, mas não desprezível
num livro de centenas de páginas se o gate rodar página a página no
documento inteiro.

**Limites, sem minimizar (nenhum foi resolvido por esta medição):**
- O corpus só tem **uma** obra escaneada de fato (Gil, em 2 arquivos
  que se sobrepõem nas primeiras 80 páginas — não são 2 amostras
  independentes de scanner, e sim quase a mesma amostra contada duas
  vezes). Um scanner diferente pode gerar imagem recortada, em faixas,
  com margem visível ou rotacionada — nenhum desses casos está
  representado, e é exatamente o tipo de caso que reduziria a folga de
  40,8 pontos encontrada aqui.
- Não há, no corpus, nenhum documento "meio a meio" — mistura real de
  páginas nativas e páginas escaneadas de texto no mesmo livro. O gate
  de documento (Fase 4.20/décimo nono episódio) continua sem poder ser
  calibrado por este experimento, que testa um sinal **por página**,
  não o gate de documento inteiro.
- N=6 páginas-figura (o FDE, um livro só) não calibra um corte de
  produção — é a mesma ressalva do décimo nono episódio, agora com um
  segundo sinal candidato em vez de um.
- O achado das páginas em branco mostra que qualquer implementação
  futura deste sinal precisa de um caso especial explícito para "zero
  imagem, zero texto" — tratar isso como "cobertura 0%" sem essa
  distinção classificaria incorretamente uma página em branco legítima.

**Nada implementado** — pedido era medição pura. O sinal "cobertura de
imagem por página" é promissor como *complemento* ao gate de documento,
não substituto: ele decide "esta página sem texto nativo é figura ou
scan", mas não decide "este documento é majoritariamente nativo ou
escaneado" — a pergunta que o décimo nono episódio já mostrou não
calibrável com o corpus atual.

# Vigésimo primeiro episódio — página-figura v1: o critério funcionou de primeira, e a validação encontrou um bug que apagava figuras e texto real

Implementação da v1 decidida na rodada anterior: classificar
página-figura, embutir a imagem e **manter o texto OCR**. A supressão do
texto (chamada de "D2" na decisão) ficou explicitamente fora deste
ciclo. O critério, a constante e a declaração de arbitrariedade estão em
`classificar_pagina_figura` e `COBERTURA_MAXIMA_PAGINA_FIGURA`
([foliant.py](foliant.py)).

O ponto de arquitetura que organiza tudo: **duas decisões, não uma.**
"Embutir a imagem" erra para uma imagem redundante; "suprimir o texto
OCR" erra para a perda da camada de texto (busca, reflow, TTS, ajuste
de fonte) de uma página real — num Kindle, um bloco de texto como
imagem é quase ilegível. A v1 faz só a primeira. A assimetria de custo
que dominou a discussão era, em boa parte, artefato de ter colapsado as
duas.

## O teste negativo total passou exatamente como previsto

Classificador rodado em **todas** as 1.401 páginas dos 4 documentos
(lição do décimo sexto episódio: varrer o corpus inteiro, não amostrar):

| livro | páginas | nativas | gate | positivos |
|---|---|---|---|---|
| Gil-80 | 80 | 0 | False | 0 |
| Gil-208 | 208 | 0 | False | 0 |
| FDE | 210 | 203 | True | **6** |
| PEREIRA | 903 | 902 | True | 0 |

Os 6 são exatamente os idx 10, 18, 27, 112, 153 e 158 — as
páginas-figura conhecidas — com cobertura entre 56,74% e 58,16%. Zero
falsos positivos.

**Verificação extra, porque o gate podia estar mascarando o
resultado**: com o gate de documento forçado a `True`, o Gil continua
dando **0 positivos** nas 288 páginas. A geometria sozinha já exclui o
livro 100% escaneado — o gate não é o que sustenta o critério. Isso
mudou desde o décimo nono episódio, onde ele fazia todo o trabalho; o
que mudou foi a faixa de cobertura medida no vigésimo.

## O achado: duas figuras estavam sendo apagadas, e texto real junto

A validação comparou o EPUB do FDE gerado pelo código novo contra um
gerado pelo código do `HEAD` — não contra o `.epub` velho em
`saida/trilha_a/`, que estava defasado e teria dado um falso "antes". A
diferença esperada era "6 páginas ganham `<img>`". Vieram **8**.

As duas extras — `pg-14` (Figure 1-3) e `pg-53` (Figure 2-1) — são
figuras **nativas**, sem relação com o classificador novo. Estavam
sendo destruídas silenciosamente, imagem e legenda juntas, desde a Fase
4.14.

Mecanismo, rastreado até a causa raiz:

1. `primeira_passada` alimenta a análise de cabeçalho repetido com a
   **primeira linha não-vazia** de cada página.
2. Numa página que começa com figura, essa primeira linha é o
   **marcador de imagem**, não texto.
3. `agrupar_cabecalhos` agrupa por similaridade de palavras. Os
   marcadores de `pg-14` e `pg-53` carregam suas legendas, que terminam
   ambas em "...the data engineering lifecycle", e clusterizaram entre
   si **e com o cabeçalho real "undercurrents"** — grupo de exatamente
   **3**, o valor de `LIMIAR_CABECALHO_MINIMO`.
4. Em `construir_html`, a remoção de cabeçalho olha `linhas[0]`, casa o
   marcador e o descarta. A figura some.

O dano tinha uma segunda ponta, pior e menos visível: ao **completar** o
grupo de um cabeçalho real, o marcador fez `"undercurrents"` cruzar o
mínimo e virar "cabeçalho repetido" — e a palavra passou a ser removida
do início de uma página de texto legítima (`pg-203`). Um artefato
interno do pipeline estava apagando **texto do livro**.

Vale marcar o que quase escondeu isso: o primeiro comentário que
escrevi na correção afirmava que "no caminho nativo o marcador nunca
está no topo". Era falso, e `pg-14`/`pg-53` são a prova. A afirmação
tinha passado por plausível porque eu raciocinei sobre a ordem de
leitura dos blocos em vez de medir.

## A correção, nas duas pontas

- `primeira_passada`: o contador de cabeçalho ignora linhas de marcador
  e usa a primeira linha de **texto** de verdade.
- `construir_html`: marcadores no topo da página saem da lista **antes**
  do fatiamento de título/cabeçalho, que fatiam pelo índice 0 e
  comeriam a imagem no lugar da linha de texto que deveriam remover.

A segunda também é pré-requisito da v1: a página-figura do caminho OCR
põe o marcador na posição 0 por construção, então sem ela a v1 nasceria
com o mesmo defeito — e ainda alimentaria o contador com mais 6
marcadores por livro.

## Validação, contra o código do HEAD

| livro | `<p>` perdidos | `<h2>` alterados | `<img>` novos | texto recuperado |
|---|---|---|---|---|
| FDE (210 seções) | **0** | **0** | 8 | 1 (`pg-203`) |
| PEREIRA (902 seções) | 0 | 0 | 0 | 0 |
| Gil-80 (80 seções) | 0 | 0 | 0 | 0 |
| Gil-208 (208 seções) | 0 | 0 | 0 | 0 |

No FDE, os 8 `<img>` são os 6 do classificador mais as 2 figuras
nativas recuperadas, e 2 `<figcaption>` voltaram junto. **Tudo o que
mudou, mudou na direção de recuperar conteúdo; nenhuma página perdeu
nada.**

O Gil-208 entrou na comparação de propósito: `LIMIAR_CABECALHO_MINIMO`
foi calibrado nele (e no Gil-80), e mexer no contador de cabeçalho
exigia revalidar onde a calibração nasceu — não bastava o FDE, que é
nativo. Além das 208 seções idênticas, a checagem mais direta é que a
análise de cabeçalho produziu os **mesmos 24 clusters** antes e depois,
e a mesma `RESSALVA` de 13 páginas. Nos livros do Gil isso era o
esperado por construção (100% escaneados, nenhum marcador de imagem em
lugar nenhum, gate de documento em `False`), mas "esperado por
construção" é exatamente o tipo de raciocínio que o décimo sexto
episódio ensina a não aceitar sem medir. Os 3 fixtures de regressão
ficaram inalterados.

Protocolo de build completo antes da validação manual (sidecar →
`build:web` → `tauri build` → reinstalação), com timestamps conferidos
como posteriores às fontes. O EPUB gerado pelo **sidecar do `.app`
instalado** saiu idêntico ao gerado por `python3 foliant.py` — zero
diferenças nas 210 seções.

## Dois defeitos abertos, encontrados e NÃO corrigidos

**1. Imagem extraída com fundo preto (máscara de transparência).**
`extrair_linhas_nativas` grava `bloco["image"]` cru, sem aplicar o
SMask do PDF; nas imagens que dependem dele, a área transparente vira
preta. Medido no FDE: **3 das 33** imagens já iam para produção assim
antes desta rodada (`pg56_0`, `pg57_0`, `pg76_0`); com as duas figuras
recuperadas são **5 de 41**. Defeito da Fase 4.14, exposto — não
causado — por este ciclo.

**2. Página em branco reportada como falha de OCR.** O Gil-80 emite
`RESSALVA: [1, 8, 10, 36]` e o Gil-208 emite `RESSALVA: [1, 8, 10, 36,
86, 105, 165, 171, 177, 183, 193, 199, 206]`. Em ambos, **todas as
páginas da lista exceto a 1 (capa) são as páginas em branco de
verdade** que o vigésimo episódio confirmou visualmente (zero imagem,
zero texto, zero `get_drawings()`) — 3 de 4 no livro de 80 páginas, 12
de 13 no de 208. Ou seja: o app diz ao leitor "13 de 208 páginas não
puderam ser transcritas e foram marcadas no livro" quando 12 delas são
simplesmente páginas em branco do original impresso, e o EPUB recebe 12
marcadores de "[Página N ... não pôde ser transcrita pelo OCR —
verifique o arquivo original nesta página.]" pedindo ao leitor que
confira páginas onde não há nada a conferir.

Não há o que transcrever numa página em branco, e o gate atual
(`if paragrafos:`) não tem como saber a diferença — ele distingue
"nenhum texto" de "algum texto", e página em branco cai no primeiro
caso junto com falha real de OCR. É a categoria "página em branco" que
o vigésimo episódio registrou como precisando de tratamento próprio; a
v1 não mexe nisso, corretamente — é outro ciclo.

## O que a v1 deliberadamente não resolve

O lixo de OCR continua nas páginas-figura, abaixo da imagem — é a
metade D2, que exige medir a distribuição de confiança do OCR na classe
**negativa** (as 288 páginas de texto escaneado real do Gil, que é a
classe bem povoada) antes de qualquer supressão. A invariante da Fase
4.20 segue intacta: nenhum texto foi removido.

Condição de falseamento, inalterada e não resolvida por este ciclo: um
scan recortado ao bloco de texto e centralizado, dentro de um livro
nativo (anexo digitalizado numa dissertação), passa nos 5 critérios. Em
v1 isso custa uma `<figure>` redundante e nada mais, porque o texto
permanece — é exatamente por isso que a v1 pôde ser implementada apesar
de a condição de falseamento ser plausível.

# Vigésimo segundo episódio — página em branco não é falha de OCR: um critério sem limiar, e a medição que mostrou por que o sinal "óbvio" não servia

Defeito aberto nº 2 do episódio anterior: página em branco e falha real
de transcrição caíam no mesmo gate e viravam a mesma `RESSALVA`. No
Gil-208 o app dizia "13 de 208 páginas não puderam ser transcritas" e o
EPUB recebia 12 marcadores pedindo ao leitor que conferisse o original
onde não há nada a conferir. Para a persona — concurseiro, livro
escaneado inteiro — é alarme falso recorrente, que ensina a ignorar a
ressalva justamente quando ela for verdadeira.

A assimetria de custo que organizou o ciclo: falso negativo (página em
branco segue na RESSALVA) é o status quo, não perde nada; falso
positivo (página com texto real dita "em branco") **esconde uma falha
real de transcrição** e é pior que o status quo.

## O sinal óbvio era o errado, e a medição mostrou por quê

A hipótese natural era medir tinta: o caminho OCR já renderiza a página
a 200 DPI, binarizar e contar pixel escuro custa **0,019 s/página**
(~0,3% do OCR, nenhum render adicional). Barato, e generaliza para
qualquer scanner. Medido nas 288 páginas dos dois livros do Gil:

| Grupo | n | `frac_lt_128` min | mediana | max |
|---|---|---|---|---|
| Em branco | 15 | **0,000000** | 0,000000 | **0,000000** |
| Demais (Gil-80) | 77 | 0,002570 | 0,028971 | 0,830124 |
| Demais (Gil-208) | 196 | 0,002570 | 0,029077 | 0,830124 |

Parece separação perfeita. **Não é utilizável, e o motivo é o mesmo em
que o décimo sexto episódio insiste**: as 15 páginas em branco valem
exatamente 0,000000, com desvio padrão exatamente 0,000, porque **não
têm scan nenhum** — renderizá-las mede o fundo branco padrão do
PyMuPDF, não papel. Calibrar um limiar contra elas é ajustar contra uma
tautologia. O corpus tem **zero** amostras de papel escaneado em
branco, que é a forma comum do caso.

Do outro lado, o lado negativo é bem povoado e já aperta: o fixture
`ressalva_parcial.pdf` idx 0 tem texto real e perfeitamente
transcrevível com `frac_lt_128 = 0,000556` — 0,056% de tinta. O piso do
lado negativo caiu uma ordem de grandeza com o primeiro documento fora
do Gil que foi olhado.

**Achado lateral, sobre binarização**: uma faixa de papel limpo
(inspecionada visualmente, textura pura, sem conteúdo) mede
`frac_lt_128 = 0,000000` e `frac_lt_240 = 0,354835`. Binarizando em 240,
papel em branco registra **35% de "tinta"** — mais do que muitas páginas
de texto. Qualquer trabalho futuro nessa direção tem de binarizar em tom
escuro; "quase branco" mede a textura do papel, não o conteúdo.

## O critério que foi implementado não tem limiar nenhum

As 15 páginas em branco do corpus têm `page.read_contents()` de **0
bytes**, com `annots()`, `widgets()`, `get_links()` e `get_xobjects()`
todos vazios. Isso não é heurística: um PDF cujo fluxo de conteúdo é
vazio e que não tem anotação **não pinta nada** — é branco por
definição de renderização, não por inferência sobre a aparência. Não há
número a escolher e, portanto, não há como errar para o lado caro.

A guarda por pixel entrou, mas como confirmação e não como detector:
"nenhum pixel abaixo de 128", que também não tem grau de liberdade —
não é uma fração a ajustar. Nas 15 páginas conhecidas é tautologia
(mínimo 255, a 127 pontos da guarda); o valor dela é contra o PDF que
ainda não vimos, em que algo seja pintado por um caminho que
`read_contents()` não revele.

E a segurança é garantida uma terceira vez, no ponto de uso: a
classificação só muda o desfecho de uma página que **já não produziu
nenhum parágrafo nem título**. Uma página com texto nunca depende dela.

**Teste negativo total** (lição do décimo sexto episódio: varrer o
corpus inteiro, nunca amostrar): 1.408 páginas — 4 documentos + 2
fixtures. Exatamente 15 páginas de fluxo vazio, todas no Gil; zero no
FDE, zero no PEREIRA, zero nos fixtures. E zero divergência, página a
página, entre o critério estrutural (0 imagem, 0 texto, 0
`get_drawings()`) e o de fluxo vazio.

## A 13ª página da RESSALVA era a capa — e é o único caso real de falha

Investigando a lista do Gil-208 apareceu o que o episódio anterior
registrou de forma incompleta. As 13 são 12 páginas em branco **mais a
página 1**, e o mesmo no Gil-80 (`[1, 8, 10, 36]`). A página 1 não é em
branco: é a capa, um bloco de imagem cobrindo 100% da página, com
título e autor perfeitamente legíveis a olho nu ("Antonio Carlos Gil /
COMO ELABORAR PROJETOS DE PESQUISA", texto branco e amarelo sobre fundo
roxo). É a página com **mais tinta do livro inteiro** —
`frac_lt_128 = 0,830` — e o Tesseract devolve **0 palavras** nela,
provavelmente por não binarizar bem texto claro sobre fundo escuro sem
inversão.

Ou seja: é falha real de transcrição, e é a única das duas listas. Um
detector de página em branco continua — corretamente — deixando-a na
RESSALVA, porque ela é o extremo oposto de "sem tinta".

## O gate de falha total quase virou o pior desfecho possível

Tirar a página em branco de `paginas_sem_texto` **desarma** o gate
`len(paginas_sem_texto) == total`, que existe para não rodar o Calibre
num livro que seria só marcadores. Num PDF 100% em branco a lista
ficaria vazia, o gate não dispararia, e o app entregaria um EPUB vazio
**anunciado como sucesso** — pior que o defeito que a fase corrige, e
invisível, porque não haveria nenhuma página "sem texto" para contar.

O gate passou a somar as duas categorias, e o motivo novo
(`documento_sem_conteudo`) é distinto de `sem_texto_legivel` de
propósito: ali a transcrição falhou, aqui não havia nada a transcrever.
Nenhum documento do corpus exercita esse caminho — daí a fixture nova
`tests/fixtures/falha_documento_em_branco.pdf`, que existe exatamente
para tornar essa regressão testável.

## Validação

Comparação contra o código do HEAD (`fb5254d`), seção a seção pelo
`id="pg-N"`, em todos os documentos:

| Documento | seções | `<p>`/`<h2>`/`<img>` diferentes | RESSALVA antes → depois |
|---|---|---|---|
| FDE (210 pg) | 210 | 0 | — (nenhuma) |
| PEREIRA (903 pg) | 903 | 0 | — (nenhuma) |
| Gil-80 | 80 | **3** — só os 3 marcadores removidos | `[1, 8, 10, 36]` → `[1]` |
| Gil-208 | 208 | **12** — só os 12 marcadores removidos | 13 páginas → `[1]` |

No Gil-208, onde `LIMIAR_CABECALHO_MINIMO` foi calibrado, a checagem
mais direta não é a contagem de `<p>`: é que a análise de cabeçalho
produziu os **mesmos 24 clusters** antes e depois, e o livro manteve os
mesmos 26 `<h2>`. Nenhuma diferença fora dos 12 marcadores.
| 3 fixtures existentes | — | inalterados | inalterados |

O fixture de ruído (`falha_ocr_ilegivel.pdf`, `frac_lt_128 = 0,511`)
continua em `FALHA:sem_texto_legivel` — nunca foi candidato a branco. O
`ressalva_parcial.pdf`, cujas páginas de texto real medem 0,000556 de
tinta, manteve `RESSALVA: [3, 4]` sem nenhuma reclassificação: é o teste
negativo que importa, porque é o caso mais próximo da fronteira que o
corpus oferece.

`BRANCO:{"paginas_branco": [8, 10, 36]}` no Gil-80 e
`BRANCO:{"paginas_branco": [8, 10, 36, 86, 105, 165, 171, 177, 183, 193, 199, 206]}`
no Gil-208 — as mesmas 12 páginas que o vigésimo episódio confirmou
visualmente.

**Verificado no EPUB real, não suposto**: o Calibre preserva o `id` de
uma `<section>` sem filhos, reescrevendo-a como
`<div id="pg-N" style="height:0pt"></div>`. As 80 âncoras `pg-N` do
Gil-80 e as **208** do Gil-208 continuam todas presentes; a
correspondência com a numeração física do PDF fica intacta. Isso foi medido com um probe dedicado ANTES de
escolher o formato, e reconfirmado no EPUB de produção.

Protocolo de build completo antes da validação manual: sidecar
(21:34) → `build:web` → `tauri build` (`.app` às 21:44) →
reinstalação (21:47), todos posteriores à última edição de fonte
(21:15). O sidecar **do `.app` instalado** emite
`FALHA:{"motivo": "documento_sem_conteudo"}` na fixture nova —
confirmação direta de que o binário de produção é o código novo.

## Limite de cobertura, declarado

O critério só enxerga a página em branco que o produtor do PDF emitiu
**sem nenhum objeto**, que é a forma deste corpus. **Página em branco
escaneada como imagem de papel não é detectada**: chega como imagem de
página inteira, cobertura ~99%, estruturalmente idêntica a uma página
de texto. Continua caindo na RESSALVA, exatamente como antes — falso
negativo, o erro barato, sem nenhuma piora.

Fechar essa lacuna exige amostra que o projeto não tem: **páginas em
branco digitalizadas no scanner que a persona de fato usa** e,
crucialmente, algumas **em branco no verso de página impressa**, onde o
bleed-through aparece sem nenhum conteúdo próprio que o justifique.
Amostra sintética não serve como validação — ruído gaussiano num PNG
branco testa o gerador de ruído, não o critério.

## Defeito aberto novo (terceiro)

**A capa entra na RESSALVA e ganha marcador no EPUB.** Ela já é
entregue ao leitor por `--cover` (`extrair_capa`, Fase 4.5), e ainda
assim é contada como página de corpo não transcrita. O caminho de
supressão existe (`pagina0_e_duplicata_de_metadados` →
`pagina_capa_suprimida`) mas só dispara quando o OCR da página 0
devolve texto que casa com os metadados — e aqui o OCR devolve string
vazia, então não casa. Acontece nos dois livros do Gil. Não tratado
nesta fase, por decisão de escopo.

## Nota de voz, registrada e não tratada

O texto da ressalva (`main.js`) e o marcador do EPUB (`foliant.py`)
usam a palavra "OCR", que `design-system/project/guidelines/voice.card.html`
lista explicitamente na coluna **Não faça**. Fora do escopo desta fase
por decisão explícita.

# Vigésimo terceiro episódio — a capa era o último alarme falso, e o gate quase caiu de novo

O vigésimo segundo episódio terminou com a RESSALVA do Gil-208 reduzida
de 13 páginas para `[1]`. Essa página 1 é a capa: imagem de página
inteira, título e autor perfeitamente legíveis a olho nu, texto claro
sobre fundo roxo. O Tesseract devolve **0 palavras** nela. Ela caía em
`elif not html_titulo`, entrava na RESSALVA e ganhava marcador no EPUB
— pedindo ao leitor que conferisse no original justamente a página que
ele vê antes de abrir o livro, porque a imagem inteira dela já tinha
sido entregue como capa via `--cover`.

O caminho de supressão da Fase 4.17 existia e não pegava este caso. Ele
exige que o OCR da página 0 produza texto que case com os metadados
(`pagina0_e_duplicata_de_metadados`). Com o OCR devolvendo string
vazia, não há o que casar. O caminho tinha sido desenhado contra o
problema oposto — a capa do PEREIRA, cujo OCR sai bem demais e duplica
título e autor como primeiro parágrafo do corpo.

## O mapa que decidiu o critério

Antes de escrever qualquer coisa, medimos a página 0 dos 4 livros e dos
3 fixtures:

| doc | capa extraída | texto pg1 | título | duplica metadado | efeito |
|---|---|---|---|---|---|
| Gil-80 | sim | 0 | não | não | **alvo** |
| Gil-208 | sim | 0 | não | não | **alvo** |
| FDE | sim | 129 | sim | não | inalterado (tem parágrafo) |
| PEREIRA | sim | 75 | não | **sim** | inalterado (já suprimida na 4.17) |
| ressalva_parcial | sim | 63 | não | não | inalterado (tem parágrafo) |
| falha_ocr_ilegivel | sim | **0** | não | não | **reclassificada** |
| falha_documento_em_branco | não | 0 | não | não | inalterado |

A penúltima linha é a lição da tabela. `falha_ocr_ilegivel.pdf` é ruído
puro — não tem capa nenhuma —, mas `extrair_capa` aceita a imagem
porque ela cobre a página inteira, que é como **todo** livro escaneado
se apresenta. Ou seja: o critério não consegue distinguir "página 1 é a
capa" de "página 1 é a primeira página de texto, e é ilegível". Não é
um defeito a corrigir depois; é o limite do sinal disponível.

Foi isso que fixou o desenho: a correção **não silencia**. A capa sai
da RESSALVA e do marcador, mas entra numa linha informativa neutra
sempre visível (`CAPA:`), pelo mesmo motivo que `FIGURAS:` e `BRANCO:`
aparecem sempre. Num PDF sem capa de verdade, o usuário lê "A primeira
página do PDF virou a capa do livro", olha o PDF que tem na mão e vê a
troca. Sem a linha, a página sumiria do EPUB sem marcador **e** sem
aparecer em lugar nenhum — invisível exatamente para quem poderia
detectá-la.

## O gate quase caiu pela segunda vez, e de um jeito novo

A Fase 4.22 já tinha ensinado que tirar uma categoria de
`paginas_sem_texto` desarma o gate de falha total. A lição foi aplicada
sem hesitar: a capa entra na soma.

Só que somar não bastava. A **escolha do motivo** também estava errada,
e de um jeito que a soma não revela. Num PDF de 1 página contendo só
uma capa ilegível, `paginas_sem_texto` fica vazia e `paginas_capa` vale
`[1]` — a soma cobre o documento, o gate dispara corretamente, e o
`else` mandava `documento_sem_conteudo`, cuja mensagem no app diz que
**todas as páginas estão em branco**. Para a página com mais tinta do
arquivo, isso é simplesmente falso.

A condição passou a ser `if paginas_sem_texto or paginas_capa`. A
fronteira entre os dois motivos não é "quantas listas estão vazias", é
**houve conteúdo?**: `documento_sem_conteudo` só quando tudo é página
em branco. Fixture nova para travar isso:
`tests/fixtures/falha_capa_ilegivel.pdf`, par de
`falha_documento_em_branco.pdf` — as duas cobrem os dois ramos do mesmo
gate.

É a segunda fase seguida em que o gate de falha total é o lugar mais
perigoso da mudança, e as duas vezes o dano seria silencioso: um EPUB
vazio anunciado como sucesso, ou uma mensagem de erro factualmente
falsa. Vale como regra: **toda fase que tira uma categoria de
`paginas_sem_texto` precisa revisar a soma E a escolha do motivo.**

## A palavra "OCR" volta, por decisão de produto

O episódio anterior registrou como nota de voz que a ressalva e o
marcador usam "OCR", termo que `voice.card.html` lista na coluna **Não
faça**. A decisão foi **manter o termo e explicá-lo**: educa o leitor
leigo e encontra quem procura uma "ferramenta de OCR". A exceção ficou
registrada em CLAUDE.md, para não ser "corrigida" por engano numa
sessão futura.

A explicação fica **visível**, entre parênteses, e não escondida atrás
do botão — uma explicação que o usuário precisa clicar para ver não
explica nada a quem não sabe que precisa clicar.

A primeira redação explicava o termo por extenso — "(leitura automática
do texto nas imagens do PDF)" — e **não cabia** no alvo de 2 linhas:
media 3 na largura padrão, exatamente as mesmas 3 do texto que já
estava em produção. Encurtar o parêntese para "(leitura automática de
texto)" resolveu sem perder a explicação.

Medido no motor real, com `styles.css` de verdade (Inter 17px/27,2px):

| largura da janela | coluna | 1ª redação | **final** | HEAD |
|---|---|---|---|---|
| 800px (padrão) | 438px | 3 linhas | **2 linhas** | 3 linhas |
| 340px (mínima) | 218px | 5 linhas | **4 linhas** | 5 linhas |

As 2 linhas na largura padrão valem para 1, 3, 13 e 208 páginas — o
número não muda a quebra. Em 340px são 4, sem estouro de layout, uma a
menos que o HEAD. Medido, não estimado: o Playwright não roda em
macOS 13, então a medição saiu do Chrome headless carregando o
`styles.css` real, com a largura de janela simulada por um wrapper de
largura fixa (o Chrome recusa janela abaixo de 500px).

## Validação

- Gil-80 e Gil-208: `RESSALVA:` **desaparece** nos dois; `CAPA:` com
  `[1]`; `BRANCO:` idêntico. Diff seção a seção contra o HEAD: **1**
  diferença em cada livro, que é o marcador removido de `pg-1`. Clusters
  de cabeçalho idênticos, contagem de `<h2>` idêntica (8 e 26).
- `id="pg-1"` preservado no EPUB como
  `<div id="pg-1" style="height:0pt">`, mesmo comportamento já
  verificado na 4.22 para página em branco.
- FDE e PEREIRA: **0** diferenças em 210 e 903 seções.
- `ressalva_parcial.pdf`: só o texto do marcador muda, nas páginas 3 e 4.
- `falha_ocr_ilegivel.pdf`: `FALHA:` continua `sem_texto_legivel`,
  embora a página 1 mude de categoria por dentro.
- `falha_capa_ilegivel.pdf` (nova): `sem_texto_legivel`, **não**
  `documento_sem_conteudo`.

## Armadilha de medição, registrada para não se repetir

A primeira comparação do FDE acusou 7 diferenças, todas em páginas de
figura. Não eram da mudança: o baseline tinha sido gerado com
`--lang eng` e a nova execução usou o `por` padrão. O sinal estava à
vista no próprio diff — a versão A era lixo com cara de inglês, a B era
lixo com cara de português. Refeito com a mesma flag, o diff foi a
**0**. Comparação de EPUB só vale contra um baseline gerado com os
**mesmos argumentos**, e o `--lang` é o que muda mais e aparece menos.

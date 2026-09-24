# corpus_visual — corpus de avaliação do caso-alvo (Etapa 0)

**Data**: 2026-09-24. Etapa 0 de `PESQUISA_EXTRACAO_VISUAL_2026.md`.
**Caso-alvo**: figura ou tabela **embutida numa página escaneada que também
tem texto corrido** — o caso que o projeto registrava como **N=0** desde a
Fase 4.20.

Nada aqui foi medido contra modelo nenhum. Este diretório existe para que a
Etapa 1 possa medir. O critério de aceitação está fixado na seção 5 **antes**
de qualquer execução, de propósito.

---

## 1. Propriedade que todos os PDFs têm, e por que ela importa

Os PDFs foram montados a partir das imagens de página do Internet Archive,
**sem camada de texto**. Verificado na geração: `get_text("text")` devolve
**0 caracteres** em todas as 13 páginas positivas e nas 18 negativas novas.

Isso importa porque o PDF que o próprio Internet Archive distribui **tem**
camada de OCR embutida — usá-lo faria a página cair no ramo nativo de
`extrair_texto_pagina` ([foliant.py:886](../foliant.py#L886)) e não no ramo
OCR, que é exatamente o caminho que o caso-alvo precisa exercitar.

Cada página tem 432 pt de largura (6 polegadas). A 200 DPI — o `RENDER_DPI`
de produção — isso rende 1200 px, a mesma ordem de grandeza das páginas reais
do corpus atual.

## 2. Fontes positivas

Máximo de 3 páginas por fonte, conforme a lição da Fase 4.20 (um só produtor
calibra o artefato, não a classe). 5 fontes, 5 scanners/acervos distintos.

| arquivo | fonte | idioma | licença | no repo? |
|---|---|---|---|---|
| `pdf/tecnica_industrial_1915_n1.pdf` | [Técnica Industrial, ano 1 n.1 (1915)](https://archive.org/details/tecnica-industrial) | pt-BR | **CC0 1.0** (declarada no item) | **sim** |
| `pdf/revista_maritima_brasileira_1884_v7.pdf` | [Revista Marítima Brasileira, vol. 7 (1884)](https://archive.org/details/per008567_1884_0007b) | pt-BR | **Public Domain Mark 1.0** (declarada) | **sim** |
| `pdf/os_portos_maritimos_v2.pdf` | [Os portos marítimos de Portugal, vol. 2](https://archive.org/details/osportosmaritimo02lour) | pt-PT | **indefinida** — sem `licenseurl` e sem `possible-copyright-status`; digitalização Univ. of Toronto | não (gitignore) |
| `pdf/tractado_clinica_propedeutica.pdf` | [Tractado de clínica propedêutica](https://archive.org/details/tractadodeclinic01cast) | pt | **indefinida** — idem; acervo Open Knowledge Commons | não (gitignore) |
| `pdf/viagem_ao_redor_do_brasil.pdf` | [Viagem ao redor do Brasil — prov. de Matto-Grosso](https://archive.org/details/viagemaoredordob01fons) | pt-BR | **indefinida** — idem | não (gitignore) |

Os três "indefinida" são **uso local apenas**. O `.gitignore` deste diretório
exclui tanto os PDFs quanto os JPGs de revisão derivados deles. Quem clonar o
repositório reconstrói esses três rodando o script da Etapa 0 com as URLs
acima — o `manifesto.json` guarda o identificador e o índice de página de cada
uma.

## 3. Cobertura por tipo visual — e o buraco que sobrou

13 páginas, **16 objetos** anotados:

| tipo visual | objetos | páginas | fontes | situação |
|---|---|---|---|---|
| foto / meio-tom | 5 | 4 | 3 | **ok** |
| tabela | 5 | 5 | 3 | **ok** |
| line-art / diagrama | 3 | 3 | 2 | **ok** |
| gráfico com rótulo horizontal | 3 | **1** | **1** | insuficiente **neste corpus** — fechado pelo `corpus_local`, ver §8 |

**O buraco é o tipo 2.** Os 3 gráficos existem, mas são os três da **mesma
página** (`tecnica_industrial_1915_n1.pdf` idx 1) e portanto da mesma fonte,
mesmo desenhista e mesmo scanner. Isso satisfaz a letra do alvo ("3 por tipo")
e **não** satisfaz o espírito: medir recall de gráfico contra esse conjunto
mede um exemplar, não a classe — que é precisamente o erro que a Fase 4.20
mandou não repetir.

Consequência prática **para este corpus isolado**: o recall de `gráfico`
medido só aqui é inconclusivo. **A seção 8 fecha o buraco** — o `corpus_local`
acrescenta 4 gráficos em 3 páginas de 2 livros, e o tipo passa a ter 7 objetos
em 4 páginas de 3 livros no total.

Motivo do buraco, registrado para a próxima rodada: gráfico estatístico com
eixo rotulado é **raro em livro anterior a 1930**, que é a faixa onde o
domínio público é seguro. Onde procurar depois: anuários estatísticos
brasileiros dos anos 1920-30, relatórios de comissões técnicas e revistas de
engenharia do mesmo período.

## 4. Corpus negativo

| origem | páginas | observação |
|---|---|---|
| `samples/livro_completo_208pg.pdf` (Gil-208) | **206** | 208 no total, menos idx 0 (capa) e idx **178** |
| `pdf_negativo/neg_os_portos_maritimos_v2.pdf` | 6 | scanner diferente |
| `pdf_negativo/neg_tractado_clinica.pdf` | 6 | scanner diferente |
| `pdf_negativo/neg_viagem_ao_redor_do_brasil.pdf` | 6 | scanner diferente |
| **total** | **224** | 4 produtores de scan distintos |

Decisões:

- **Gil-80 não entra.** Suas 80 páginas são as 80 primeiras do Gil-208 — o
  mesmo material digitalizado duas vezes. Contá-las de novo inflaria o
  denominador do falso positivo com amostra dependente.
- **idx 178 excluído, e verificado, não herdado.** Renderizei idx 176, 177 e
  178: o gráfico de Gantt (Figura 20.1, rotacionado 90°) está em **178**. A
  176 é branca e a 177 é a abertura do capítulo, em texto. Ele não entra como
  positivo do caso-alvo porque é **página-figura inteira**, uma classe
  diferente, já tratada pela Fase 4.21.
- **Páginas em branco continuam negativas**, conforme pedido. São 12 no
  Gil-208 segundo a Fase 4.22.
- Nenhuma outra página do Gil-208 foi excluída. A afirmação de que a pg. 178 é
  "a única figura de conteúdo real do corpus escaneado" vem do 18º episódio do
  `TRACE.md`; **não foi reverificada página a página nesta rodada**. Se a
  Etapa 1 acusar falso positivo no Gil-208, inspecionar a página antes de
  contá-la como erro.
- Seleção das 18 páginas novas: ABBYY FineReader (o XML que o Internet Archive
  publica), exigindo fração de texto ≥ 0,30 e **nenhum** bloco `Picture`/`Table`
  acima de 1% da página, com as escolhidas espalhadas ao longo do livro.

## 5. Critério do Portão 1 — fixado antes de medir

Isto está escrito **antes** de qualquer execução de modelo, de propósito.
Mudá-lo depois de ver o resultado invalida a medição.

**Acerto.** Uma detecção conta como acerto quando tem `IoU ≥ 0,50` com uma
caixa anotada **e** o tipo bate (figura↔figura, tabela↔tabela). Subtipo
(foto/gráfico/line-art) **não** precisa bater — ele serve para estratificar o
relatório, não para julgar o acerto.

**Aceitação.** Aceita-se a direção se, **cumulativamente**:

1. recall global ≥ ~80% sobre os 16 objetos do corpus positivo; **e**
2. falso positivo ~0 sobre as 224 páginas negativas.

**Intervalo de confiança, obrigatório.** Todo recall vai reportado com
intervalo de Wilson a 95% ao lado do ponto. Com N=16 o intervalo é largo — por
exemplo, 13/16 = 81,3% tem IC95% de aproximadamente **[57%, 93%]**. Um
resultado cujo IC cruza os 80% é **inconclusivo**, não aprovado. Dizer "deu
81%" sem o intervalo, com este N, é afirmar mais do que a amostra sustenta.

**Domínio do corpus, e o que ele NÃO mede.** Todas as 13 páginas positivas
deste diretório vêm de **livros anteriores a 1930**: gravura em madeira,
meio-tom grosseiro, *foxing*, tipografia antiga, papel amarelado, digitalização
de acervo com iluminação controlada. Um resultado aqui mede o modelo **nesse
domínio**. Ele **não** responde pelo caso da persona — apostila moderna
escaneada em copiadora ou fotografada com celular, com sombra de curvatura,
perspectiva, fundo colorido e impressão offset recente. Esse caso é medido pelo
**`corpus_local/`** (material do usuário, fora do controle de versão), descrito
na seção 8. Os dois recalls vão reportados **separados**, nunca somados num
número só.

**Estratificação.** Reportar recall separado por tipo visual (foto, gráfico,
line-art, tabela). O de `gráfico` sai marcado como **inconclusivo por
construção** — ver seção 3.

**Reprovação.** Se reprovar, **arquivar sem forçar**, no padrão da Fase 4.5
("investigado, sem solução viável, não forçado") e da Fase 4.18. Não ajustar
limiar, não trocar de modelo em busca de um número melhor: trocar de modelo
depois de ver o resultado transforma o corpus de teste em corpus de ajuste, e
aí o número deixa de significar qualquer coisa.

## 6. Como as caixas foram propostas, e o viés a vigiar

As caixas de `anotacoes.json` foram lidas **por inspeção visual minha**, sobre
um render a 200 DPI com grade percentual de 5% sobreposta. Elas são
**proposta**, revisadas em `revisao.html` e **confirmadas pelo Thiago em
2026-09-24** — a partir daí valem como ground truth do Portão 1.

**Viés de seleção, declarado.** As páginas candidatas foram encontradas com
ajuda do ABBYY FineReader (blocos `Picture`/`Table` do XML do Internet
Archive). Isso enviesa o corpus na direção de figuras que **um motor de layout
comercial consegue ver** — o que tende a **superestimar** o recall de qualquer
detector que erre pelos mesmos motivos que o ABBYY.

Duas mitigações aplicadas: (a) a triagem por legenda escrita (regex de
"Fig./Figura/Quadro/Tabela...") é neutra quanto a motor e foi usada em
paralelo; (b) toda candidata foi confirmada por olho antes de entrar — e
**quatro candidatas apontadas pelo `ocr_photo` do Tesseract foram rejeitadas
na inspeção: eram manchas de foxing no papel envelhecido**, não figuras.

## 7. Arquivos

```
manifesto.json    fontes, licença, páginas, dimensões em px e pt
anotacoes.json    caixas por objeto: pct da página, pt do PDF, px a 200 DPI
negativos.json    corpus negativo novo e o critério de seleção
revisao.html      índice de revisão visual (abrir no navegador)
revisao/*.jpg     render a 200 DPI com caixa vermelha (objeto) e azul (legenda)
pdf/              13 páginas positivas, sem camada de texto
pdf_negativo/     18 páginas só-texto, de 3 scanners diferentes
```


## 8. `corpus_local/` — o corpus da persona, fora do repositório

27 digitalizações fornecidas pelo usuário (apostila/livro moderno, copiadora e
celular). **Material próprio, sem licença de redistribuição: `corpus_local/`
está no `.gitignore` da raiz e nenhum arquivo dele é versionado.** Só as
contagens e o critério vivem aqui.

| grupo | n | uso |
|---|---|---|
| **A — positivas** | **13 páginas, 15 objetos** | caso-alvo, mesmo Portão 1 |
| **B — branco com sombra** | **7 páginas** | amostra nova para o critério de página em branco (Fase 4.22) |
| **C — fora do caso-alvo** | 7 páginas | 3 tabelas de página inteira, 3 montagens de figura sem prosa, 1 página só-texto **reaproveitada como negativa** |

### Rotação: dado à parte, não descartado

**12 das 20 páginas legíveis precisaram de correção de rotação** antes de
qualquer anotação — 3× 180°, 3× 90°, 6× 270°. A rotação foi proposta pelo OSD
do Tesseract (`--psm 0`) e **conferida visualmente uma a uma**: a confiança do
OSD ficou entre **0,55 e 33,5**, baixa demais para aceitar sem olhar, e ele
errou pelo menos uma vez (`463802`, confiança 1,42).

Consequência para o Portão 1: as páginas do `corpus_local` entram **sinalizadas
com a rotação aplicada** (campo `rotacao_aplicada_graus` em
`anotacoes_local.json`). Um recall medido sobre páginas pré-rotacionadas por
mim **não é** o recall que o Foliant teria numa apostila crua — o pipeline de
produção não tem correção de orientação hoje. Reportar as duas coisas:
recall sobre a página corrigida, e a observação de que 12 de 20 precisaram de
correção.

### As 7 páginas em branco com sombra

Fecham uma lacuna registrada e sem amostra desde a Fase 4.22: *"página em
branco **escaneada como imagem de papel** — não detectada pelo critério
estrutural, continua na RESSALVA"*. As 7 têm sombra de curvatura de lombada e
textura de papel; **todas as 7 fizeram o OSD do Tesseract falhar** por não ter
caractere nenhum — sinal independente, de um motor diferente, de que estão em
branco. São material para **outra tarefa** (o critério da 4.22), não para o
Portão 1 da detecção de figura.

### Cobertura somada, e o buraco do tipo 2 fechado

| tipo visual | público (≤1930) | local (moderno) | **total** | páginas / livros distintos |
|---|---|---|---|---|
| foto / meio-tom | 5 | 6 | **11** | 9 páginas, 5 livros |
| tabela | 5 | 4 | **9** | 9 páginas, 5 livros |
| line-art / diagrama | 3 | 1 | **4** | 4 páginas, 3 livros |
| **gráfico com rótulo** | 3 | 4 | **7** | **4 páginas, 3 livros** |
| **total** | **16** | **15** | **31** | **26 páginas** |

O buraco declarado na seção 3 — os 3 gráficos do corpus público estavam todos
na mesma página, de um só livro — **está fechado**: o `corpus_local` acrescenta
4 gráficos em 3 páginas de 2 livros diferentes (um relatório do PNE com eixo de
ano rotulado, e um gráfico de emissões de CO₂). O tipo `gráfico` passa a ter
**7 objetos em 4 páginas de 3 livros** e **deixa de ser inconclusivo por
construção** — mas o recall dele continua reportado separado por domínio
(≤1930 vs moderno), como todo o resto.

### Corpus negativo somado

**225 páginas**: as 224 da seção 4 mais 1 página só-texto do `corpus_local`
(quinto produtor de scan, e o único com sombra de curvatura de celular).

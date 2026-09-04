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

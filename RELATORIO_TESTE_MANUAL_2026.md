# Relatório integrado — teste manual da usuária no app instalado (26/09/2026)

Não altera nenhum arquivo do pipeline. Registra achados de um teste manual
feito diretamente no `Foliant.app` instalado, mais dois experimentos
adicionais que a usuária levantou por conta própria durante a checagem.
Cada seção tem: o que foi relatado, o que verifiquei com dado real
(código + arquivo), e a hipótese fechada ou em aberto.

## 0. Reconciliação do relato original — RESOLVIDA

Eu tinha reportado que o `.epub` de `sondagem_rotate_app.pdf` saía com o
texto "fora de ordem de leitura", citando como evidência um parágrafo que
gruda os três cabeçalhos de coluna de uma tabela ("FACILIDADES
CARACTERÍSTICA... DEFLAGRADORESQualidades... DIFICULDADES São
circunstâncias..."). A usuária testou de novo pela interface gráfica,
abriu no Apple Books, e relatou uma experiência diferente: conteúdo
diluído em ~5 páginas, "quase estruturado", sem parecer um bloco corrido.

**Comparei os dois arquivos gerados byte a byte** — o `.epub` que gerei
via linha de comando e o que a usuária gerou pela interface gráfica e
salvou em `Documents/sondagem_rotate_app.epub`. O HTML interno
(`livro.html`) dos dois é **idêntico**, inclusive as mesmas 37 tags
`<p>`, na mesma ordem, com o mesmo parágrafo grudado. A única diferença
entre os dois arquivos é a tag `<title>` — reflexo direto de eu ter
passado `--titulo "Teste Sondagem Rotate App"` na linha de comando,
enquanto a interface gráfica passou `"Sondagem Rotate App"` (o nome do
arquivo, sem "Teste").

**Não há divergência de comportamento entre GUI e CLI, nem
não-determinismo no pipeline.** A diferença foi de **percepção de
leitura**: o parágrafo problemático é longo o bastante para atravessar
uma virada de página no Apple Books, então ele aparece como texto
corrido contínuo espalhado por duas telas — a colagem dos três
cabeçalhos de tabela não salta aos olhos do jeito que salta ao comparar
o HTML bruto. A usuária confirmou, ao ser perguntada diretamente, que as
três palavras (FACILIDADES/DEFLAGRADORES/DIFICULDADES) **estão
presentes** no texto — só não formam, na leitura em tela, um bloco que
pareça obviamente "errado".

Conclusão: meu relato técnico original (texto fora de ordem, colagem de
colunas de tabela) **se mantém integralmente correto e confirmado por
uma terceira fonte** (o arquivo gerado de forma independente pela
própria usuária). O relato dela também está correto — descreve a mesma
falha por outro ângulo (experiência de leitura, não estrutura de
markup).

## 1. `sondagem_rotate_app.pdf` — página vira capa

**Relatado**: a página única (fotografada de lado) virou a capa do
`.epub`, com o conteúdo extraído aparecendo depois, como corpo do livro.

**Verificado**: é o comportamento documentado de `extrair_capa()`
(`foliant.py:1453`). A função aceita a 1ª página como capa quando a
proporção largura/altura da imagem embutida bate com a proporção da
página, dentro de 15% de tolerância. Medi os dois valores direto no
arquivo:

| | valor |
|---|---|
| proporção da página | 1,5197 |
| proporção da imagem JPEG embutida | 1,5199 |
| diferença | **0,01%** — bem dentro dos 15% |

Isso é esperado por desenho: o Adobe Scan grava a página inteira como 1
imagem só do tamanho exato da página (mesmo padrão já documentado para
livros 100% escaneados, ver comentário de `extrair_capa`). A função não
distingue "é mesmo uma capa" de "é uma página de conteúdo escaneada
inteira" — ela só compara proporção. Isso é uma decisão de projeto já
registrada como risco residual no próprio docstring da função
("comportamento seguro por padrão" quando NENHUMA imagem bate; mas
quando UMA imagem bate, não há segunda checagem).

**Hipótese**: não é bug novo, é a mesma lacuna já anotada no código —
um PDF de 1 página só, inteiramente escaneada, sempre vira "capa +
corpo repetido", porque não há sinal disponível para diferenciar "isto
é a capa do livro" de "isto é a única página do livro". Seria preciso
uma heurística nova (ex.: só tratar como capa se houver mais de 1
página, ou se a página 0 tiver pouco texto) — não implementada, e a
mudança teria custo em outro lugar: PDFs que legitimamente têm uma capa
de página inteira (comum em livros escaneados de verdade) parariam de
funcionar.

## 2. `cv_analista_de_dados_Thiago_P_Almeida.pdf` (2 páginas, LaTeX) — capa padrão + título cru

### 2a. Por que não usou a página 1 como capa

Verifiquei os metadados e a estrutura reais do PDF:

```
metadata: {'creator': 'LaTeX with hyperref', 'producer': 'pdfTeX-1.40.29', ...}
página 0: 0 imagens embutidas, texto_len=3272
página 1: 0 imagens embutidas, texto_len=3081
```

**Confirmado, não é hipótese**: as duas páginas são 100% vetoriais (texto
+ desenho vetorial do LaTeX), sem NENHUMA imagem rasterizada embutida.
`extrair_capa()` percorre `pagina.get_images(full=True)` — não há
nenhuma imagem para comparar proporção, a função devolve `None`, e o
Calibre cai no comportamento padrão dele (capa genérica automática,
gerada a partir do título). É o ramo "seguro por padrão" do próprio
código — funcionando exatamente como projetado, ao contrário do caso 1.

### 2b. Por que o título saiu cru (`cv_analista_de_dados_Thiago_P_Almeida`) em vez de formatado

Rodei `--inspect` direto neste PDF:

```
INSPECAO:{"titulo": "Cv Analista De Dados Thiago P Almeida", "autor": "", ...}
```

A tela "antes de converter" **calcula corretamente** um título formatado
(`derivar_titulo_do_nome`, que troca `_`/`-` por espaço e aplica
`.title()`) e, por código (`main.js:281-283`), **pré-preenche o campo**
com esse valor assim que a inspeção volta — a usuária não precisaria
digitar nada.

Só que existem **dois caminhos de título diferentes** no sistema, e eles
não convergem:

- `inspecionar_pdf` → `derivar_titulo_do_nome` → título bonito, usado só
  para popular a tela.
- `main()`, na conversão de verdade: `titulo = args.titulo or
  args.pdf_entrada.stem` (`foliant.py` ~linha 2107) — se `--titulo`
  chegar vazio, o fallback é o **nome cru do arquivo**, sem nenhuma
  formatação. `derivar_titulo_do_nome` explicitamente **não** é chamado
  aqui; o próprio docstring da função avisa isso ("usado só por
  `inspecionar_pdf`... não altera o fallback já existente em `main()`").

Isso bate exatamente com o resultado observado: `dc:title` no `.epub`
final saiu `cv_analista_de_dados_Thiago_P_Almeida`, idêntico ao
`.pdf_entrada.stem`, não ao título bonito que a tela já tinha calculado.

**Hipótese mais provável**: o campo de título foi pré-preenchido com a
sugestão bonita, e a usuária o **apagou de propósito** para testar "o
que acontece se eu deixar em branco" — sem saber que "em branco" não
reaproveita a mesma sugestão que acabou de ver na tela; ele cai num
fallback diferente e pior, só usado dentro de `main()`. Não é uma falha
de OCR nem do pipeline de conversão — é uma inconsistência de design
entre dois "valores padrão de título" que deveriam ser o mesmo e não
são. Testável e corrigível (ex.: `main()` chamar a mesma função de
`inspecionar_pdf` quando `--titulo` vier vazio), mas não implementei
nada, como pedido.

## 3. `Engenharia de software ... Kechi Hirama.pdf` (211 páginas) — autor ilegível

Verifiquei os metadados brutos do PDF, direto do arquivo, sem passar por
nada do Foliant:

```
metadata: {'author': '\x104<8=8AB@0B>@', 'producer': 'PDFsharp 1.32.2608-g (www.pdfsharp.net)', ...}
```

**Confirmado na fonte**: o campo `/Author` deste PDF **já vem corrompido
no arquivo original**, escrito por PDFsharp (biblioteca .NET para geração
de PDF) — provavelmente uma string em outro alfabeto/codificação (o
padrão de caracteres lembra "administrador"/"administrator" com a
tabela de caracteres deslocada) que o PDFsharp gravou de forma incorreta
na hora de criar o arquivo, anos atrás (a data de criação registrada é
2013).

O `foliant.py` (`inspecionar_pdf`) lê `metadata.get("author")` **sem
nenhuma validação de sanidade** e devolve isso pronto para a tela. A
interface gráfica pré-preenche o campo "Autor" com o valor bruto, e como
a usuária não editou esse campo, ele foi enviado como `--autor` e parou
literalmente no `dc:creator` do `.epub` final — confirmei abrindo o
`.opf` gerado:

```xml
<dc:creator ...>'\x104&lt;8=8AB@0B&gt;@'</dc:creator>
```

**Não é um bug do Foliant introduzindo corrupção** — é passagem
fiel (garbage-in, garbage-out) de um metadado que já estava ilegível no
PDF de origem. É, ainda assim, uma lacuna real: não existe nenhuma
checagem de "este texto parece ilegível/binário, não mostrar como
sugestão" antes de pré-popular o campo Autor na tela. Vale registrar
como melhoria futura possível (ex.: heurística simples — se a proporção
de caracteres não-imprimíveis/fora da faixa esperada for alta, tratar
como metadado ausente e cair no fallback "Desconhecido").

Nesse mesmo PDF, os acentos **saíram corretos** ("prévia", "Título",
"Mendonça"), o que descarta qualquer problema de codificação geral do
Foliant — confirma que o defeito de acentos do item 4 é específico do
outro arquivo, não do sistema.

## 4. Acentos quebrados em `cv_analista_de_dados_Thiago_P_Almeida.pdf`

**Relatado**: acentos saindo como caractere separado empurrado para o
lado — `"opera¸c˜oes"`, `"experiˆencia"`, `"audit´avel"`.

**Confirmado direto na camada de texto do PDF**, sem nenhum código do
Foliant envolvido — extraí com PyMuPDF puro e encontrei, só na página 1:

```
'Bel´em,' 'opera¸c˜oes,' 'governan¸ca' 'Decis˜oes' 'anal´ıticos'
'escal´avel' 'audit´avel,' 'T´ecnicas' 'Operac¸˜oes:' ... '´Ageis' '´Agil,'
```

Esse padrão — acento como caractere próprio, deslocado para depois (ou
antes) da letra-base, em vez de compor um único caractere Unicode
acentuado — é a assinatura clássica de PDF gerado por `pdfTeX` com fontes
**Computer Modern em codificação antiga (OT1)**, sem
`\usepackage[T1]{fontenc}` ou equivalente: o TeX desenha o acento como um
glyph separado posicionado por cima da letra (efeito visual correto no
PDF), mas a extração de texto simplesmente lê os glyphs na ordem em que
aparecem no fluxo do PDF, sem recompor os dois em um único caractere
Unicode. Isso está gravado desde a geração do PDF (`Creator: LaTeX with
hyperref`, `Producer: pdfTeX-1.40.29`) — nenhuma etapa do Foliant toca
nisso, o defeito já está na camada de texto nativa que `extrair_texto_pagina`
apenas repassa.

**Confirma a hipótese da própria usuária**: é um caso de documento LaTeX
com fonte em codificação incompatível com extração de texto simples —
categoria diferente da dos livros escaneados/fotografados, que é onde o
Foliant foi calibrado. Fica documentado como uma classe de defeito nova,
não coberta por nenhuma calibração existente (FDE e PEREIRA, os dois
livros de referência do projeto, não têm esse problema — nenhum deles é
saída bruta de pdfTeX/OT1).

## 5. Palavras coladas e maiúscula/minúscula errada (`"desem penho"`, `"VOcê"`, `"DEFLAGRADORESQualidades"`)

Já eram artefatos da própria camada de texto nativa gravada pelo Adobe
Scan (o app de celular), presentes antes de qualquer processamento do
Foliant — confirmado na sondagem original desta mesma investigação
(`ARCHITECTURE.md`, evidência do defeito aberto "camada de texto nativa
girada"). `extrair_texto_pagina` não faz nenhuma limpeza/correção sobre
texto já nativo — trata a presença de camada de texto como sinal de
"não precisa de OCR", não como "está livre de erros de OCR". A engine de
OCR do Adobe Scan é quem cometeu esses erros; o Foliant apenas os herda,
tanto em ordem de leitura (item 0) quanto em ortografia/capitalização.

## Resumo — o que é bug/lacuna real vs. o que é herança de fonte externa

| item | causa raiz | onde mora |
|---|---|---|
| 0. Ordem de leitura "fora de ordem" | confirmado, reproduzido 2x independentemente | defeito aberto já registrado (ramo nativo não olha direção de escrita) |
| 1. Página vira capa (sondagem) | comportamento por desenho de `extrair_capa`, sem 2ª checagem | risco residual já documentado no próprio código |
| 2a. Sem capa no cv (2 pág.) | comportamento correto — nenhuma imagem para extrair | não é defeito |
| 2b. Título cru no cv | dois fallbacks de título divergentes (`derivar_titulo_do_nome` vs `.stem` cru) | inconsistência de design, não documentada até agora |
| 3. Autor ilegível (Kechi Hirama) | metadado corrompido no PDF de origem (PDFsharp, 2013), repassado sem validação | falta de sanitização de metadado — não documentada até agora |
| 4. Acentos quebrados (cv) | fonte OT1/pdfTeX sem composição Unicode, no PDF de origem | classe de defeito nova, fora do escopo calibrado (livros escaneados) |
| 5. Palavras coladas/maiúscula errada | OCR do próprio Adobe Scan, herdado via texto nativo | já coberto pelo defeito aberto do item 0 |

Nenhuma mudança foi feita no código. Este relatório está pronto para
virar entrada em `ARCHITECTURE.md`/`TRACE.md` quando você aprovar —
nada foi gravado ainda.

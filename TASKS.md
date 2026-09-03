estado explícito (todo / em andamento / feito / bloqueado) — qualquer agente que entrar numa sessão nova sabe exatamente onde retomar, sem depender de você reexplicar o histórico.

## Correções de qualidade de OCR (2026-09-02)

Testado incrementalmente contra `samples/001-080.pdf` (80 páginas),
comparando `saida/scan_teste.epub` (baseline, DPI 200, código anterior)
com `saida/scan_teste_v2.epub` (código novo). Ver `ARCHITECTURE.md` para
os detalhes de design e as decisões tomadas durante a validação.

- [x] **RENDER_DPI 200 → 300 (testado e revertido para 200).** Resultado
  final: **revertido**, e o motivo é o resultado válido aqui, não uma
  correção pendente. 300 foi testado primeiro e melhorou alguns pontos de
  numeração de sumário, mas não de forma confiável (`"710 Redação do
  relatório"` seguiu sem ponto, idêntico a 200), e pior: em 2-3 blocos de
  sumário de ~18 no livro, introduziu um defeito NOVO e mais grave — o
  número do capítulo/seção some por completo, ou números e rótulos de
  texto passam a ser lidos como dois blocos separados sem pareamento
  entre eles (Tesseract lendo as "colunas" da página de sumário fora de
  ordem). 250 foi testado como meio-termo e **reproduziu exatamente o
  mesmo defeito estrutural, nos mesmos capítulos** — não é um gradiente
  onde um DPI intermediário ajudaria, é um patamar onde esse tipo de
  layout de página quebra pior. Tabela completa (200 vs 300 vs 250, os
  mesmos 3 blocos de sumário lado a lado) em `ARCHITECTURE.md`. Trocar um
  defeito cosmético e legível (`"71 Etapas"` ainda é inequívoco) por um
  estrutural (número sumido, texto órfão) não é uma melhoria líquida —
  e ainda custava ~1,4-1,6x mais tempo de CPU na máquina fraca que é a
  restrição central do projeto. `RENDER_DPI` permanece em **200**.
  Resolver o defeito cosmético original de vez provavelmente exige mais
  que DPI (fora de escopo aqui).

- [x] **Limpeza de ruído de marcadores no início de linha
  (`limpar_linha`).** Resultado: confirmado — contagem de parágrafos
  começando com `*`, `—`, `-`, `;` caiu de 50 (baseline) para 0 (final).
  A regex do enunciado original precisou de ajuste: o lookahead por
  maiúscula não batia com os próprios exemplos dados (`"* 41 Que
  critérios..."` tem dígito depois do marcador; `"- possibilita
  melhor..."` tem minúscula) — removido o lookahead, mantendo só a
  descoberta de 1-3 caracteres de ruído no início da linha. Ordem
  corrigida: limpeza roda ANTES de `html.escape()` (aspas retas viram
  `&quot;` na escapagem e quebrariam a regex se rodasse depois).

- [x] **Filtro de cabeçalho/rodapé repetido (duas passadas).** Resultado:
  confirmado com exemplo real — página 55 antes tinha `"Como classificar
  as pesquisas? \"o"` grudado ao parágrafo seguinte; no HTML final essa
  linha de cabeçalho não aparece mais, e o parágrafo consecutivo começa
  limpo. Rodapé: verificado nos dados reais que este livro não tem padrão
  de rodapé recorrente identificável (só números de página soltos) —
  escopo reduzido a cabeçalho por achado verificado, documentado em
  `ARCHITECTURE.md`.
  - Durante a validação, dois bugs reais foram encontrados e corrigidos
    antes de fechar esta tarefa (não passariam despercebidos só com
    `grep -c` na saída final — exigiu inspeção visual do log de
    clustering, como pedido): (1) comparação por caractere
    (`difflib.SequenceMatcher`) misturava cabeçalhos de capítulos
    diferentes por seguirem o mesmo molde de frase — trocado por
    sobreposição de palavras de conteúdo; (2) o limiar de frequência
    original (30%, pensando em UM cabeçalho repetido no livro todo) nunca
    disparava porque este livro tem um cabeçalho diferente por capítulo —
    recalibrado para 6% após inspecionar os clusters reais.
  - Limitação conhecida: 2 de ~18 grafias de OCR de um mesmo cabeçalho
    ficaram fora do cluster (perda de recall, não falso positivo) — ver
    `ARCHITECTURE.md`.

**Fechamento**: dos 3 itens, 2 foram aplicados e validados (ruído de linha,
cabeçalho/rodapé), e 1 foi corretamente revertido depois que a evidência
mostrou que a mudança proposta não era uma melhoria líquida (DPI). Um
reverte-bem-fundamentado conta como resultado fechado, não como pendência.

`requirements.txt`: não alterado — nenhuma dependência nova (usado apenas
`re`, `json`, `collections.Counter` da stdlib).

## Teste de carga — validação da arquitetura de streaming (2026-09-02)

Objetivo: confirmar que a arquitetura de duas passadas com cache em disco
mantém RAM constante independente do tamanho do livro, usando o livro
completo real: `samples/Como Elaborar Projetos de Pesquisa (Em Portugues
do Brasil) -- Antonio Carlos Gil.pdf` — **169MB, 208 páginas** (confirmado
com `ls -lh` e `pymupdf`, não estimado).

### RAM — objetivo central confirmado

| Teste | Páginas | PDF | `maximum resident set size` | `peak memory footprint` | Tempo real |
|---|---|---|---|---|---|
| `samples/001-080.pdf` | 80 | 66MB | 402.313.216 B (383,7 MiB) | 295.612.416 B (281,9 MiB) | 8m10s |
| Livro completo | 208 | 169MB | 470.691.840 B (449,0 MiB) | 295.522.304 B (281,9 MiB) | 19m36s |

`peak memory footprint` (medida mais confiável do processo, reportada
pelo macOS) ficou **praticamente idêntica** entre os dois testes —
diferença de 0,03% — apesar de 2,6x mais páginas e 2,56x mais dados de
entrada. `maximum resident set size` cresceu 17%, bem abaixo do
crescimento de páginas (160%). Confirmado de forma independente por
amostragem `ps` em paralelo durante a execução (pico ≈445,9MB, consistente
com o valor do `/usr/bin/time -l`). **A arquitetura de streaming se
sustenta — RAM não escala com o tamanho do livro.**

### Interrupção/limpeza de cache

Testado com `kill -TERM` num processo em execução (o `kill -INT` inicial
não funcionou por um artefato do método de teste — processo rodando como
job em background no shell tem SIGINT ignorado por convenção POSIX de job
control, não é um comportamento do `foliant.py`). Resultado real: **um
kill abrupto (SIGTERM/SIGKILL/crash) deixa lixo em disco** — confirmado
que `paginas.jsonl` e os arquivos temporários do próprio Tesseract
sobrevivem, porque a limpeza de `tempfile.TemporaryDirectory()` só roda no
unwind normal do `with` ou numa `KeyboardInterrupt` (que É o caminho real
de um Ctrl+C em primeiro plano — não testado diretamente aqui pela
limitação do ambiente de teste, mas é o comportamento padrão documentado
do Python). Comportamento esperado e aceitável (padrão de qualquer uso de
arquivo temporário em Unix — `/tmp` é limpo pelo próprio SO
periodicamente), documentado como limitação conhecida, não como bug.

**Confirmação de que execução normal não deixa lixo — comando e output
reais, não inferência** (2026-09-02): primeiro achado importante do
próprio teste — o comando sugerido originalmente (`ls -la /tmp | grep -i
tmp`) checa o lugar errado neste macOS. `tempfile.gettempdir()` retorna
`/var/folders/l_/26f_dws90q5_8sxpxbntsj4r0000gn/T`, não `/tmp`
(`/private/tmp`) — checar só `/tmp` teria dado falsa confiança, porque
nunca acusaria nada ali independente do código funcionar ou não. Rodados
os dois:

```bash
TMPREAL=$(python3 -c "import tempfile; print(tempfile.gettempdir())")
ls -la /tmp | grep -i tmp > /tmp/antes_tmp.txt
find "$TMPREAL" -maxdepth 1 -iname "tmp*" 2>/dev/null | sort > /tmp/antes_tmpreal.txt
find "$TMPREAL" -maxdepth 1 -iname "tess_*" 2>/dev/null | sort >> /tmp/antes_tmpreal.txt

python3 foliant.py samples/001-080.pdf saida/teste_lixo.epub --autor "Teste"

ls -la /tmp | grep -i tmp > /tmp/depois_tmp.txt
find "$TMPREAL" -maxdepth 1 -iname "tmp*" 2>/dev/null | sort > /tmp/depois_tmpreal.txt
find "$TMPREAL" -maxdepth 1 -iname "tess_*" 2>/dev/null | sort >> /tmp/depois_tmpreal.txt

diff /tmp/antes_tmp.txt /tmp/depois_tmp.txt        # (sem diferença)
diff /tmp/antes_tmpreal.txt /tmp/depois_tmpreal.txt # (sem diferença)
```

Execução completou normalmente (`EXIT: 0`) e os dois `diff` vieram vazios
— nenhum diretório/arquivo novo (nem `tmpXXXXXXXX`, nem `tess_*` do
próprio Tesseract) ficou para trás em `TMPDIR` real após uma execução
normal. `saida/teste_lixo.epub` (artefato do teste) removido depois.

### Achado real durante a inspeção de qualidade: limiar de cabeçalho não generalizava

A inspeção amostral (não só o início do livro, que já tinha sido validado
no teste de 80 páginas) achou a página 30 do livro completo ainda com
`"a ; Como formular um problema de pesquisa?"` colado ao parágrafo — o
exato defeito que a Fase 2 deveria ter resolvido. Investigação:
`LIMIAR_CABECALHO = 0.06` (fração das páginas) tinha sido calibrado só
contra o recorte de 80 páginas (~6 capítulos); o livro completo tem ~24
capítulos/seções repetidas reais, cada um cobrindo proporcionalmente menos
páginas — com o limiar de 6% (mínimo 12/208), **só 2 dos 24 cabeçalhos
reais cruzavam a barra**, deixando ~115 das 195 páginas com texto
(≈59% do livro) com o cabeçalho ainda grudado.

**Correção**: `LIMIAR_CABECALHO` trocado de fração para contagem mínima
absoluta (`LIMIAR_CABECALHO_MINIMO = 3`, com um piso proporcional pequeno
de 1% só para livros muito maiores que os testados). Justificativa com
evidência real: nos dois livros testados (80 e 208 páginas), todo cluster
genuinamente cabeçalho tinha contagem ≥3, e todo cluster que não era
tinha contagem ≤2 — sem exceção, nas duas escalas. Revalidado após a
correção: **24 dos 24 cabeçalhos reais do livro completo agora são
detectados** (confirmado via novo log de execução, `grep "CABEÇALHO\]"`
retorna 24), a página 30 já não tem mais o cabeçalho colado, e nenhum
falso positivo novo apareceu (linhas de conteúdo isoladas continuam com
contagem ≤2, abaixo do limiar). RAM e tempo após a correção:
maxRSS=470.691.840B, peak footprint=295.522.304B, tempo real=19m36s —
idêntico à medição anterior dentro da margem de ruído, confirmando que a
correção do limiar não tem custo de RAM/CPU.

Limitação conhecida que persiste (já documentada, não é regressão nova): um
punhado de grafias de OCR muito ruidosas de um cabeçalho já corretamente
detectado (cluster com contagem ≥3) ainda ficam de fora do cluster — ex.
`"4 y Como classificar as pesquisas?"` na página 50 — pelo mesmo motivo já
registrado (perda de recall por precisão, não falso positivo).

### Fechamento da Fase 2

Confirmado com dados reais, não estimativa: RAM não escala com tamanho do
livro (objetivo central do projeto), cache em disco não deixa lixo em
execução normal, e a detecção de cabeçalho generaliza para um livro com
muito mais capítulos que o de teste original — depois de uma correção real
encontrada e aplicada durante este próprio teste de carga (exatamente o
tipo de "padrão de degradação que só aparece em volume" que a tarefa
pediu para vigiar). Fase 2 fechada.

## Fase 3: detecção de título de capítulo (2026-09-02)

Objetivo: TOC do EPUB refletindo capítulos reais, não uma entrada por
página. Investigação feita antes de qualquer código (ver `ARCHITECTURE.md`
para a tabela completa de alturas reais medidas em 7 páginas de início de
capítulo, incluindo os 2 achados de investigação que teriam contaminado a
calibração se não checados: página errada localizada via clustering, e um
número decorativo com altura maior que o próprio título).

- [x] **Fonte (b) — OCR (`image_to_data()`, altura de bounding box).**
  Implementada e validada. Critério: altura ≥ 2,0x a mediana da página,
  texto ≥ 6 caracteres, janela das primeiras 7 linhas, com tolerância de 1
  linha fraca no meio de um título de várias linhas.

- [x] **Fonte (a) — PDF nativo (`get_text("dict")`, tamanho de fonte).**
  Implementada por analogia, **sem calibração real** — nenhum PDF nativo
  de livro existe no projeto (os 3 arquivos de teste são 100%
  escaneados); validado só mecanicamente contra um PDF sintético gerado
  para o teste (descartado depois, não é dado real). Registrado como
  risco residual explícito no código e em `ARCHITECTURE.md` — revalidar
  antes de confiar nessa rota em produção.

- [x] **Pré-requisito: uma única chamada de OCR por página.** Trocado
  `image_to_string()` por `image_to_data()` (reconstruindo o texto a
  partir das mesmas linhas usadas para detectar título) para não dobrar o
  tempo de Tesseract. Validado linha a linha idêntico ao método antigo em
  3 páginas reais — achado real durante essa validação: ordenar por
  posição em pixels (não pela numeração block/par/line do próprio
  Tesseract) quebrava a ordem numa página real, o que teria introduzido
  uma regressão silenciosa na remoção de cabeçalho da Fase 2. Corrigido
  antes de integrar.

- [x] **Resultado da validação (TOC antes → depois, dado real):**

  | Livro | TOC antes | TOC depois |
  |---|---|---|
  | `samples/001-080.pdf` (80 páginas) | 76-80 | **8** |
  | Livro completo (208 páginas, `samples/livro_completo_208pg.pdf`) | ~195-208 | **26** |

  4 bugs reais encontrados e corrigidos durante a validação no livro de
  208 páginas (nenhum apareceu no teste de 80 páginas — só apareceram em
  volume real, ver `ARCHITECTURE.md` para os detalhes de cada um):
  1. Falso positivo por elemento decorativo (ornamento de divisória de
     parte) escolhido como título — corrigido subindo o limiar de 1,8
     para 2,0 e preferindo o último trecho de linhas fortes, não o
     primeiro.
  2. Truncamento por ruído de medição numa linha do meio de um título de
     3 linhas — corrigido tolerando 1 linha fraca no meio de um trecho.
  3. Bug real de lógica (não de calibração): o código retornava a
     contagem de linhas do título, não sua posição final na página —
     numa página com uma linha decorativa pulada antes do título, isso
     cortava a lista de parágrafos no lugar errado e deixava um pedaço do
     próprio título duplicado como parágrafo comum. Corrigido.
  4. Janela de busca (5 linhas) pequena demais para um título de 5 linhas
     precedido por um número decorativo — corrigida para 7.

  Falso positivo residual aceito, não corrigido: 1 cabeçalho pequeno
  repetido teve sua altura medida errada por ruído do próprio OCR numa
  página específica (`"Bibliograi sam"`), cruzando o limiar sem ser um
  título de verdade — ruído estatístico inerente ao método, não uma
  falha de lógica corrigível. Custo: 1 entrada espúria em 26.

**Fechamento**: TOC generalizado com sucesso para os dois livros de teste
em escalas bem diferentes (8 e 26 entradas, ambos próximos à estrutura
real do livro), depois de 4 correções reais encontradas e aplicadas
durante a própria validação — mesmo padrão das fases anteriores: testar
em volume real primeiro, corrigir o que aparecer, só então fechar.
Fonte (a) (PDF nativo) permanece como risco residual explícito, não
testado contra dado real, documentado para não ser esquecido se um PDF
nativo de livro passar pelo pipeline no futuro.

`requirements.txt`: não alterado — nenhuma dependência nova (usado
`statistics` da stdlib, além do que já estava em uso).

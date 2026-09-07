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
Fonte (a) (PDF nativo) permanece como risco residual explícito. **Atualização
(Fase 4.3)**: deixou de ser puramente hipotético — um PDF nativo real
(PEREIRA, 903 páginas) passou pelo pipeline em produção, e a contagem de
`<h2>` no `.epub` gerado deu zero em todas as 903 páginas (nenhum título
de capítulo detectado). Resultado ambíguo, não conclusivo (mesma
ambiguidade documentada em `ARCHITECTURE.md`, Fase 4.3, para a detecção
de cabeçalho repetido) — não tratar como validação bem-sucedida nem como
falha confirmada da heurística.

`requirements.txt`: não alterado — nenhuma dependência nova (usado
`statistics` da stdlib, além do que já estava em uso).

## Fase 4: empacotamento desktop via Tauri + sidecar PyInstaller (2026-09-03)

Núcleo (`foliant.py`) não alterado — fase só de empacotamento. Detalhes
completos e justificativas em `ARCHITECTURE.md` (seção "Fase 4"). Aqui,
só a evidência real de validação.

**Ambiente**: Rust/Cargo não estavam instalados — instalados via
`rustup` nesta fase (necessário para compilar o app Tauri). Máquina é
Intel real (Core m3 dual-core, 0,9GHz), target triple
`x86_64-apple-darwin`.

**Decisão Tesseract/Calibre**: opção (a) — app assume que já estão
instalados manualmente (mesmos passos do `README.md`), não embutidos.
Opção (b) documentada em `ARCHITECTURE.md` como possível Fase 4.1
futura, não implementada.

**Validação de byte-identidade (dado real, não estimativa)**:

| Livro | Páginas | HTMLs extraídos do EPUB | Idênticos byte a byte? |
|---|---|---|---|
| `samples/001-080.pdf` | 80 | 76 | **Sim**, todos |
| `samples/livro_completo_208pg.pdf` | 208 | 195 | **Sim**, todos |

Comparado `python3 foliant.py` (baseline) vs. `dist/foliant-core`
(binário PyInstaller `--onefile`, isolado, fora do Tauri), depois
confirmado que esse mesmo binário é o que fica embutido no app Tauri
(`Foliant.app/Contents/MacOS/foliant-core`, verificado com `find`).
Único diff real: `content.opf`, `toc.ncx` e `cover_image.jpg` — timestamp,
UUID e capa placeholder gerados de forma nova pelo Calibre a cada
execução, não pelo `foliant.py`. Caso já previsto e documentado antes do
teste rodar, não um achado de bug.

**Achado real durante a validação** (não é bug do `foliant.py`, é
comportamento do bootloader `--onefile` do PyInstaller): o binário
empacotado roda como dois processos (stub + filho real), o que quebra a
métrica `peak memory footprint` do `/usr/bin/time -l` quando aplicada ao
processo pai (retornou 528KB — obviamente errado). Corrigido medindo RSS
do processo filho por polling. Detalhes em `ARCHITECTURE.md`.

**Tempo e tamanho**:
- `foliant-core` isolado: 37MB.
- `Foliant.app`: 50MB. `Foliant_0.1.0_x64.dmg`: 41MB.
- Cold start (`foliant-core --help`, sem OCR real): ~4,5–5,1s — overhead
  fixo de descompactação do `--onefile` a cada execução.
- 208 páginas, sequencial (sem competir por CPU): baseline Python 34m27s,
  binário PyInstaller 20m19s (diferença atribuída a cache de disco/SO
  entre as duas execuções do mesmo PDF, não a regressão).
- RAM (80 páginas, polling de RSS do processo filho real): pico de
  377.604 KB (368,8 MiB) — mesma ordem de grandeza da referência de
  383,7 MiB (`maximum resident set size`, Python puro, teste de carga da
  Fase 1/2). Sem regressão de memória.

**Não testado nesta fase**: instalação em máquina limpa (mesma máquina
de desenvolvimento usada para o build, com Xcode Command Line Tools já
presentes) — o aviso do Gatekeeper por ausência de assinatura de código é
esperado como único obstáculo residual, decisão já tomada de não assinar
(custo do Apple Developer Program rejeitado), não revisitada aqui.

**Fechamento**: app desktop empacotado, sidecar validado como
byte-idêntico ao pipeline Python original nos 2 livros de teste, com
evidência real de tempo, tamanho e RAM — mesmo padrão das fases
anteriores.

## Fase 4.1: correção — UI do app instalado não respondia a cliques (2026-09-03)

**Sintoma reportado**: `.dmg` da Fase 4 instalado abre e renderiza a UI
(título, labels, campos), mas os botões "Selecionar…", o drag-and-drop e
"Converter" não faziam nada, sem nenhum erro visível.

**Causa raiz identificada (evidência real, não suposição)**: em
[desktop/src/main.js](desktop/src/main.js), o script era carregado como
`<script type="module">` e usava `import { ... } from "@tauri-apps/plugin-shell"`
/`"@tauri-apps/plugin-dialog"` — especificadores "nus" (bare specifiers).
O projeto não tinha nenhum bundler (`tauri.conf.json` original apontava
`frontendDist` direto para `../src`, sem passo de build). Por spec de
módulos ES, um bare specifier só resolve com um `<script type="importmap">`
— que não existia. Confirmado também que o próprio pacote npm
`@tauri-apps/plugin-dialog` reimporta `@tauri-apps/api/core` do mesmo
jeito (bare specifier) no seu `dist-js/index.js`, então não havia um
script global pré-empacotado (`window.__TAURI__.dialog`) disponível como
atalho — a correção certa era empacotar de verdade, não trocar por
chamadas ao global.

Isso explica todos os sintomas: HTML/CSS renderizam normalmente (falha de
módulo não bloqueia o parse do documento), mas o módulo inteiro falha na
linha de `import`, antes de qualquer `addEventListener` rodar — e nada na
página captura ou exibe esse erro.

**Limitação do ambiente de diagnóstico**: não foi possível abrir o Web
Inspector nem capturar screenshot da janela do app rodando (sandbox sem
acesso de Accessibility/tela ligado à sessão real do usuário). A causa
raiz acima veio de análise estática determinística (spec de módulos ES +
inspeção direta do bundle), não de uma linha de erro do console capturada
ao vivo.

**Correção aplicada**: adicionado `esbuild` como devDependency e um
script (`desktop/scripts/build-web.mjs`) que empacota `src/main.js` (com
todas as dependências resolvidas de verdade) e copia `index.html`,
`styles.css` e `assets/` para `desktop/dist/`. `tauri.conf.json` passou a
apontar `frontendDist` para `../dist` e a rodar `pnpm build:web` via
`beforeDevCommand`/`beforeBuildCommand`, tanto em `tauri dev` quanto em
`tauri build`. Verificado por grep que o bundle final não tem mais
nenhum `import` de especificador nu.

**Validação real, não suposição**:
- Rebuild de `pnpm tauri dev` com a correção: clique no botão
  "Selecionar…" via automação de acessibilidade (`osascript`/System
  Events) abriu de fato o painel nativo de seleção de arquivo do macOS
  (`sheets of window` foi de 0 para 1 imediatamente após o clique) — prova
  direta de que o listener JS agora é registrado e a chamada ao plugin
  `dialog` funciona.
- `pnpm tauri build` rodado do zero produziu um novo `Foliant.app`
  (50MB) e `Foliant_0.1.0_x64.dmg`; app reinstalado em `/Applications`
  a partir desse `.dmg` novo (versão antiga removida antes).
- Testar o mesmo clique contra o `.app` de release via automação de
  acessibilidade não foi conclusivo neste ambiente sandboxed: o app é
  encerrado silenciosamente (`proc_exit`, sem crash report) assim que a
  automação de acessibilidade interage com ele, e o log unificado mostra
  a causa — `tccd` nega o pedido de Accessibility do processo porque o
  binário não tem assinatura de código válida ("InvalidCode") nem o
  entitlement recomendado; isso é uma interação entre TCC e automação de
  acessibilidade neste ambiente de teste, não um crash do app em uso
  normal (o processo fica estável por 16s+ sem ser tocado por automação).
  **Não foi possível confirmar visualmente o clique no `.app` de release
  nesta sessão** — recomenda-se um teste manual rápido pelo usuário
  (clicar "Selecionar…", soltar um PDF, clicar "Converter") para fechar
  o critério de aceite com 100% de confiança.
- Pipeline de conversão (núcleo Python + sidecar PyInstaller) **não foi
  tocado** por esta correção — só a camada de frontend JS mudou.
  Confirmado por checksum: `sha256` de
  `desktop/src-tauri/binaries/foliant-core-x86_64-apple-darwin` (fonte,
  não recompilado nesta sessão) é idêntico ao `foliant-core` embutido no
  `.app` recém-gerado. Como o binário é byte-idêntico ao já validado na
  Fase 4, o teste de validação de byte-identidade não precisou ser
  re-executado (nenhuma superfície do pipeline mudou).

## Fase 4.2: correção — segundo bug, "Command plugin:shell|spawn not allowed by ACL" (2026-09-03)

**Descoberto pelo teste manual do usuário** no `.app` reinstalado da Fase
4.1 (exatamente o teste que a Fase 4.1 tinha pedido para fechar o
critério de aceite): "Selecionar…" e drag-and-drop já funcionavam
(confirma que a correção da Fase 4.1 estava certa), mas "Converter"
falhava com `Falha ao iniciar: Command plugin:shell|spawn not allowed by
ACL`. Dois bugs distintos e independentes coexistiam no mesmo `.dmg`
original da Fase 4 — o primeiro mascarava o segundo (com a UI inteira
morta, não dava nem pra chegar a clicar em "Converter" antes).

**Causa raiz (confirmada lendo o código-fonte da versão exata do plugin
fixada no `Cargo.lock`, `tauri-plugin-shell 2.3.6`, não por suposição)**:
o plugin `shell` trata `execute` e `spawn` como dois comandos IPC
distintos, cada um com seu próprio identificador de permissão —
`permissions/autogenerated/commands/execute.toml` define
`shell:allow-execute` (permite só o comando `execute`) e
`spawn.toml` define `shell:allow-spawn` (permite só `spawn`), como dois
`[[permission]]` separados, não uma hierarquia. O
`desktop/src-tauri/capabilities/default.json` original só concedia
`shell:allow-execute`. Mas `desktop/src/main.js` nunca chama
`.execute()` — chama `Command.sidecar(...).spawn()`, que o SDK JS
(`node_modules/@tauri-apps/plugin-shell/dist-js/index.js`) despacha como
`invoke("plugin:shell|spawn", ...)`. Ou seja, a permissão concedida
(`execute`) nunca correspondeu ao comando de fato invocado (`spawn`) —
um descompasso presente desde a Fase 4, nunca exercitado antes porque a
Fase 4 não incluiu um teste funcional de clicar em "Converter" na UI
(só validou o pipeline Python/PyInstaller isoladamente, fora do Tauri).

**Correção**: em `desktop/src-tauri/capabilities/default.json`, trocado
o identificador `shell:allow-execute` por `shell:allow-spawn`,
preservando o mesmo bloco de escopo (`name: "binaries/foliant-core"`,
`sidecar: true`, mesma lista de validadores de `args`) — permissão
específica para o sidecar `foliant-core`, não uma permissão genérica
para qualquer comando shell.

**Segundo achado durante a correção (não reportado pelo usuário, achado
por inspeção de código antes de reconstruir)**: lendo
`tauri-plugin-shell-2.3.6/src/scope.rs` (`ShellScope::_prepare`), a
validação de argumentos do escopo itera sobre a lista de validadores
declarada na capability (8 posições fixas) e falha com `MissingVar` se o
array de args real tiver menos elementos — mas `main.js` só incluía
`--titulo`/valor quando o campo "Título" (opcional na UI) estava
preenchido, o que geraria 6 args em vez de 8. Isso teria quebrado
"Converter" numa terceira rodada assim que alguém deixasse "Título" em
branco (bem provável, já que o placeholder do campo diz "(opcional)").
Corrigido em `desktop/src/main.js`: `--titulo` agora é sempre incluído,
com string vazia como valor padrão. Confirmado em `foliant.py:597`
(`titulo = args.titulo or args.pdf_entrada.stem`) que uma string vazia é
tratada de forma idêntica a omitir a flag — sem mudança de comportamento
do pipeline. Isso por sua vez exigia relaxar o validador daquela posição
em `default.json` de `.+` (exige 1+ caractere) para `.*` (aceita vazio),
já que o regex validado é ancorado (`^...$`) e uma string vazia não
passaria em `.+`.

**Validação**: `pnpm tauri dev` reconstruído com as duas correções fica
estável por 15s+ sem nenhuma automação tocando o processo (confirma que
o `capabilities/default.json` editado continua sendo JSON/schema válido
— um erro de sintaxe teria falhado em tempo de build, e o build passou
limpo). A tentativa de repetir o teste de clique via automação de
acessibilidade (mesma técnica que funcionou uma vez na Fase 4.1) não foi
reprodutível nesta sessão: a partir da segunda tentativa, o `tccd` passou
a negar a automação de Accessibility contra este binário não assinado de
forma consistente (mesmo artefato de sandbox já documentado na Fase 4.1,
aparentemente com a negação sendo cacheada pelo TCC após a primeira
tentativa) — **não foi possível confirmar visualmente o "Converter" de
ponta a ponta (gerar o `.epub`) nesta sessão**, por isso o usuário pediu
para testar manualmente ele mesmo desta vez.

`pnpm tauri build` rodado do zero, novo `.dmg` gerado, `.app` antigo
removido e substituído em `/Applications/Foliant.app`. Checksum do
sidecar confirma mais uma vez que o pipeline Python não foi tocado
(`foliant-core` embutido idêntico ao arquivo-fonte, não recompilado
nesta sessão).

**Em aberto**: aguardando confirmação do usuário de que "Converter" gera
um `.epub` de verdade no `.app` reinstalado — só então esta fase (e a
4.1) podem ser fechadas.

**Atualização**: fechado — o teste manual do usuário no `.app` da Fase
4.2 confirmou que os dois bugs desta fase e da 4.1 estavam corrigidos
(seleção de arquivo e início de conversão funcionando), revelando um
terceiro bug de categoria diferente (PATH), tratado na Fase 4.3 abaixo.

## Fase 4.3: correção — PATH mínimo do launchd + renomeação para evitar confusão de binários (2026-09-03)

**Descoberto pelo teste manual do usuário** no `.app` corrigido pela
Fase 4.2: seleção de arquivo e início de conversão já funcionavam, mas a
conversão falhava com `Erro: ferramentas ausentes no PATH: tesseract,
ebook-convert.` — terceiro bug, categoria diferente dos dois anteriores
(não é regressão).

**Causa raiz** (diagnóstico do próprio usuário, confirmado por pesquisa
antes de corrigir): apps GUI no macOS/Linux são iniciados pelo `launchd`
com um PATH mínimo do sistema, não herdam o PATH do shell interativo do
usuário (`.zshrc`). O sidecar `foliant-core`, como processo filho do app
Tauri, herda o PATH reduzido do próprio app — não o do terminal onde
`tesseract`/`ebook-convert` foram symlinkados em `/usr/local/bin`. O
mesmo problema afeta `TESSDATA_PREFIX`, exportado só no `.zshrc`.

Confirmado lendo o código-fonte de `tauri-plugin-shell` (não suposição)
que o processo filho do `Command.sidecar(...).spawn()` herda o ambiente
completo do processo do app Tauri por padrão quando nenhum `env` é
passado explicitamente na chamada JS (`commands.rs`,
`CommandOptions::env` tem default `Some(HashMap::default())` — cai no
branch `command.envs(env)` com mapa vazio, não no `env_clear()` — ou
seja, herança total do ambiente do processo pai, que é exatamente o
ambiente mínimo do `launchd`). Isso confirma a causa apontada pelo
usuário e mostra que a correção certa é consertar o ambiente do
**processo do app** (o pai), não fazer nada especial no lado do sidecar.

**Pesquisa antes de implementar** (via `WebSearch`/`WebFetch`, não
assumido de memória): esse é um problema conhecido e documentado, com
solução oficial mantida pelo próprio time do Tauri — o crate
[`fix-path-env-rs`](https://github.com/tauri-apps/fix-path-env-rs)
(`tauri-apps/fix-path-env-rs`). No macOS/Linux, ele roda o shell de
login do usuário (`$SHELL -ilc 'env'`) e aplica as variáveis exportadas
capturadas no processo atual. A API tem duas funções: `fix()` (só
`PATH`) e `fix_all_vars()` (todas as variáveis exportadas pelo shell).
Usar `fix_all_vars()` em vez de `fix()` resolve `PATH` e
`TESSDATA_PREFIX` com o mesmo mecanismo, sem hardcodar nenhum caminho no
código Rust — mais robusto que a alternativa de hardcodar
`/usr/local/bin` e `~/micromamba/envs/foliant-ocr/share/tessdata`
diretamente (caminho específico desta máquina/instalação, quebraria se o
usuário reinstalar as ferramentas em outro lugar).

**Correção aplicada**:
1. `desktop/src-tauri/Cargo.toml`: adicionado
   `fix-path-env = { git = "...", rev = "c4c45d503ea115a839aae718d02f79e7c7f0f673" }`
   — fixado num commit específico (não numa branch flutuante), já que o
   crate não publica no crates.io.
2. `desktop/src-tauri/src/lib.rs`: `fix_path_env::fix_all_vars()`
   chamado logo no início de `run()`, antes de `tauri::Builder`.
3. `foliant.py`, `check_dependencies()`: avaliado e implementado um
   fallback de defesa em profundidade (pedido explícito do usuário) —
   além de `shutil.which()`, checa caminhos absolutos conhecidos
   (`/usr/local/bin/tesseract`, `/usr/local/bin/ebook-convert`) e, se
   encontrar o binário lá mas não no PATH herdado, **adiciona o
   diretório ao `PATH` do próprio processo Python** (não só reporta
   "encontrado" — sem isso, `pytesseract` e o `subprocess.run(["ebook-convert", ...])`
   ainda tentariam resolver pelo PATH e falhariam depois, mesmo com o
   preflight check passando). Testado isoladamente com PATH simulado
   (`/usr/bin:/bin`, sem `/usr/local/bin`): confirma que acha via
   fallback, corrige o PATH do processo, e o caso negativo (binário
   realmente ausente em todo lugar) continua saindo com erro como antes.

**Sidecar precisou ser reconstruído** (diferente das Fases 4.1/4.2, que
não tocaram `foliant.py`): rodado `scripts/build-sidecar.sh` de novo.
Checksum mudou como esperado (`67e9619e...` — antes era `f1971521...`).
Validado com `--help` (roda, sai 0) e com os dois testes unitários acima.

**Revalidação de byte-identidade, dado real (pedido explícito do
usuário — não deixar a suposição de "mudança isolada" sem checagem)**:
rodado `python3 foliant.py samples/001-080.pdf` duas vezes — uma com a
versão de `foliant.py` de antes desta fase (`git show HEAD:foliant.py`,
ou seja, a árvore antes de qualquer mudança de PATH) e outra com a
versão atual (com o fallback de PATH em `check_dependencies()`) — e
comparados os `.epub` gerados.

| | HTMLs extraídos | Idênticos byte a byte? |
|---|---|---|
| `samples/001-080.pdf`, antes vs. depois do fix de PATH | 76 em cada lado | **Sim**, todos — `diff -rq` recursivo entre os dois `.epub` extraídos deu zero diferenças fora de `content.opf`/`toc.ncx`/`cover_image.jpg` (mesma exceção não-determinística do Calibre já documentada na Fase 4) |

Contagem de 76 HTMLs bate exatamente com o resultado original da Fase 4
para este mesmo livro. Confirma, com evidência real (não só leitura do
diff de código), que a mudança em `check_dependencies()` não afetou o
pipeline de OCR/HTML/EPUB.

**Segunda correção: confusão de nomes "desktop" vs "Foliant"**. O
usuário relatou dois artefatos com identidade confusa — investigado e
confirmado: **não são dois apps**, é um único app com dois nomes em
camadas diferentes. `productName: "Foliant"` no `tauri.conf.json`
sempre controlou só o nome do bundle final (`Foliant.app`,
`Foliant_0.1.0_x64.dmg`) — o executável *dentro* do bundle
(`Foliant.app/Contents/MacOS/<nome>`) vem do nome do pacote Cargo
(`[package] name` em `Cargo.toml`), que Tauri **não** renomeia para bater
com `productName` (confirmado inspecionando o bundle: o executável
sempre se chamou `desktop`, nunca `Foliant`, em todo `.app` gerado até
aqui). É esse binário `desktop` — o mesmo nome usado internamente tanto
pelo `.app` de produção quanto pelo binário solto que `pnpm tauri dev`
roda em `desktop/src-tauri/target/debug/desktop` — que gerava a
ambiguidade.

**Correção**: `[package] name` em `Cargo.toml` renomeado de `"desktop"`
para `"foliant-desktop"` (o nome do crate `[lib]`, `desktop_lib`, não
precisou mudar — é só um detalhe interno do Rust, nunca aparece pra
fora). Depois do rebuild, o executável dentro do bundle passou a se
chamar `Foliant.app/Contents/MacOS/foliant-desktop` — sem mais
ambiguidade com nada. Os binários soltos antigos em
`desktop/src-tauri/target/{debug,release}/desktop` (artefatos de build,
gitignored) foram apagados nesta sessão; builds futuros de
`pnpm tauri dev`/`pnpm tauri build` já saem com o nome novo.

**Para o usuário, para não repetir a confusão**: `desktop/src-tauri/target/debug/`
é sempre saída temporária de desenvolvimento (`pnpm tauri dev`) — nunca
deve ser tratada como o app real nem executada fora de teste/debug. O
único artefato que importa para uso real é o `.dmg` gerado por
`pnpm tauri build` (em `desktop/src-tauri/target/release/bundle/dmg/`),
instalado como `/Applications/Foliant.app`. Sempre teste/valide a partir
desse `.dmg`, nunca a partir de um binário solto em `target/`.

**Validação**: `pnpm tauri build` rodado do zero (baixou e compilou a
nova dependência `fix-path-env` limpo, sem erros). `.dmg` novo gerado,
`.app` antigo removido e substituído em `/Applications/Foliant.app`.
Checksum do `foliant-core` embutido no bundle confere com o sidecar
recém-reconstruído (`67e9619e...`). **Não foi possível confirmar
visualmente nesta sessão que a conversão completa até o `.epub` funciona
no `.app` de produção** — mesma limitação de automação de acessibilidade
contra binário não assinado já documentada nas Fases 4.1/4.2 (o `tccd`
nega a automação depois da primeira tentativa nesta sessão). Usuário vai
validar manualmente o fluxo completo (Selecionar → PDF → Converter →
`.epub` gerado) antes de fechar.

## Fase 4.4: correção — recuo de linha incorreto ("zigue-zague" visual) (2026-09-03)

**Sintoma reportado**: no EPUB do livro de 903 páginas (PEREIRA), texto
com zigue-zague visual de recuo — causa raiz já identificada pelo
usuário antes de pedir a correção: `foliant.py` gerava um `<p>` por
linha física do texto extraído, e o CSS aplica `text-indent` a todo
`<p>` igualmente, recuando toda linha, não só início real de parágrafo.

**Pesquisa de sinais de layout, dados reais antes de decidir o
critério** — mesma disciplina das Fases 2-3, ver `ARCHITECTURE.md` para
a tabela completa de evidência (posição X por página, estatística
agregada de 1.379 linhas, sinal de gap vertical testado e descartado,
sinal de pontuação considerado e não adotado por falta de caso real que
o justificasse).

**Correção real feita em duas etapas — a primeira estava incompleta, e
isso é registrado aqui, não escondido**: a primeira versão desta
correção só tratava o caminho de OCR (`extrair_linhas_ocr`), calibrada
com dados reais obtidos renderizando+OCRizando páginas do livro de 903
páginas via um script de pesquisa isolado. Só depois de implementar e
testar essa primeira versão — ao rodar o pipeline de verdade
(`extrair_texto_pagina`) na mesma página para conferir — ficou claro que
`inicio_paragrafo` voltava `None`: o PDF do livro de 903 páginas **tem
texto nativo real** (`pagina.get_text("text")` retorna texto direto,
sem OCR nenhum), e o pipeline sempre prioriza esse caminho quando
disponível. Ou seja, a correção original nunca chegava a rodar para o
livro que de fato motivou o pedido — o script de pesquisa tinha
renderizado+OCRizado a página manualmente, sem nunca checar se a
produção usaria esse caminho. Confirmado que os outros 3 PDFs de teste
(`samples/001-080.pdf`, `samples/161-208.pdf`,
`samples/livro_completo_208pg.pdf`) continuam 100% sem texto nativo —
só o livro novo tem.

Corrigido de verdade: implementado o critério equivalente para o
caminho nativo, calibrado com dados reais desse mesmo livro via
`pagina.get_text("dict")["blocks"][...]["lines"][...]["bbox"]` — texto
nativo é exato (sem ruído de scan), margem de continuação em x0=15.0pt
e início de parágrafo em x0=37.5pt, sem variação em nenhuma linha
observada. Achado adicional real: subtítulos de seção (ex. "▸3.11
Revisões externas") têm recuo MENOR que um parágrafo comum mas fonte
1,3-1,5x maior — sem um segundo sinal de tamanho, esses subtítulos
seriam classificados como continuação e colados ao parágrafo anterior;
implementado um override por razão de tamanho de fonte
(`LIMIAR_RECUO_RAZAO_TAMANHO_NATIVO = 1.3`) só para o caminho nativo
(não validado para o caminho OCR — não implementado lá por falta de
dado real). Ver `ARCHITECTURE.md`, Fase 4.4, para os números completos
e o raciocínio de cada limiar.

**Escopo**: a fusão de linhas se aplica aos dois caminhos agora (OCR e
nativo), com critérios calibrados separadamente (unidades diferentes —
pixels de render vs. pontos PDF).

**Evidência real antes/depois** (subconjunto de 24 páginas extraído do
livro de 903 páginas — páginas 59-66, 199-206, 399-406 — não o livro
completo, que levaria horas nesta máquina; mesmo código de produção,
sem nenhuma função mockada):

Antes (página 60 original, um `<p>` por linha física):
```html
<p class="calibre1">Nas primeiras revisões, o autor se encarrega de assegurar que as palav</p>
<p class="calibre1">suas intenções. Não raramente, no caso de se tratar de autor exigente,</p>
<p class="calibre1">são necessárias para que ele se torne satisfeito com o que produziu. E</p>
<p class="calibre1">é conveniente fazer-se o "teste da gaveta": deixar o texto repousar, e</p>
<p class="calibre1">alguns dias, antes de voltar a lê-lo. Em alguns casos, tem-se mesmo a</p>
<p class="calibre1">relê-lo, de que outra pessoa o escreveu ou o alterou diante das incons</p>
<p class="calibre1">notadas e dos reparos ainda necessários. Ou mesmo chegar-se a conclusã</p>
<p class="calibre1">frente à boa qualidade do texto.</p>
```
(8 `<p>` recuados igualmente — o zigue-zague relatado.)

Depois (mesma página, mesmo trecho):
```html
<p class="calibre1">Nas primeiras revisões, o autor se encarrega de assegurar que as
palavras reflitam suas intenções. Não raramente, no caso de se tratar de
autor exigente, várias revisões são necessárias para que ele se torne
satisfeito com o que produziu. Entre as revisões, é conveniente fazer-se
o "teste da gaveta": deixar o texto repousar, esquecido por alguns dias,
antes de voltar a lê-lo. Em alguns casos, tem-se mesmo a sensação, ao
relê-lo, de que outra pessoa o escreveu ou o alterou diante das
inconsistências notadas e dos reparos ainda necessários. Ou mesmo
chegar-se a conclusão oposta, frente à boa qualidade do texto.</p>
```
(1 `<p>` só, recuo só no início real do parágrafo.)

Subtítulos confirmados protegidos (não grudaram no parágrafo ao redor):
`"▸B Foco das revisões"`, `"▸3.11 Revisões externas"` (mesma página),
`"▸7.5 Perdas de participantes"`, `"▸A Quantidade de perdas"` (página
~200), `"▸12.15 Idioma do resumo"`, `"▸12.16 Preparação do resumo"`
(página ~400) — todos ficaram como `<p>` próprio, separados do texto ao
redor.

**Limitação residual — reclassificada após inspeção visual real (não a
suposição original)**: a nota original dizia "não é regressão, mesmo
comportamento de antes" — checado depois com inspeção de verdade, e essa
suposição estava **errada** para pelo menos um tipo de conteúdo real.

Busca automatizada por blocos de recuo uniforme (4+ linhas consecutivas
com a mesma posição X, fora da faixa de recuo normal de parágrafo) em
todo o livro de 903 páginas, pulando o material introdutório, achou 12
páginas candidatas (65, 106, 162, 185, 204, 207, 260, 272, 312, 336,
338, 383). Inspecionadas 3 delas (65, 106, 162) no PDF original e no
`.epub` gerado (subconjunto real convertido pelo pipeline de produção,
`/tmp/recuo_validation/subset_listas.epub` — não suposição sobre como o
código se comportaria):

- **Página 65 — lista numerada de referências bibliográficas, recuo
  "pendurado"** (a linha de CONTINUAÇÃO de uma referência fica MAIS
  recuada que o início da referência seguinte — o oposto do padrão
  normal de parágrafo, que o critério assume). Comparado byte a byte o
  `.epub` gerado ANTES desta correção (código do commit anterior, mesmo
  subconjunto de páginas) contra o gerado DEPOIS:

  **Antes** (cada referência numerada em seu(s) próprio(s) `<p>`,
  claramente delimitada):
  ```html
  <p class="calibre1">2. Merton RK. The sociology of science: [...] Chicago:</p>
  <p class="calibre1">University of Chicago Press; 1973.</p>
  <p class="calibre1">3. Bachelard G. La formation de l'esprit scientifique. [...]</p>
  ```

  **Depois** (a fusão gruda o fim da referência 2 com o INÍCIO da
  referência 3 no mesmo `<p>` — o marcador "3." vira texto no meio da
  frase, não mais o início visível de uma entrada nova):
  ```html
  <p class="calibre1">University of Chicago Press; 1973. 3. Bachelard G.
  La formation de l'esprit scientifique. Paris: Librairie Phi[...]</p>
  ```

  **Isto é uma REGRESSÃO real, não neutra** — antes, um leitor conseguia
  identificar visualmente onde cada referência começava (cada uma na sua
  própria linha/parágrafo, mesmo sem indentação correta); depois, várias
  referências ficam coladas dentro do mesmo parágrafo, com o número da
  entrada seguinte enterrado no meio do texto.

- **Páginas 106 e 162 — listas de itens com marcador semântico
  ("Dentre os problemas... estão:", "Entre as informações... estão:")**:
  mesmo padrão de recuo em bloco — itens da lista ficam parcialmente
  fundidos entre si de forma incoerente (ex., página 106: `"...Aferições
  mal conduzidas ou distorcidas Importantes fatores não serem levados
  em..."` — dois itens de lista diferentes colados sem nenhum separador
  visível). Página 106 também tem uma legenda de figura/fluxograma com
  fragmentos de texto em posições X muito diferentes (rótulos de um
  diagrama, não texto corrido) — esse caso específico NÃO piorou (cada
  fragmento continua em seu próprio `<p>`, já que os deltas de posição
  são grandes o suficiente para não fundir por engano), mas também não é
  o mesmo tipo de conteúdo que os dois problemas acima.

**Classificação (a) — defeito visual real remanescente, não nota de
rodapé**: confirmado por inspeção visual e comparação antes/depois, não
por suposição. Vira item de **backlog** (não bloqueia o fechamento da
Tarefa B — o caso comum, prosa normal, está corrigido e validado nos 3
livros; este é um caso-limite de um tipo específico de conteúdo
estruturado). Prioridade sugerida: baixa-média — afeta listas
numeradas/com marcador de recuo pendurado ou em bloco, não a maioria do
texto corrido de um livro típico, mas é uma regressão real onde ocorre
(pior que o "não fundir nada", que ao menos preservava a ordem legível
das entradas). Direção de correção futura mais provável, não
implementada agora: detectar um marcador de item no início da linha
(ex. `^\d+\.\s`, `^[•\-–]\s`) como sinal de "início de novo item" que
sobrepõe o critério de posição X — não investigado com dado real ainda,
não implementar sem calibrar contra mais exemplos reais primeiro (mesmo
padrão de disciplina desta correção inteira).

**Validação nos 2 livros de calibração das Fases 2-3 (dado real, não
suposição)**: pipeline completo rodado contra `samples/001-080.pdf` (80
páginas) e `samples/livro_completo_208pg.pdf` (208 páginas), ambos 100%
via caminho OCR — para confirmar que a correção do caminho OCR não
introduziu regressão nesses livros.

| Livro | Exit code | Páginas confirmadas no HTML final (`id="pg-N"`, `N` de 1 até o total) | Parágrafos típicos (fora de página de sumário/fórmula) |
|---|---|---|---|
| `samples/001-080.pdf` | 0 | 80/80, todas presentes | 100-1444 caracteres (antes: ~70 por `<p>`, um por linha física) |
| `samples/livro_completo_208pg.pdf` | 0 | 208/208, todas presentes | 101-910 caracteres |

Nenhum crash, nenhuma página perdida nos dois livros. Contagem de
páginas confirmada via `grep` direto nos arquivos HTML extraídos do
`.epub` — não assumida a partir do log. (Achado à parte, não um bug: a
contagem de arquivos HTML que o Calibre gera ao dividir o EPUB mudou de
76 para 77 em `samples/001-080.pdf` — o Calibre decide onde dividir por
tamanho de arquivo, e parágrafos maiores/menos numerosos deslocam esse
corte; não afeta a contagem de PÁGINAS do livro, que permanece 80/80,
só quantos arquivos HTML o conteúdo ficou dividido entre.)

Comprimento de parágrafo bem acima do baseline de ~70 caracteres (um por
linha física de OCR) confirma que a fusão está funcionando de verdade
nesses dois livros também, não só no livro de 903 páginas que motivou a
correção.

## Fase 4.5: extração de capa real; investigação (e abandono) de supressão de logo/figura (2026-09-04)

Motivado por relato do usuário (com imagens anexadas): o logo do selo
GEN aparecia como ruído de texto (`"x* Grupo Editorial Nacional"`) no
EPUB do livro do Gil, e todo EPUB gerado tinha capa genérica
("Generating default cover" no log do Calibre, nunca a capa real).
Escopo original também incluía extrair figuras internas reais
(fluxogramas mencionados no texto) como imagem.

Testado contra `samples/livro_completo_208pg.pdf` (208 páginas, Gil,
100% OCR) e o PDF "Artigos Científicos" (PEREIRA, 903 páginas, quase
100% nativo).

- [x] **Capa real extraída da 1ª página do PDF.** Resultado: confirmado
  nos 2 livros de calibração — Gil (proporção página 0.7016 vs. imagem
  0.7008, diferença 0.1%, capa de 732446 bytes) e PEREIRA (proporção
  página 0.7727 vs. imagem 0.7509, diferença 2.8%, capa de 98477 bytes).
  Log do Calibre confirma ausência da linha "Generating default cover"
  nos dois casos, antes presente em toda execução. Extração direta do
  binário via `doc.extract_image()`, sem re-renderizar — código
  aditivo e seguro por padrão (`None` = comportamento antigo se nenhuma
  imagem bater a proporção da página).

- [x] **Supressão do ícone decorativo do logo GEN — tentada,
  investigada a fundo, e revertida.** Resultado: **não resolvida** —
  ruído original continua presente no EPUB, sem regressão em relação ao
  estado anterior (nunca foi removido antes, continua não sendo agora).
  Ver `ARCHITECTURE.md`, Fase 4.5, para a tabela completa de dados reais.
  Resumo do que foi encontrado, em ordem:
  - O ícone da logo é OCRizado como **2 fragmentos separados**, não 1:
    `"*"` (razão de altura 3.7x a mediana da página) e `"x*"` (razão
    2.06x) — o segundo é o que aparece no EPUB (`"x*"` antes de "Grupo
    Editorial Nacional"), não o primeiro.
  - Implementado um limiar (altura >= 3.5x mediana + comprimento <=3
    caracteres) que isola o fragmento de razão 3.7x com segurança
    (entre o pior título real conhecido, 2.5x, e o pior ornamento
    decorativo já documentado, 5.8x).
  - **Bug real encontrado só depois de comparar antes/depois byte a
    byte no pipeline de produção completo** (não um script de
    pesquisa): a contagem de parágrafos do livro do Gil ficou
    **idêntica** (1205 = 1205) com e sem a nova função. Investigação da
    causa: uma regex pré-existente (`_RE_RUIDO_INICIAL`, já usada para
    limpar pontuação decorativa solta) **já removia** o fragmento de
    razão 3.7x (`limpar_linha('*') == ''`, descartado como parágrafo
    vazio) — a função nova nunca teve efeito observável em lugar
    nenhum do livro. `'x*'` não é afetado pela regex antiga porque
    `'x'` não está na classe de ruído dela.
  - Tentativa de baixar o limiar para cobrir também o fragmento de
    razão 2.06x (`"x*"`, o caso que de fato precisava ser resolvido):
    **colide com texto real**. Varredura de conteúdo curto (<=3
    caracteres) nas páginas 8-39 do mesmo livro encontrou a palavra
    real `"se"` (página 21) com razão **2.73x** — mais alta que a razão
    do próprio ícone que se queria capturar. Não existe limiar de
    altura/razão que separe os dois casos com os dados disponíveis.
  - **Decisão**: revertida a função `remover_glifos_decorativos` e os
    limiares associados — não haveria benefício real (o único caso que
    cobria já era coberto) e o caso que precisava resolver não tem
    critério seguro. Registrado como caminho **investigado e
    abandonado**, não como TODO em aberto — não reabrir com a mesma
    estratégia (altura/razão de OCR) sem um sinal novo.

- [x] **Extração de figuras internas reais (fluxogramas) — fora de
  escopo, confirmado não afetado.** Resultado: nenhuma mudança feita.
  Investigação (Passo 1 do meta-prompt original) mostrou que este livro
  não tem NENHUMA imagem em sub-região extraível via PyMuPDF — toda
  "imagem" de `get_images()` é a página inteira (livro 100% escaneado).
  A única via seria recorte heurístico do pixmap já renderizado; a
  página real com esse padrão (índice 105, capítulo "Como delinear um
  estudo de coorte") tem os fragmentos decorativos misturados
  palavra-a-palavra dentro do MESMO bloco do título real, sem fronteira
  seguro pra recorte. Descartado por decisão explícita do usuário diante
  dessa evidência, confirmado inalterado via `extrair_texto_pagina()`
  (função de produção) antes de fechar a tarefa.

**Fechamento**: 1 de 3 objetivos originais entregue (capa real, testada
e funcionando nos 2 livros de calibração, zero regressão). Os outros 2
(supressão de logo, extração de figura) foram investigados com dados
reais e conscientemente não implementados — não por falta de tempo, mas
porque os dados reais coletados mostram que a abordagem heurística
proposta no meta-prompt original não separa ruído de conteúdo real com
segurança neste livro. Validação completa nos 2 livros de calibração
disponíveis (Gil 208pg, PEREIRA 903pg) — pipeline de produção completo,
exit code 0 nos dois, contagem de parágrafos do Gil idêntica à anterior
a esta fase (1205 = 1205), caminho nativo do PEREIRA estruturalmente
intocado por qualquer código desta fase (só a página 0, a capa, usa
OCR).

`requirements.txt`: não alterado — nenhuma dependência nova (PyMuPDF já
fornecia `get_images()`/`extract_image()`).

## Backlog: acelerar tempo de OCR/conversão entre iterações de teste

**Contexto**: testes de validação em livros reais (80–208 páginas) levam
10–20+ minutos, o que trava o ciclo de iteração (qualquer ajuste pequeno
em heurística exige esperar o teste inteiro de novo). Isso não bloqueia
nenhuma fase atual, mas vira fricção crescente conforme o projeto avança
— vale investigar antes que a Fase 5 (web) e futuras validações fiquem
inviáveis de iterar rápido.

**Direções a investigar, em ordem de esforço/risco:**

1. **Profiling antes de otimizar** — confirmar empiricamente qual etapa
   domina o tempo (OCR via Tesseract? Renderização de página via
   PyMuPDF? Conversão final do Calibre?) antes de otimizar a etapa
   errada. Instrumentar com `time.perf_counter()` por página/etapa.

2. **Paralelizar OCR entre páginas** (maior ganho esperado, maior risco):
   a máquina tem 2 núcleos e o pipeline hoje processa página por página,
   sequencialmente, num só processo. Usar `multiprocessing.Pool(2)` para
   rodar OCR de 2 páginas em paralelo poderia cortar o tempo quase pela
   metade. Cuidado real a validar: isso tensiona com a arquitetura de
   streaming/RAM constante já validada (Fase 2) — cada worker precisa
   continuar liberando memória por página, não acumular resultado de
   várias páginas simultâneas na RAM. Precisa de nova validação de pico
   de RAM se implementado, não assumir que o número de 282MiB se mantém.

3. **Separar "teste rápido de desenvolvimento" de "validação completa"**
   — hoje qualquer teste roda o livro inteiro. Um modo de teste rápido
   (ex.: primeiras 10 páginas + 1 página nativa + 1 escaneada
   representativa) serviria para iteração de lógica (limpeza de linha,
   detecção de cabeçalho/título), reservando a validação completa
   (208 páginas) só para o fechamento formal de cada fase — como já é
   o padrão, mas caro demais para repetir a cada ajuste pequeno.

4. **Cache de OCR entre execuções em modo dev** — a arquitetura de duas
   passadas já grava o texto OCRizado num cache temporário, mas ele é
   descartado ao final da execução. Um modo opcional que persista esse
   cache (por hash do PDF) permitiria reiterar em cima da lógica de
   pós-processamento (HTML, limpeza, TOC) sem pagar o custo de OCR de
   novo — só vale se o profiling do item 1 confirmar que OCR é de fato o
   gargalo dominante.

**Critério de aceite quando esta tarefa for puxada**: qualquer mudança
aqui precisa reconfirmar o pico de RAM (~282MiB) e a saída byte-idêntica
dos 2 livros de teste — não pode silenciosamente reabrir riscos já
fechados nas Fases 2 e 3.

## Backlog: atraso de "acordar" do agente após jobs em background

**Observação real desta sessão**: durante a validação byte-idêntica
(Tarefa A), o Claude Code usou tanto a notificação de conclusão nativa
do comando em background quanto um `ScheduleWakeup` próprio para o
mesmo evento — resultando num lembrete atrasado disparando depois que
o resultado já tinha sido reportado e documentado, gerando confusão
sobre o que ainda estava pendente.

**Causa raiz**: uso redundante de duas mecânicas de notificação para o
mesmo sinal — comportamento já mapeado como problemático em relatos
públicos sobre o Claude Code (não é peculiaridade desta sessão).

**Mitigação a aplicar em jobs futuros longos**: ao pedir para o agente
monitorar um processo em background, orientar explicitamente a
depender só da notificação de conclusão nativa do próprio comando em
background, sem agendar um `ScheduleWakeup` paralelo para o mesmo
evento — evita o atraso/duplicação observado.

## Fase 4.6: barra de progresso real por fase (2026-09-04)

Ver `ARCHITECTURE.md` para a investigação completa do buffer de saída,
o formato das linhas `PROGRESS:` e o raciocínio por trás de 2 das 3
fases terem sinal granular real e 1 (montagem HTML) não ter. Aqui, só a
evidência de validação.

- [x] **Buffer de saída — `PYTHONUNBUFFERED=1` testado e descartado,
  `sys.stdout.reconfigure(line_buffering=True)` adotado.** Achado real
  contra-intuitivo: um teste sintético isolado (`python3` puro) mostrou
  as duas opções funcionando igual, mas contra o binário PyInstaller
  `--onefile` real, `PYTHONUNBUFFERED=1` setado no processo pai **não
  funcionou** — todos os `print()` do Python ficaram retidos até o
  processo inteiro terminar (confirmado com timestamps reais: linhas de
  "página X/80 processada" que deveriam ter aparecido ao longo de ~9
  minutos chegaram todas juntas, no mesmo instante, só no final). Só a
  saída do subprocess do Calibre (herdada via fd, fora do buffer do
  Python) chegou em tempo real nesse teste. `reconfigure(line_buffering=True)`
  testado da mesma forma e confirmado funcionando — streaming linha a
  linha real. Isso significou tocar `foliant.py` (não só o lado Tauri,
  como a preferência original), decisão justificada pela evidência, não
  pela conveniência.

- [x] **Linhas `PROGRESS:` estruturadas.** Emitidas a cada página (não
  só a cada 20, diferente do log legível já existente) na fase `ocr`, no
  início/fim da fase `html` (sem contador — ver justificativa com tempo
  medido em `ARCHITECTURE.md`), e por cada marca de `%` real que o
  Calibre emite na fase `epub` (`convert_to_ebook()` migrado de
  `subprocess.run` sem captura para `Popen` com stdout capturado, para
  poder interceptar essas marcas sem perder o log bruto).

- [x] **UI (index.html/styles.css/main.js).** 3 fases visíveis, cada uma
  com nome, contador e barra; fase `html` com animação indeterminada
  (spinner) em vez de 0-100%, já que não tem sinal granular real.
  Validação visual direta da UI (clique/renderização) não foi possível
  nesta sessão — mesma limitação de automação de acessibilidade contra
  binário não assinado já documentada nas Fases 4.1-4.3 (`tccd` nega
  automação, app não aparece em capturas de tela deste ambiente).
  Validado por evidência indireta forte: o mecanismo de entrega
  (`Command.stdout.on("data", ...)` linha a linha) já era usado com
  sucesso desde a Fase 4.2 para o log bruto, e as linhas `PROGRESS:`
  seguem exatamente o mesmo canal — mas a confirmação visual final
  (barras realmente desenhando, animação da fase indeterminada) fica
  pendente de teste manual do usuário no `.app` reinstalado.

- [x] **Validação end-to-end nos 3 livros de calibração, binário do
  sidecar reconstruído (idêntico por checksum ao embutido no `.app`
  após rebuild):**

  | Livro | Páginas | Caminho | Exit | Tempo total | Linhas PROGRESS | HTMLs no epub | `<p>` | Baseline anterior |
  |---|---|---|---|---|---|---|---|---|
  | PEREIRA | 903 | nativo (quase todo) | 0 | 144,29s | 910 | 903 | 10578 | 10578 (Fase 4.5) — **idêntico** |
  | `livro_completo_208pg.pdf` | 208 | OCR | 0 | 2202,57s* | 215 | 195 | 1205 | 1205 (Fase 4/4.5) — **idêntico** |
  | `samples/001-080.pdf` | 80 | OCR | 0 | 616,62s (10m17s) | 87 | 76 | 481 | 76 HTMLs (Fase 4) — **idêntico** |

  \* O tempo de 208 páginas (36m43s) é bem mais alto que o baseline
  histórico (~19-20min) — atribuído a contenção real de CPU na máquina
  de desenvolvimento durante o teste (múltiplas sessões do Claude Code,
  editor e navegador rodando ao mesmo tempo; `pmset -g therm` confirmou
  `CPU_Speed_Limit=50`, throttling térmico ativo, e `load average` de
  ~33 num par de núcleos), não uma regressão desta fase — as linhas
  `PROGRESS:` continuaram chegando em tempo real (streaming confirmado
  por timestamp) mesmo com o processamento mais lento. O teste de 80
  páginas, rodado depois com menos contenção concorrente, ficou bem
  mais próximo do baseline histórico (~8-11min). Contagem de
  páginas/parágrafos/HTMLs idêntica ao baseline nos 3 livros confirma
  **zero regressão** no pipeline em si — a mudança de buffer e as
  linhas `PROGRESS:` não afetaram o conteúdo gerado.

  Streaming em tempo real confirmado por timestamp em todos os testes —
  ex. PEREIRA: página 20/903 em 5,84s, página 903/903 em 69,56s,
  atualizações a cada ~1,5-2s ao longo de toda a fase, não em blocos de
  minutos como o sintoma original relatado.

**Fechamento**: os 3 livros de calibração validados sem regressão,
streaming em tempo real confirmado por timestamp em todos. Confirmação
visual manual da UI (barras desenhando de verdade na tela) pendente do
usuário — automação de acessibilidade não foi possível nesta sessão
(mesma limitação de binário não assinado já documentada nas Fases
4.1-4.3: `tccd` nega a automação, `screencapture` não mostra a janela
do app neste ambiente). Recomendado: reinstalar `Foliant.app` a partir
do `.dmg` novo em `desktop/src-tauri/target/release/bundle/dmg/` e
testar manualmente uma conversão, observando as 3 barras de progresso
atualizando durante o processamento.

## Inspeção de qualidade: 1º livro de teste em inglês (2026-09-04)

Ver `ARCHITECTURE.md` para a investigação completa (mecanismo, tabelas
de evidência, simulações). Aqui, só o resumo acionável — **tarefa de
inspeção, nenhuma correção de código aplicada**, conforme escopo.

Livro: `Fundamentals of Data Engineering (Third Early Release)`, 210
páginas, processado com `--lang por` (sem seletor automático — Parte 2
do backlog de UI/UX ainda não implementada).

- [x] **Item 1 — qualidade de OCR em inglês com `por`.** Achado que
  muda a premissa da investigação: este PDF é **96,7% texto nativo**
  (203/210 páginas) — só 7 páginas usam OCR, e as 7 são imagens de
  página inteira (gráficos/infográficos), não prosa. **Não há amostra
  de prosa em inglês via OCR disponível neste livro** para comparar
  contra o baseline em português dos livros de calibração. Implicação
  real para a Parte 2: para PDFs "born-digital" nativos (early-release,
  não escaneados), a escolha de idioma do OCR importa pouco na prática
  — reduz a urgência da detecção automática para ESSA classe de
  documento (não testa nem resolve o caso de PDF escaneado em inglês,
  que continua sem exemplo real no projeto).

- [x] **Item 2 — padrão confirmado, 2ª ocorrência: legenda/rótulo de
  figura corrompido promovido a título de capítulo.** Mesmo padrão do
  livro do Gil (Fase 3, "COMO DELINEAR UM Ed tita: DE CRIQRLES").
  Estrutura idêntica confirmada com dado real: página 100% imagem (0
  texto nativo, 1 imagem cobrindo a página inteira), OCR produz ~24
  fragmentos majoritariamente ruído de 1-4 caracteres, e o único
  fragmento comprido o bastante (33 caracteres, a razão de tamanho
  2,11x contra uma mediana de página já degenerada de 28px) cruza os
  dois filtros por coincidência. A legenda REAL da figura ("Figure
  1-10. Data engineering is the fastest-growing tech occupation
  (2020)") sobrevive intacta, como texto nativo normal, na página
  SEGUINTE — o que virou título é ruído de dentro do próprio gráfico,
  não a legenda do livro. Direção recomendada (não implementada):
  suprimir detecção de título em páginas com native vazio + imagem
  cobrindo quase toda a página — sinal estrutural, não mais um limiar
  de altura/razão (que já colidiu com texto real na Fase 4.5).

- [x] **Item 3 — TOC (6 entradas, 210 páginas).** Confirmado: título do
  livro + 4 capítulos reais (todos com nome perfeito, extraído de texto
  nativo) + a legenda corrompida do item 2 = 6. Nenhum capítulo real
  ficou de fora.

- [x] **Item 4 — cabeçalho repetido em inglês: falso positivo REAL
  confirmado, com conteúdo removido do EPUB** (não apenas perda de
  recall, como nos casos já documentados em português). Só 2 clusters
  de ~90 cruzaram o limiar mínimo de 3 — forte evidência de que este
  livro genuinamente não tem cabeçalho de página repetido (2ª
  confirmação da explicação (a) já registrada como ambígua para o
  PEREIRA na Fase 4.3). Os 2 clusters que cruzaram não são cabeçalhos
  reais:
  - **Cluster 1**: 3 frases de páginas sem relação (título da capa +
    1ª frase da introdução) agrupadas só por vocabulário temático
    compartilhado. Confirmado no `.epub` gerado: a página 7 agora
    começa com uma frase CORTADA AO MEIO
    (`"extent, we're focusing on..."` — a sentença completa `"This
    book provides a snapshot of data engineering today."` sumiu).
  - **Cluster 2**: 3 legendas de figuras DIFERENTES (Figura 2-1, Figura
    2-7, e um subtítulo solto) agrupadas pela mesma razão. Confirmado:
    a legenda real da Figura 2-1 desapareceu por completo do `.epub`
    (página 53).
  - **Causa raiz identificada com precisão** (não suposição):
    `_STOPWORDS_CABECALHO` só tem stopwords em português — palavras
    funcionais do inglês (`"of"`, `"the"`, `"to"`, `"this"`, `"and"`)
    nunca são filtradas, inflando a similaridade de contenção entre
    frases sem relação real. **Confirmado por simulação direta com o
    código de produção**: removendo manualmente essas palavras do
    cálculo, o Cluster 1 cai de similaridade 0,75 para 0,667 (abaixo do
    limiar 0,70 — não teria clusterizado). O Cluster 2 cai de 0,857
    para 0,80 (continua acima do limiar — precisa de uma segunda
    correção, vocabulário genuinamente compartilhado entre legendas do
    mesmo capítulo, não resolvido só com stopwords).
  - **Direção recomendada, não implementada** (fora de escopo desta
    tarefa de inspeção): unir a lista de stopwords PT+EN (resolve o
    Cluster 1, já calibrado/confirmado); para o Cluster 2, considerar
    exigir pelo menos 1 repetição exata (não só por contenção) antes de
    promover um cluster — não calibrado, precisa de mais exemplos reais
    antes de mudar o limiar.

- [x] **Item 5 — formatação de parágrafo (recuo/zigue-zague).** Sem
  regressão — inspecionadas páginas de prosa em vários pontos do livro,
  todas com parágrafos coesos, sem zigue-zague. Segunda validação
  end-to-end real do critério de recuo nativo (`LIMIAR_RECUO_DELTA_PONTOS_NATIVO`,
  calibrado originalmente só contra o PEREIRA) contra um segundo livro
  diferente — reduz o risco residual já registrado na Fase 4.4 sem
  eliminá-lo.

- [x] **Achado incidental: capa real, 3ª validação bem-sucedida**
  (depois de Gil 208pg e PEREIRA 903pg) — proporção página (0,7727) vs.
  imagem (0,7624), diferença 1,3%, dentro da tolerância.

**Fechamento**: inspeção completa, nenhuma correção de código aplicada
(conforme escopo). 2 achados acionáveis registrados para o backlog, com
causa raiz identificada e (no caso do Cluster 1) uma correção já
simulada e confirmada, pronta para implementação numa rodada futura
dedicada — não aplicada agora por decisão explícita de manter esta
tarefa como inspeção pura.

## Robustez das heurísticas de texto para português + inglês (2026-09-04)

Ver `ARCHITECTURE.md` para o raciocínio completo, tabelas de evidência e
as duas reversões de hipótese que aconteceram durante esta tarefa. Aqui,
resumo acionável.

- [x] **Passo 0 — baseline real capturado antes de qualquer mudança**,
  não reaproveitando resultados de sessões anteriores: `.epub`/logs dos
  3 livros de calibração em português salvos com o código desta sessão,
  antes de qualquer edição. TOC de cada um confere com o histórico
  (8/26/28 entradas) — confirma que o ponto de partida desta tarefa é o
  mesmo estado já validado, não uma suposição.

- [x] **Parte 1 — stopwords PT+EN implementadas.** `_STOPWORDS_CABECALHO`
  dividida em PT (original) + EN (18 palavras funcionais comuns).
  Confirmado por execução real (não só simulação) que o Cluster 1 do FDE
  (a frase de introdução vs. o título da capa) não cluster mais —
  similaridade caiu de 0,75 para 0,667. A frase real
  `"This book provides a snapshot of data engineering today..."` deixa
  de ser removida do EPUB.

- [x] **Parte 1.2 — Cluster 2 investigado, correção NÃO implementada.**
  Similaridade continua em 0,80 mesmo com stopwords EN (a colisão é por
  vocabulário de conteúdo genuinamente compartilhado entre duas legendas
  de figura diferentes, não por palavras funcionais). Sinal candidato
  identificado (razão de tamanho entre os conjuntos de palavras: 2,0 no
  único par de truncamento OCR real já calibrado vs. 1,2 neste caso) mas
  baseado em só 1 exemplo de cada categoria — não implementado por falta
  de calibração, registrado como risco residual com direção concreta.

- [x] **Parte 1.3 — varredura do arquivo por outras heurísticas
  só-português.** Confirmado que só `_STOPWORDS_CABECALHO` tinha esse
  problema entre as funções de clustering/normalização. Achado adicional
  fora do escopo do clustering, mesmo padrão geral: `<html lang="pt-BR">`
  fixo no HTML gerado, independente do idioma real do livro — não
  corrigido nesta rodada (depende de detecção de idioma, ainda não
  implementada), registrado como risco residual.

- [x] **Parte 2 — supressão de título em página 100%-imagem: investigada
  e ABANDONADA, revertendo a recomendação da inspeção anterior.** A
  recomendação anterior (usar "página é 100% imagem" como sinal) foi
  testada contra mais dados reais e **falsificada**: a página 1 do FDE
  (a capa, onde o título é corretamente detectado) também é 100% imagem
  — cobertura de 100%, mais alta que a própria página do gráfico
  defeituoso (58%). Um segundo sinal (volume de texto/confiança OCR)
  também testado: separa o caso do FDE mas não o do Gil (a página do
  fluxograma tem volume e confiança de OCR comparáveis a uma página de
  prosa real — o Tesseract lê os rótulos do diagrama com confiança alta,
  só que sem sentido semântico). Nenhum dos 3 sinais testados
  (cobertura de imagem, volume de texto, confiança OCR) separa os 2
  casos reais conhecidos sem arriscar suprimir detecções corretas. Não
  implementada nenhuma correção — mesmo estado de antes, sem regressão.

- [x] **Validação nos 4 livros, comparando o cluster de cabeçalho real
  gerado por `primeira_passada()` (função de produção) antes/depois:**

  | Livro | Resultado |
  |---|---|
  | 80 páginas | zero diferença |
  | 208 páginas | zero diferença |
  | 903 páginas (PEREIRA) | 1 cluster dividido em 2, sem efeito no resultado final (os dois ficam abaixo do limiar antes e depois) — divisão é uma correção colateral bem-vinda (dois nomes de periódico diferentes que não deveriam ter sido agrupados) |
  | FDE (210p, inglês) | Cluster 1 resolvido (confirmado); Cluster 2 mantido (esperado); **1 NOVO falso positivo encontrado** |

  **Pergunta que o usuário fez antes de aceitar a correção como
  fechada, respondida com o dado que já tinha sido coletado**: o
  mecanismo do novo falso positivo (remover palavra compartilhada pode
  AUMENTAR a razão de contenção) foi testado nos 3 livros PT também,
  não só observado por acaso no FDE. O diff de 80p/208p é do arquivo de
  clusters INTEIRO (toda linha, não só as marcadas como cabeçalho) —
  "zero diferença" prova que nenhuma linha desses 2 livros contém
  nenhum dos 18 tokens em inglês agora tratados como stopword, então o
  mecanismo não teve nenhuma pré-condição para disparar ali. No
  PEREIRA, a pré-condição ocorreu 1 vez (citação de periódico em
  inglês na bibliografia) e o efeito foi benigno (separou dois
  clusters que não deveriam estar juntos, sem tocar o único cabeçalho
  real já marcado). **Risco residual real, não uma prova geral**: um
  livro em português com mais palavras em inglês espalhadas pelo corpo
  do texto (não só isoladas na bibliografia, como PEREIRA) teria mais
  chance de reproduzir o mesmo padrão do FDE — testado contra 3 livros
  reais sem reprodução, não descartado como impossível. Ver
  `ARCHITECTURE.md` para o detalhamento completo desta resposta.

  **Achado real, não hipotético**: a correção de stopwords introduziu um
  novo falso positivo no FDE — o cluster "oreilly" (antes `contagem=2`,
  sem efeito) cresceu para `contagem=3`, agora removendo um cabeçalho de
  seção real (`"What Is the Data Engineering Lifecycle?"`, página 52) do
  EPUB. Mecanismo confirmado por cálculo direto: remover uma palavra
  presente nos dois lados de uma comparação de contenção pode aumentar a
  razão, não só diminuir, se o denominador (`min(|A|,|B|)`) encolher
  proporcionalmente mais que o numerador. Similaridade deste par foi de
  0,667 (sem stopwords EN) para 0,75 (com stopwords EN) — o oposto do
  efeito pretendido, para este par específico.

  **Decisão**: correção de stopwords MANTIDA, efeito colateral
  documentado, não escondido. O bug original (stopwords só-português)
  afeta qualquer texto em inglês, não só os 2 casos já conhecidos —
  reverter deixaria o problema estrutural sem solução por causa de 1
  caso-limite novo. Resultado líquido: de 2 falsos positivos confirmados
  antes desta rodada, para 2 depois (1 corrigido, 1 mantido por falta de
  calibração, 1 novo encontrado) — mas o bug estrutural que motivou a
  tarefa está corrigido, que era o objetivo real.

**Fechamento**: tarefa concluída com 1 correção implementada e validada
(stopwords PT+EN), 1 correção investigada e conscientemente não
implementada por falta de calibração (Cluster 2), 1 recomendação
anterior revertida com evidência real (supressão de título por sinal
estrutural — Parte 2), e 1 efeito colateral real da própria correção
implementada encontrado e documentado, não escondido. Duas reversões de
hipótese num único episódio de trabalho — candidatas a registro em
`TRACE.md`, levadas para confirmação do usuário antes de editar esse
arquivo, conforme pedido.

## Fase 4.7: encerramento robusto do sidecar ao fechar o app / botão de cancelar (2026-09-04)

Item de infraestrutura de processo (Tauri/Rust), desacoplado das 4
rodadas anteriores de calibração de OCR/texto — sem tocar nenhuma
heurística já validada.

**Causa raiz confirmada com teste real** (não assumida): isolado o
binário PyInstaller `foliant-core` fora do Tauri, `ps -o pid,ppid,command`
revelou 3 níveis de processo (stub do bootloader `--onefile` → processo
Python real forkado por ele → `tesseract`, subprocess do `pytesseract`).
Lendo o código-fonte de `tauri-plugin-shell 2.3.6` (versão exata pinada
em `Cargo.lock`), `CommandChild::kill()` manda `SIGKILL` só no pid do
`Child` que ele guarda — isto é, só o stub (nível 1). O processo Python
real e o `tesseract` nunca recebiam sinal nenhum, ficavam órfãos
(reparented pro `launchd`), e continuavam rodando — exatamente o sintoma
relatado (`foliant-core` vivo minutos depois do app fechado). Ver
`ARCHITECTURE.md`, Fase 4.7, para a árvore de processos completa e a
citação do código-fonte do plugin.

**Mecanismo escolhido**: rastreamento de árvore de PIDs via `ps`/`kill`
(BFS a partir do pid do stub, achando todos os descendentes em qualquer
profundidade), não grupo de processos — porque o sidecar herda o mesmo
grupo do próprio app Tauri (sem `setsid`), e um `killpg` mataria o app
junto. `SIGTERM` em toda a árvore primeiro, espera 1,5s, `SIGKILL` em
quem sobreviver. Nenhuma dependência nova no `Cargo.toml` — `ps`/`kill`
já eram a ferramenta usada em toda a validação manual deste projeto,
só automatizada.

**`foliant.py`**: handler de `SIGTERM` que levanta `KeyboardInterrupt`,
deixando a exceção se propagar através do `with
tempfile.TemporaryDirectory()` (que roda a limpeza durante o unwind)
antes de ser capturada e imprimir `CANCELADO: conversão interrompida.`
— sem isso, o handler default do Python mataria o processo sem limpar o
cache OCR/HTML intermediário. **Testado isoladamente com dado real**:
SIGTERM mandado direto pro pid do processo Python real com uma página de
OCR em andamento — morre e limpa em **~600ms** (medido por polling a
cada 300ms), bem dentro da margem de 1,5s escolhida para o `SIGKILL` de
segurança do lado Rust.

**Validação end-to-end — dado real, `.app` de produção, livro de 208
páginas** (`samples/livro_completo_208pg.pdf`), via clique real na UI
(automação de acessibilidade `osascript`/System Events, estável desta
vez contra o binário sem assinatura — diferente do artefato de TCC que
bloqueou a mesma técnica nas Fases 4.1/4.2):

| Cenário | `ps aux` (`foliant-core`+`tesseract`) | `.epub` parcial | Mensagem na UI |
|---|---|---|---|
| Botão "Cancelar" durante OCR | zero processos (checado a cada 500ms até 3s) | nenhum | "Cancelando…" → "CANCELADO: conversão interrompida." → "Cancelado pelo usuário." |
| Fechar a janela durante OCR | zero processos, incluindo o próprio app | nenhum | app encerrado |

**Não-regressão confirmada com dado real**: mesmo `.app`, conversão
completa do livro de 80 páginas sem cancelamento, do início ao fim, via
clique real na UI — `.epub` de 810KB gerado, UI mostra "Processo
concluído com sucesso." (distinto de "Cancelado", confirmando que o novo
rastreamento de pid não interfere no fluxo normal).

**Risco residual aceito, documentado, não corrigido nesta fase**: se o
processo Python real não reagir ao `SIGTERM` dentro dos 1,5s de margem
(não observado nos testes reais desta fase), o stub do bootloader
PyInstaller pode ser morto por `SIGKILL` antes de limpar seu próprio
diretório de extração `_MEI*` — deixando esse diretório órfão (limitação
do bootloader compilado do PyInstaller, fora do controle deste código;
não afeta o objetivo principal, que é `foliant-core`/`tesseract` zerados
em `ps aux`, cumprido nos dois cenários testados). **Perguntado
explicitamente se isso pode acumular**: confirmado que sim, sem limite —
é limitação conhecida do PyInstaller (issues #902/#2379/#5518, nunca
corrigidas, sem limpeza de sobras de execuções anteriores no próximo
start) e verificado nesta máquina que a limpeza diária do macOS
(`periodic`) só cobre `/tmp`, não a pasta real usada
(`tempfile.gettempdir()` → `/var/folders/.../T`) — arquivos de mais de um
mês atrás confirmados ainda presentes lá. Nota visível adicionada ao
`README.md` ("Limitações conhecidas") para o usuário final, já que o
sintoma (disco cheio meses depois) não teria relação óbvia com a causa.
Ver `ARCHITECTURE.md`, Fase 4.7, para o detalhe completo e as fontes.

**Fora de escopo, não tocado**: heurísticas de OCR/texto (Cluster 2,
lista numerada, detecção de idioma) e barra de progresso/detecção de
idioma da Fase 4.6 Parte 2 — seguem no backlog.

## Fase 4.8: correção do rótulo travado da fase HTML + limpeza do painel ao concluir (2026-09-04)

Só frontend (`desktop/src/main.js`, `index.html`, `styles.css`).
`foliant.py` não tocado.

**Bug 1 — rótulo "processando…" travado na fase "Montagem do HTML"**:
causa raiz identificada em `atualizarProgresso()`
([main.js:47-55](desktop/src/main.js#L47-L55) antes da correção) — o
laço que marca fases anteriores como `concluida` (disparado quando a
fase seguinte começa) atualizava a barra para 100% e a classe CSS, mas
nunca o texto do contador. Fases com contador granular (`ocr`, `epub`)
não sofriam disso porque elas mesmas já escrevem seu texto final
("210/210", "100%") antes de a próxima fase começar; só "html" — que
nunca emite um evento de conclusão próprio (ver
[foliant.py:883](foliant.py#L883), único `PROGRESS` da fase, sempre
`atual:0,total:0`) — dependia inteiramente desse laço, e ficava com o
texto "processando…" gravado por último. **Correção**: no mesmo laço,
se o texto atual do contador for exatamente "processando…", substituído
por "concluído"; contadores com valor final (que não é "processando…")
não são tocados.

**Melhoria 2 — colapsar o log ao concluir com sucesso**: pedido do
usuário para não poluir a tela no caminho feliz, mantendo o log
acessível para depuração. **Decisão de UX**: usado `<details>`/`<summary>`
nativo do HTML (`#log-detalhes`) em vez de escondê-lo de vez — nenhum JS
extra necessário para o toggle, e o log nunca é destruído/removido do
DOM. Reaproveitado o mesmo evento que a UI já tinha para detectar
conclusão (`command.on("close", ...)`, ver
[main.js:146](desktop/src/main.js#L146) antes da correção) — nenhum
mecanismo novo de detecção. Regra: `details.open = false` (recolhe) só
no ramo de sucesso (`dados.code === 0` e não cancelado); nos ramos de
erro e de cancelamento, o log permanece aberto, porque nesses casos ele
é informação primária, não secundária. Um banner verde (`#sucesso`)
aparece no lugar mostrando o caminho salvo (lido direto do campo "Salvar
EPUB como" já presente na UI, sem novo estado). Nova conversão
(`submit` do formulário) reabre o log e esconde o banner
incondicionalmente, evitando que a UI fique presa no estado "concluído"
da execução anterior.

**Atalho para abrir a pasta de destino no Finder — avaliado e descartado
nesta fase**: `tauri-plugin-opener` já está registrado no lado Rust
(`Cargo.toml` + `lib.rs` + capability `opener:default`), mas o binding
JS (`@tauri-apps/plugin-opener`) não está instalado em
`desktop/package.json` — adicionar essa dependência (mudança de build,
não só de UI) ficou fora do escopo contido desta fase. Registrado como
possível melhoria futura, não implementada.

**Validação — dado real, não suposição**: ambiente sandboxed sem acesso
de Accessibility/tela (mesma limitação já documentada na Fase 4.1/4.2
para automação via `osascript`), então a validação visual não foi feita
contra a janela nativa do `.app`. Em vez disso, `desktop/src/main.js` e
`index.html` **reais** (sem cópia nem reimplementação) foram servidos
por um HTTP server local e carregados no Chrome instalado na máquina via
Playwright headless, com um import map trocando só os três módulos do
Tauri (`@tauri-apps/plugin-shell`, `@tauri-apps/plugin-dialog`,
`@tauri-apps/api/core`) por stubs que permitem injetar as mesmas linhas
`PROGRESS:` que `foliant.py` realmente emite
([foliant.py:809,836,883,963,976,980](foliant.py#L809)) e simular
`close`/`cancelar`. Cenários confirmados com screenshot + asserção de
DOM:
- Fase "Montagem do HTML" mostra `.fase-contador` = "processando…"
  enquanto ativa, e `"concluído"` (com classe `.concluida`/check verde)
  assim que a fase "epub" começa — bug original reproduzido antes da
  correção e confirmado corrigido depois.
- Conclusão com sucesso: `#log-detalhes.open === false` e banner
  `#sucesso` visível com o caminho exato de "Salvar EPUB em".
- Cancelamento (`cancelar_conversao` mockado): log permanece
  `open === true`, banner de sucesso não aparece.
- Erro real (`close` com código 1, sem cancelamento): log permanece
  `open === true`, banner de sucesso não aparece.
- Segunda conversão iniciada logo em seguida (mesmo processo/sessão):
  log volta a `open === true` e banner volta a `hidden` antes de
  qualquer nova linha de progresso chegar.

**Risco residual**: o cenário acima cobre a lógica real de
`atualizarProgresso`/`processarLinha`/handlers de `close` byte a byte,
mas não passa pelo runtime real do Tauri (IPC nativo, timing real do
sidecar) nem pela renderização da janela nativa do WebView do macOS —
teste manual rápido do usuário (rodar uma conversão real pelo `.app`)
recomendado para fechar o critério de aceite com 100% de confiança,
mesmo sem indício de que o runtime real se comporte diferente aqui (a
lógica testada é puramente DOM/JS, sem dependência de API nativa do
Tauri além das três importadas e já mockadas).

## Fase 4.9: updater automático (tauri-plugin-updater) (2026-09-04)

Detalhe completo do mecanismo e das duas correções de premissa
(GitHub Releases é canal novo, não reaproveitado; assinatura ad-hoc
avaliada e descartada para o aviso do Gatekeeper) em `ARCHITECTURE.md`.
Aqui, a evidência real de validação — 100% local, nenhum Release
publicado de verdade.

**Ambiente**: mesma limitação de Accessibility documentada nas Fases
4.1/4.2/4.8 (automação de clique em app não assinado é morta pelo
`tccd`). Contornada aqui porque a checagem de update roda automaticamente
ao abrir o app, sem exigir nenhum clique — bastou lançar o binário e
observar `Info.plist`/pid/`ps aux`.

**Build e assinatura**: par de chaves gerado com `tauri signer generate`
em `~/.tauri/foliant-updater.key` (fora do repo, senha aleatória gerada
com `openssl rand -base64 32`, nunca persistida em nenhum arquivo do
projeto). Versão real do projeto atualizada para `0.2.0` (primeira com
updater embutido) em `Cargo.toml`, `tauri.conf.json` e `package.json`.

**Achado durante a implementação, não previsto na investigação inicial**:
`tauri-plugin-updater` rejeita endpoints não-HTTPS na própria
deserialização da config (`validate_endpoints` em `config.rs`), até em
build local — precisou da flag `dangerousInsecureTransportProtocol:
true`, aplicada **só** via `tauri build --config` nos builds de teste
(nunca no `tauri.conf.json` commitado, que usa o endpoint HTTPS real do
GitHub Releases).

**Teste end-to-end 1 — atualização válida detectada, baixada, instalada
e relançada** (dado real, binário de produção, não script de pesquisa):

1. Build real assinado da v0.2.0 (`--config` só trocando o endpoint para
   `http://localhost:8791/latest.json`), copiado para fora do projeto e
   executado dali — nunca sobrescreveu o `Foliant.app` real do usuário em
   `/Applications`.
2. Build throwaway da v0.2.1 (mesma técnica, `createUpdaterArtifacts`
   gerando `Foliant.app.tar.gz` + `.sig` reais).
3. `latest.json` real (schema oficial: `version`, `notes`, `pub_date`,
   `platforms."darwin-x86_64".{url,signature}`) servido por
   `python3 -m http.server` local junto do `.tar.gz`.
4. Lançado o binário da v0.2.0 diretamente (`Contents/MacOS/foliant-desktop`).
   Confirmado por log do servidor HTTP que o app buscou `GET
   /latest.json` e `GET /Foliant.app.tar.gz` sozinho, sem clique nenhum.
5. **Resultado real, checado em disco/processo, não assumido**: pid do
   processo mudou de `56865` para `57288` (relançamento de fato
   ocorreu) e `plutil -p Info.plist` no mesmo caminho passou a reportar
   `CFBundleShortVersionString: 0.2.1` — prova de
   check→download→verificação de assinatura→instalação→relançamento
   ponta a ponta, sem nenhuma automação de UI.

**Teste end-to-end 2 — assinatura inválida rejeitada, não instalada em
silêncio**:

`latest.json` alterado para anunciar uma versão fictícia mais nova
(`0.2.2`) com o campo `signature` corrompido de propósito (bytes
trocados por um preenchimento inválido). App real (agora na v0.2.1)
relançado contra esse manifesto forjado: log do servidor confirma que
`GET /latest.json` e `GET /Foliant.app.tar.gz` foram buscados (o plugin
baixa antes de verificar), mas **o pid do processo não mudou** e
`Info.plist` continuou reportando `0.2.1` — a atualização foi
rejeitada e não instalada, confirmando que a verificação de assinatura
é real, não decorativa. (Não foi possível capturar o texto exato do
erro no console nativo — console da WebView não é redirecionado para o
stdout do processo neste build; a prova de rejeição usada foi o estado
inalterado do binário em disco, evidência igualmente objetiva.)

**Teste 3 — conversão em andamento não é interrompida por uma
atualização detectada durante o processamento** (Ressalva 1 da
aprovação do plano): validado via a mesma técnica de Chrome headless +
Playwright com módulos Tauri mockados já usada e documentada na Fase
4.8 — aqui reaproveitada especificamente para a lógica de orquestração
JS (`conversaoEmAndamento`/`atualizacaoPendente` em `main.js`), já que a
mecânica real de assinatura/instalação foi coberta pelos testes 1 e 2
acima contra o binário de verdade. Cenário: conversão mock iniciada,
atualização "disponível" armada e botão "Verificar atualizações"
clicado durante a conversão — `downloadAndInstall()` não é chamado
enquanto a conversão está ativa (log confirma "será instalada ao final
da conversão"); ao emitir o evento de conclusão da conversão (`close`,
código 0), a atualização pendente é aplicada automaticamente e
`relaunch()` é chamado. Como o código nunca toca o processo do sidecar
nesse caminho (só adia a chamada ao updater), não há risco de
processos órfãos — a garantia de encerramento limpo da Fase 4.7
permanece intacta porque este código simplesmente não a exercita.

**Teste 4 — quarentena do Gatekeeper após update automático** (Ressalva
2 da aprovação do plano, resultado real, não suposição de mercado):
depois do update real do Teste 1, `xattr -r` no `.app` resultante e no
binário `foliant-core` embutido não retornou **nenhum** atributo
estendido — sem `com.apple.quarantine`. Consistente com o mecanismo
real do macOS (quarentena é aplicada por apps "quarantine-aware" como
Safari/Finder no momento do download pelo usuário, não pelo kernel a
qualquer tráfego de rede) — um downloader interno via `reqwest` não
aciona esse atributo. **Conclusão registrada como fato observado, não
extrapolação**: atualizações futuras aplicadas pelo próprio updater não
devem reacender o aviso do Gatekeeper.

**Teste 5 — smoke test pós-update**: com o `.app` já trocado pelo
updater no Teste 1 (conteúdo genuíno extraído do `.tar.gz` baixado, não
copiado manualmente), rodada uma conversão real completa do
`samples/001-080.pdf` invocando o binário do sidecar embutido
diretamente (mesma técnica de invocação direta usada desde a Fase 4
para contornar a limitação de Accessibility). Resultado: EPUB de 810KB
gerado com sucesso, TOC com 8 entradas detectado, sem nenhum erro —
confirma que o app segue funcional depois de ser trocado pelo
mecanismo de auto-update.

**Risco residual aceito, documentado**: nenhum teste passou pelo clique
real no botão "Verificar atualizações" da UI nem confirmou visualmente
a janela (mesma limitação de Accessibility já aceita nas Fases
4.1/4.2/4.8) — a checagem automática ao abrir cobriu o caminho principal
sem precisar de clique, e a lógica do botão manual é idêntica à função
`verificarAtualizacao()` já validada (só troca o gatilho de "carregar a
página" para "clique"), então o risco remanescente é considerado baixo.
Recomendado um teste manual rápido do usuário (clicar o botão de verdade
uma vez) para fechar 100% do critério de aceite.

**Fora de escopo, não tocado**: automação GitHub Actions para assinar
builds a cada tag; publicação de um Release real no GitHub; qualquer
mudança em `foliant.py` ou heurísticas de OCR/texto.

## Fase 4.10: incidente — app instalado nunca recebeu a Fase 4.8 (2026-09-05)

**Sintoma reportado pelo usuário**: rodando o `Foliant.app` instalado até
o fim com sucesso (livro PEREIRA, 903 páginas), os dois bugs que a Fase
4.8 deveria ter corrigido reapareceram — rótulo "Montagem do HTML"
travado em "processando…" e painel de log sem colapsar/banner de
sucesso ao concluir.

**Causa raiz confirmada com evidência, não suposição**:

1. `desktop/src/main.js` e `index.html` no repositório **já continham**
   as duas correções da Fase 4.8 (`logDetalhesEl`/`sucessoEl`, texto
   `"concluído"` condicional) — confirmado por grep antes de qualquer
   outra hipótese.
2. `git log -1 -- desktop/src/main.js desktop/src/index.html` apontou
   para o commit da **Fase 4.6** (`eb5ec2f`, 2026-09-04 19:26) — as
   correções da Fase 4.8/4.9 nunca foram commitadas (ninguém pediu, e a
   política do projeto é só commitar sob pedido explícito), ficaram
   como mudanças não commitadas na árvore de trabalho.
3. `/Applications/Foliant.app/Contents/MacOS/foliant-desktop` tinha
   timestamp de **2026-09-04 20:00:31** — anterior a `desktop/dist/`
   (2026-09-04 22:03:59, gerado durante os builds reais da Fase 4.9, já
   contendo as correções da Fase 4.8: confirmado por
   `grep -c "sucesso\|<details"` e `grep -c "logDetalhesEl\|sucessoEl"`
   no `dist/` gerado). Ou seja: os múltiplos builds reais feitos durante
   a validação da Fase 4.9 (que já incluíam a Fase 4.8, testados e
   confirmados funcionando via harness headless) foram todos copiados
   para diretórios de scratchpad para teste — **nenhum foi copiado para
   `/Applications`**. O app instalado na máquina do usuário nunca foi
   trocado desde antes da Fase 4.8 existir.
4. **Sem duplicidade de instalação**: `mdfind`/`find` encontraram só
   `/Applications/Foliant.app` (o caminho espelhado em
   `/System/Volumes/Data/Applications/` é o mesmo arquivo via firmlink
   do APFS, mesmo inode confirmado com `stat -f "%d %i"` — não é uma
   segunda cópia real).

**Não é regressão de código** — é falha do ciclo de deploy manual: o
código correto existia, foi validado (headless na Fase 4.8, binário real
na Fase 4.9), mas nunca chegou ao `.app` que o usuário efetivamente
abre.

**Item investigado explicitamente — alcance do updater automático sobre
mudanças de frontend**: `createUpdaterArtifacts: true` empacota o
`.app.tar.gz` com o bundle **inteiro**, incluindo o binário
`foliant-desktop` que já tem os assets de frontend (`dist/`) embutidos
em tempo de build pelo próprio Tauri — não é algo carregado à parte em
runtime. Ou seja, tecnicamente, se um Release real já tivesse sido
publicado no GitHub, o updater **teria** coberto essa mudança visual
também (ele substitui o app inteiro, não só o "sidecar"). Mas isso é
irrelevante neste incidente específico: **nenhum Release foi publicado
ainda** (confirmado no fechamento da própria Fase 4.9), então o updater
automático não tinha absolutamente nenhum efeito prático nesta máquina —
toda atualização, visual ou de backend, continuava dependendo 100% do
ciclo de rebuild manual completo, exatamente como documentado desde a
Fase 4.3. Isso não muda até o primeiro Release ser publicado de verdade.

**Correção aplicada**:
1. Build de produção limpo, sem nenhum `--config` de teste (diferente
   dos builds da Fase 4.9, que usavam endpoint local +
   `dangerousInsecureTransportProtocol` só para validação) —
   `tauri.conf.json` como está commitado na árvore de trabalho, endpoint
   HTTPS real do GitHub Releases, versão `0.2.0`.
2. **Verificado antes de instalar** (mesmo passo intermediário já usado
   com sucesso na Fase 4.4): `dist/index.html` recém-gerado contém as
   strings da Fase 4.8; bundle final em
   `target/release/bundle/macos/Foliant.app` confere versão `0.2.0`.
3. `/Applications/Foliant.app` antigo removido (`rm -rf`, não
   sobrescrito) e o novo copiado no lugar, com autorização explícita do
   usuário antes de qualquer ação destrutiva em `/Applications`.
4. Revalidado com o mesmo harness headless da Fase 4.8/4.9 (Chrome +
   Playwright servindo o `desktop/src/` real, módulos Tauri mockados)
   contra o código-fonte atual: todas as 13 asserções da Fase 4.8
   (rótulo final da fase HTML, colapso do log, banner de sucesso,
   comportamento de erro/cancelamento, reset em nova conversão)
   passaram de novo, confirmando que a lógica em si nunca teve
   regressão — só o binário instalado estava desatualizado.
5. Smoke test real no `.app` recém-instalado: conversão completa do
   `samples/001-080.pdf` via `/Applications/Foliant.app/Contents/MacOS/foliant-core`
   invocado diretamente (mesma técnica usada desde a Fase 4 para
   contornar a limitação de Accessibility deste ambiente sandboxed) —
   EPUB de 810.427 bytes gerado com sucesso (TOC com 8 entradas
   detectado, sem erros), confirmando que o `.app` recém-instalado
   segue funcional depois da troca.

**Lição registrada para não repetir uma terceira vez**: toda tarefa
futura que altere `desktop/src/*` e for validada só via harness
headless (por causa da limitação de Accessibility) deve terminar com um
checklist explícito antes de pedir validação visual ao usuário: (a) o
`dist/` mais recente contém as strings da mudança? (b) o
`/Applications/Foliant.app` instalado tem timestamp **posterior** ao
commit/mudança mais recente em `desktop/src/`? Se a resposta a (b) for
não, o app precisa ser reconstruído e reinstalado antes de qualquer
pedido de validação ao usuário — não depois.

## Fase 4.11: correções de UI + feedback do updater + ações pós-conversão + drag-and-drop (2026-09-05)

Só frontend (`desktop/src/*`, `desktop/src-tauri/capabilities/default.json`,
`desktop/package.json`). `foliant.py` e qualquer heurística de
OCR/idioma não tocados — confirmado por `git diff --stat` antes de
fechar a fase.

**Passo 0 (obrigatório pelo meta-prompt) — confirmar que os bugs
reportados ainda existiam no app atual antes de investigar causa
raiz**: reproduzido via o mesmo harness headless (Chrome + Playwright
servindo `desktop/src/` real, módulos Tauri mockados) já usado nas
Fases 4.8/4.9/4.10, contra o código-fonte tal como estava no início
desta tarefa (já incluindo a correção de deploy da Fase 4.10). Ambos os
itens reproduziram:
- **Item 1**: `.row` (linha que agrupa input + botão "Selecionar…", e a
  linha "Converter"/"Cancelar") não tinha `gap` nenhum — elementos
  ficavam colados, sem separação visual, e o input (com `flex: 1` mas
  sem `min-width: 0`) não tinha regra de truncamento, deixando caminhos
  longos (ex.: `livro_completo_208pg.pdf`) sem elipse.
- **Item 2**: clicar em "Verificar atualizações" sem nenhuma atualização
  disponível não produzia nenhum texto/log visível (confirmado por
  captura do estado do DOM antes de qualquer correção).

**Item 1 — correção**: `gap: 0.6em` adicionado a `.row` (afeta as duas
ocorrências — campos de arquivo e botões Converter/Cancelar — sem
duplicar CSS); `form .row input` ganhou `min-width: 0` +
`overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`
para truncar caminhos longos com reticências em vez de forçar o layout;
`.row button` ganhou `flex-shrink: 0` para o botão nunca perder texto
legível em favor do input. Solução responsiva (regras de `flex`/`gap`),
não valores fixos — não deve quebrar de novo na próxima adição de
elemento à `.row`, ao contrário do que causou o bug original.

**Item 2 — correção**: `verificarAtualizacao(manual = false)` agora
recebe uma flag. Checagem automática ao abrir o app continua
**silenciosa** em caso de "sem atualização" ou erro (mesmo padrão de
apps com auto-update em background — não interromper o usuário toda vez
que abre o app à toa); só mostra algo quando encontra uma atualização de
verdade (fluxo já existente da Fase 4.9). Checagem manual (clique no
botão) sempre mostra uma mensagem curta perto do botão
(`#status-atualizacao`, some sozinha depois de 5s): "Você já está na
versão mais recente." (sem update) ou "Não foi possível verificar
atualizações agora." (qualquer erro — cobre tanto a falta de Release
publicado, que hoje faz o endpoint responder 404, quanto falha de rede
real). O erro técnico bruto (`404`, mensagem do `reqwest`, etc.) nunca
aparece pro usuário — vai só para o log detalhado (`log()`), pra
depuração.

**Item 3 — correção**: instalado `@tauri-apps/plugin-opener` (o binding
JS que faltava, pendência registrada na Fase 4.8 — o lado Rust já
estava registrado desde então). Adicionada a permissão
`opener:allow-open-path` em `capabilities/default.json` (sem escopo de
caminho — ver justificativa em `ARCHITECTURE.md`: o destino é
inteiramente escolhido pelo usuário via diálogo de salvar, mesmo nível
de confiança já concedido nesse fluxo). `opener:default` já cobria
`allow-reveal-item-in-dir`, então nenhuma permissão nova foi necessária
para "Ver na Pasta". Banner de sucesso ganhou dois botões: "Abrir EPUB"
(`openPath`) e "Ver na Pasta" (`revealItemInDir`), ambos com captura de
erro própria (loga no log detalhado, não quebra a UI).

**Item 4 — correção**: `getCurrentWebview().onDragDropEvent()` de
`@tauri-apps/api/webview` (já parte do pacote `@tauri-apps/api` já
instalado — nenhuma dependência nova) — usado em vez dos eventos HTML5
de drag/drop porque o Tauri intercepta o drop no nível do webview
(`dragDropEnabled` é `true` por padrão), então os eventos nativos do
navegador nunca disparariam. Implementado no nível da janela inteira
(mais natural para uma janela pequena e de propósito único, decidido em
vez de restringir a uma única `<label>`), com destaque visual (borda
tracejada azul) durante o "over" via uma classe no `<body>`. No "drop",
o primeiro caminho é validado por extensão `.pdf` (case-insensitive);
se não for PDF, rejeitado com mensagem clara no log
("Arquivo solto não é um PDF, ignorado: ...") — nunca falha
silenciosamente nem aceita o arquivo errado. PDF válido reaproveita a
mesma função (`definirPdfSelecionado`) já usada pelo botão
"Selecionar…", preenchendo também o campo de saída automaticamente
quando vazio.

**Item 5 — correção**: rótulo trocado de "Idioma (código Tesseract)"
para "Idioma do documento", com um texto de ajuda discreto abaixo
("Usado só para reconhecer texto em páginas escaneadas (OCR).").
Confirmado que o valor padrão (`"por"`) e o comportamento de OCR não
mudaram — mudança de rótulo/apresentação apenas, detecção automática de
idioma continua no backlog (Fase 4.6 Parte 2), não antecipada aqui.

**Validação — evidência real, não suposição**:
- Harness headless (mesma técnica das Fases 4.8/4.9/4.10, com stubs
  novos para `@tauri-apps/plugin-opener` e `@tauri-apps/api/webview`
  adicionados ao import map de teste): 20 asserções cobrindo os 5 itens,
  todas passando — rótulo/ajuda do idioma, ausência de sobreposição
  (`getBoundingClientRect` comparando bordas dos elementos adjacentes,
  não só inspeção visual), gap real via `getComputedStyle`, as 3
  mensagens de feedback do updater (sucesso mostra só o log, "sem
  update" e "erro" mostram a mensagem amigável certa, erro técnico vai
  pro log, checagem automática continua silenciosa), os dois botões do
  banner de sucesso chamando `openPath`/`revealItemInDir` com o caminho
  certo, e o fluxo completo de drag-and-drop (feedback visual liga/
  desliga, PDV válido preenche os campos, arquivo inválido rejeitado com
  mensagem, sem preencher nada). Suite de regressão completa da Fase
  4.8 (13 asserções) e do guard da Fase 4.9 (5 asserções) reexecutadas
  sem nenhuma quebra.
- **Build real de produção** (mesmo processo documentado desde a Fase
  4.10 — sem `--config` de teste, versão `0.2.0` como está no
  `tauri.conf.json` commitado, assinado com a chave real do updater),
  **verificado em `dist/` antes de instalar** (grep confirmando as
  strings de cada um dos 5 itens no bundle gerado) — aplicando a lição
  de processo registrada na própria Fase 4.10, não repetindo o mesmo
  erro pela terceira vez.
- `/Applications/Foliant.app` antigo removido e o novo instalado, com
  autorização explícita do usuário antes da ação destrutiva.
  Confirmado por timestamp que o binário instalado é posterior a todas
  as mudanças desta fase.
- Smoke test real: conversão completa do `samples/001-080.pdf` via
  `/Applications/Foliant.app/Contents/MacOS/foliant-core` invocado
  diretamente (mesma técnica usada desde a Fase 4 para contornar a
  limitação de Accessibility deste ambiente) — EPUB de 810.287 bytes
  gerado com sucesso (TOC com 8 entradas, sem erros), confirmando que o
  app recém-instalado continua funcional depois dos 5 itens desta fase.

**Risco residual aceito**: nenhum item foi clicado de verdade na janela
nativa (mesma limitação de Accessibility de sempre) — a cobertura via
harness headless testa a lógica real do DOM/JS byte a byte (mesmo
`main.js`/`index.html`/`styles.css` do bundle), mas não passa pelo
runtime nativo do Tauri (diálogos de arquivo reais, WebView do macOS,
drag-and-drop do Finder de verdade). Recomendado um teste manual rápido
do usuário no app real para fechar 100% do critério de aceite —
especialmente o drag-and-drop, que depende do comportamento real do
Finder soltando um arquivo na janela, não simulável fielmente fora do
runtime nativo.

**Fora de escopo, não tocado**: detecção automática de idioma PT/EN
(Fase 4.6 Parte 2); envio do EPUB por e-mail; redesenho visual mais
amplo inspirado em wireframe.

## Fase 4.12: correção — "Abrir EPUB" (permissão) e aviso de rejeição do drag-and-drop (2026-09-05)

**Dois bugs reais encontrados na validação manual da Fase 4.11, que o
harness headless não capturou** — confirma na prática o próprio risco
residual que a Fase 4.11 já tinha registrado (validação headless não
substitui interação real para tudo que envolve permissões do SO e
arquivos de verdade):

1. `"Abrir EPUB"` falhava com `Not allowed to open path`. "Ver na
   Pasta" funcionava com o mesmo arquivo.
2. Drag-and-drop de arquivo não-PDF era rejeitado corretamente, mas sem
   nenhum aviso fora do log colapsado.

**Causa raiz real do Item 1 (código-fonte do plugin, não suposição)**:
lido `tauri-plugin-opener-2.5.5/src/commands.rs` — o comando IPC
`open_path` (usado por `openPath()` da JS) recebe `command_scope` e
`global_scope` e chama `scope.is_path_allowed(...)` antes de executar,
que por sua vez constrói um `tauri::fs::Scope` só a partir das entradas
de `allow`/`deny` declaradas na capability para `opener:allow-open-path`
— sem nenhuma entrada de escopo (só a permissão "pode chamar o
comando", sem `"allow": [...]`), a lista fica vazia e **tudo** é negado.
Já `reveal_item_in_dir` (usado por "Ver na Pasta") **não recebe
parâmetro de escopo nenhum** na assinatura do comando — não há
checagem de escopo nessa API do plugin, só a permissão de chamar o
comando, por isso funcionava sem nenhuma configuração extra. Essa
assimetria entre os dois comandos do mesmo plugin era a causa real —
não falta de permissão "geral" do opener.

Investigado o padrão recomendado para "caminho escolhido livremente
pelo usuário em runtime, não fixo em tempo de build": a extensão
automática de escopo que o `@tauri-apps/plugin-dialog` faz ao usuário
escolher um caminho **só se aplica ao escopo do `@tauri-apps/plugin-fs`
e do asset protocol**, não ao escopo próprio (independente) do plugin
`opener` — confirmado lendo o código-fonte do `Scope` do opener, que só
lê as entradas declaradas na sua própria capability, nunca o estado de
escopo de outro plugin. E o `tauri-plugin-opener` não expõe nenhuma API
Rust pública para estender seu próprio escopo em runtime (diferente do
`fs` plugin, que expõe `app.fs_scope().allow_file(...)`). Ou seja: não
existe um mecanismo "escopo dinâmico por caminho escolhido pelo
usuário" pronto para o `opener` nesta versão — as opções reais eram (a)
um glob estático amplo o bastante para cobrir qualquer pasta do sistema
(ex.: `"**"`), abrindo mão de fato do princípio de permissão mínima já
seguido no resto do projeto, ou (b) um comando Rust próprio que evita a
checagem de escopo do plugin por completo, chamando a API interna do
`Opener` diretamente (`app.opener().open_path(...)`, que não passa pelo
crivo de `is_path_allowed` — esse crivo só existe no wrapper
`#[tauri::command]` exposto para a IPC da JS, não na struct `Opener`
em si).

**Correção real aplicada (opção b)**: dois comandos novos em `lib.rs`
— `registrar_epub_gerado(caminho)` (chamado pela JS assim que uma
conversão termina com sucesso, guarda o caminho num
`Mutex<Option<PathBuf>>` de estado do app) e `abrir_epub_gerado()` (sem
receber caminho nenhum da JS — lê o estado registrado e chama
`app.opener().open_path(...)` direto). O botão "Abrir EPUB" na UI agora
chama `invoke("abrir_epub_gerado")`, não mais `openPath()` do plugin.
Resultado: **escopo real mínimo** — só é possível abrir exatamente o
arquivo que o próprio backend acabou de gerar nesta sessão, verificado
no lado Rust (a JS não pode pedir para abrir um caminho arbitrário,
nem que quisesse) — mais restrito do que qualquer glob estático teria
sido, e sem precisar de nenhuma entrada de permissão nova em
`capabilities/default.json` (a permissão `opener:allow-open-path`,
que não resolvia o problema mesmo com um glob amplo sem entradas de
escopo, foi removida — não é mais usada). "Ver na Pasta" não precisou
de nenhuma mudança, continua via `revealItemInDir()` do plugin
normalmente.

**Correção do Item 2**: novo elemento `#aviso` (mesmo padrão visual do
banner de sucesso, mas em tom de alerta — laranja/âmbar, não verde),
com uma função `mostrarAviso(texto)` que aparece e some sozinha depois
de 5s. Chamado no ponto exato onde o drop de um arquivo não-PDF já era
rejeitado (o log técnico continua sendo escrito também, para
depuração) — mensagem visível: "Apenas arquivos PDF são aceitos."

**Validação**:
- Harness headless atualizado (stub de `invoke` agora simula
  `registrar_epub_gerado`/`abrir_epub_gerado` fielmente, incluindo o
  caso de falha "nenhum EPUB gerado") e as 3 suites completas
  (regressão da Fase 4.8, guard da Fase 4.9, itens da Fase 4.11)
  re-executadas — 38 asserções, todas passando, nenhuma quebra.
- `cargo check` confirmando que os dois comandos novos compilam e
  ficam registrados no `invoke_handler`.
- Build de produção real, `dist/` verificado antes de instalar (grep
  confirmando `abrir_epub_gerado`/`registrar_epub_gerado` no
  `main.js` gerado e o elemento `#aviso` no `index.html` gerado) —
  mesma disciplina de processo estabelecida na Fase 4.10.
- `/Applications/Foliant.app` reinstalado com autorização explícita do
  usuário. **Pendente, aguardando confirmação do próprio usuário**: o
  meta-prompt desta fase pede explicitamente para não considerar
  suficiente a validação headless sozinha, dado que foi exatamente essa
  lacuna que deixou passar os dois bugs originais — o clique real em
  "Abrir EPUB" e o drop real de um arquivo não-PDF no app instalado
  precisam ser confirmados visualmente pelo usuário antes de fechar
  esta fase com 100% de confiança.

**Nota de processo reforçada**: este é o segundo caso concreto (depois
da Fase 4.10, que foi sobre deploy, não sobre lógica) em que a
validação headless — necessária neste ambiente sandboxed por causa da
limitação de Accessibility — não foi suficiente sozinha. Registrado
como padrão esperado, não exceção: qualquer mudança que envolva
permissões do SO (arquivos, rede, dispositivos) ou APIs nativas do
Tauri sem equivalente fiel no stub precisa de confirmação manual real
antes de ser considerada fechada, mesmo com testes headless 100%
verdes.
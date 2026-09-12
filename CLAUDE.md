# CLAUDE.md — regras permanentes deste repositório

## Commits: nunca incluir coautoria de IA

**NUNCA** incluir a trailer `Co-Authored-By: Claude ...` (ou qualquer
variação de atribuição/autoria a uma IA) em nenhum commit deste
repositório — mesmo que esse seja o comportamento padrão do template de
commit do harness (Claude Code). Isso vale para toda sessão futura,
independente de o agente ter carregado memória de sessão ou não.

Só incluir esse tipo de linha se o usuário pedir isso explicitamente
naquele pedido específico de commit.

Se um commit já publicado contiver essa trailer indevidamente: reportar
qual(is) commit(s) são afetados e propor a correção exata (amend, se for
o commit mais recente e ninguém tiver puxado o histórico; se não for o
mais recente ou houver sinal de que outra máquina já deu pull, reportar
o risco e aguardar decisão explícita antes de reescrever histórico
publicado) — nunca fazer `--force`/`--force-with-lease` push sem
confirmação prévia da mensagem final.

## Design system: consultar antes de qualquer tarefa de UI/UX

Sempre que uma tarefa envolver UI/UX — componentes, assets, guidelines,
tokens, UI kits, uploads de tela/design — consultar primeiro
`/Users/thiagoalmeida/Documents/PROJECTS/foliant/design-system/project`
antes de implementar. Esse diretório contém o design system real do
projeto (guidelines, tokens, componentes, UI kits) e tem prioridade
sobre suposições de estilo genéricas.

## Documentos de histórico/estado do projeto

Este projeto mantém três documentos vivos que devem ser consultados
para entender contexto e decisões já tomadas, e atualizados quando o
trabalho gerar uma decisão, achado ou mudança de estado relevante:

- **TRACE.md** — relato narrativo dos episódios reais de engenharia do
  projeto (bugs encontrados, hipóteses testadas e derrubadas, lições).
  Cada entrada é um "episódio" numerado por extenso.
- **ARCHITECTURE.md** — estado arquitetural atual: decisões de design,
  fases implementadas, validações feitas com dados reais.
- **TASKS.md** — histórico de tarefas executadas, com critério de
  validação e resultado de cada uma.

Antes de assumir que algo é bug, pressuposto errado, ou comportamento
não-testado, verificar se já não foi investigado e documentado em um
desses três arquivos.

## Protocolo de build obrigatório antes de validação manual (app desktop)

Editar `desktop/src/*` **não** altera o `.app` já instalado. O
`desktop/dist` (gitignored) é gerado a partir de `desktop/src` via
`pnpm build:web`, e o binário Rust embute um snapshot compilado desse
`dist` — testar manualmente sem rebuild reflete código desatualizado
(ver TRACE.md, "Nono episódio").

Antes de qualquer validação manual de mudança de frontend, rodar, nesta
ordem:

1. `pnpm build:web` (gera `desktop/dist` a partir de `desktop/src`)
2. `pnpm tauri build` (empacota `Foliant.app`/`.dmg`, embute o sidecar)
3. Reinstalação manual do `.app` gerado

Não basta confirmar o timestamp do `.app` — é preciso confirmar que
esse timestamp é **posterior** à edição mais recente do código-fonte.

O sidecar Python (`foliant-core-x86_64-apple-darwin` em
`desktop/src-tauri/binaries/`, não versionado) é gerado por
`scripts/build-sidecar.sh`, que deve rodar antes de `pnpm tauri build`
em qualquer máquina nova.

## Dependências de sistema (OCR/conversão)

Instaladas via micromamba, sem Homebrew:

```
micromamba create -n foliant-ocr -c conda-forge tesseract tesseract-lang
sudo ln -s ~/micromamba/envs/foliant-ocr/bin/tesseract /usr/local/bin/tesseract
export TESSDATA_PREFIX=~/micromamba/envs/foliant-ocr/share/tessdata
```

`ebook-convert` (Calibre) é esperado em `/usr/local/bin/ebook-convert`
(symlink para `/Applications/calibre.app/Contents/MacOS/ebook-convert`).
Ambos os binários (`tesseract`, `ebook-convert`) são checados em
`REQUIRED_BINARIES` (`foliant.py`) antes de qualquer conversão real.

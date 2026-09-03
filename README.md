# Foliant

Pipeline offline e leve que transforma um PDF grande ou escaneado num
e-book pronto para Kindle (EPUB, com OCR em português), sem nunca carregar
o documento inteiro em memória.

## O problema

Livros escaneados em PDF — digitalizações de biblioteca, apostilas,
material acadêmico — costumam vir sem camada de texto (só imagem) e podem
ter centenas de páginas e centenas de megabytes. Ler isso num Kindle exige
um e-book pesquisável, mas as ferramentas comuns de conversão carregam o
PDF inteiro na RAM, o que trava máquinas modestas em arquivos grandes, e a
Amazon descontinuou o KindleGen (o gerador oficial de MOBI), deixando
EPUB como o formato de fato para quem monta o próprio pipeline hoje.

O Foliant existe para preencher essa lacuna: processa o PDF **página por
página** (OCR, extração de texto, limpeza), com uso de RAM praticamente
constante independente do tamanho do arquivo, e converte o resultado para
EPUB via Calibre. Sem serviço na nuvem, sem upload do livro para
terceiros, sem depender de ferramentas que resolvem só um pedaço do
pipeline (OCR *ou* conversão, não as duas com controle de memória).

## Requisitos e instalação

Sem Homebrew — Tesseract via micromamba, Calibre via download direto.

**1. Tesseract (OCR), via [micromamba](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html):**

```bash
micromamba create -n foliant-ocr -c conda-forge tesseract tesseract-lang
sudo ln -s ~/micromamba/envs/foliant-ocr/bin/tesseract /usr/local/bin/tesseract
export TESSDATA_PREFIX=~/micromamba/envs/foliant-ocr/share/tessdata
```

(adicione a linha do `export` ao seu `.zshrc`/`.bashrc` para persistir entre sessões)

**2. Calibre**, baixado direto do `.dmg` em [calibre-ebook.com](https://calibre-ebook.com/download) (não via `brew`). O binário usado é:

```
/Applications/calibre.app/Contents/MacOS/ebook-convert
```

Crie um symlink em `/usr/local/bin/ebook-convert` para o Foliant encontrá-lo no `PATH`.

**3. Dependências Python**, num `venv`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
python3 foliant.py entrada.pdf saida.epub --autor "Nome do Autor"
```

## Estado atual do projeto

- **Fases 1–3: concluídas e validadas** contra dados reais — RAM
  praticamente constante (~282MB) independente do tamanho do PDF de
  entrada, testado até 169MB / 208 páginas.
- **Fase 4 (planejada)**: empacotamento como app desktop via Tauri.
- **Fase 5 (planejada)**: MVP web client-side.

Detalhes de arquitetura, decisões e o teste de carga que validou o
comportamento de memória estão em [`ARCHITECTURE.md`](ARCHITECTURE.md) e
[`TASKS.md`](TASKS.md). A avaliação que levou à decisão de manter o
núcleo em Python (em vez de reescrever para WebAssembly/edge) está em
[`AUDITORIA_ARQUITETURA_2026.md`](AUDITORIA_ARQUITETURA_2026.md).

## Limitações conhecidas

As heurísticas de detecção (cabeçalho de página repetido, título de
capítulo) foram calibradas contra apenas **2 livros reais**. Isso é
suficiente para validar o mecanismo, não para provar que generaliza —
risco residual documentado explicitamente em `ARCHITECTURE.md`. Livros
com layout muito diferente dos dois testados podem exigir ajuste dos
limiares antes de produzir um resultado limpo.

## Licença

O Foliant depende do [PyMuPDF](https://pymupdf.io/), distribuído sob
licença dual **AGPL v3 / comercial** (Artifex). Segundo a própria posição
dos mantenedores do PyMuPDF, qualquer aplicação que o utiliza deve ser
licenciada como AGPL-3.0 (software livre e de código aberto) ou obter uma
licença comercial da Artifex — não há um meio-termo permissivo (MIT,
Apache 2.0) sem esse acordo comercial (ver
[discussão oficial](https://github.com/pymupdf/PyMuPDF/discussions/971)).

Como o Foliant é software livre, ele é distribuído sob a
**[GNU Affero General Public License v3.0](LICENSE)**, que satisfaz essa
condição.

## Contribuições

Contribuições, issues e sugestões são bem-vindas. Abra uma issue para
discutir bugs ou propostas antes de enviar um PR.

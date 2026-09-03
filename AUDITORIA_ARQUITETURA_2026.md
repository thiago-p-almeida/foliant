# Auditoria de Arquitetura — Foliant em 2026 (Web/Edge vs. Desktop)

**Data**: 2026-09-03. **Escopo**: avaliar se a stack Python atual (validada
em 3 fases contra dados reais, ver `ARCHITECTURE.md`/`TASKS.md`) ainda é a
melhor escolha, ou se processamento client-side via WebAssembly + hospedagem
edge serve melhor aos mesmos objetivos (leveza, offline-first, custo zero,
OCR PT-BR robusto). **Isto é uma recomendação técnica para decisão humana,
não uma migração decidida.**

---

## 0. Um ponto de partida que muda o enquadramento do problema

O objetivo "custo de hospedagem zero" **já está cumprido pelo status quo**:
o pipeline Python roda localmente, não tem hospedagem nenhuma. O motivo
real para considerar uma versão web não é economizar custo — é **reduzir
fricção de distribuição**: hoje, para qualquer pessoa além do Thiago usar
o Foliant, ela precisa instalar Python, Tesseract, Calibre e as
dependências do `requirements.txt` manualmente. Uma versão web resolve
isso (abrir uma URL, sem instalar nada); uma versão desktop empacotada
(Tauri) resolve parcialmente (um instalador, mas ainda nativo). Vale isso
como motivação declarada da comparação abaixo — a pergunta não é "qual
stack é mais barata", é "qual stack é mais fácil de outra pessoa usar sem
custo real de manutenção adicional para o Thiago".

---

## 1. Achados de pesquisa (fontes 2025-2026, sintetizados)

### 1.1 Renderização/extração de PDF no navegador
- **pdf.js** (Mozilla, Apache 2.0): 53,4k★, release estável abr/2026,
  extração de texto nativo real via `getTextContent()`, ~2-4MB. Opção mais
  madura e previsível.
- **mupdf.js** (Artifex): binding WASM oficial do **mesmo motor MuPDF que
  já está por trás do PyMuPDF usado hoje** — replicaria o comportamento já
  validado quase sem risco de regressão de qualidade. Binding jovem (603★,
  release mais recente 27/ago/2026), licença **AGPL v3** (mesma que já se
  aplica ao PyMuPDF hoje — não é restrição nova).
- **PDFium WASM** (`@hyzyla/pdfium`, Apache/BSD): performance nativa,
  comunidade menor.
- **Recomendação**: mupdf.js é tecnicamente o mais coerente (mesmo motor,
  mesmo comportamento), mas ainda imaturo como binding — usar pdf.js na
  primeira versão por previsibilidade, reavaliar mupdf.js quando o binding
  amadurecer.

### 1.2 OCR client-side
`tesseract-wasm` (~2,1MB com Brotli + SIMD quando disponível) e
`tesseract.js` (38,7k★, mais adotado) são maduros para OCR 100% no
navegador. Pacotes de idioma (`por.traineddata`) baixados à parte, do
mesmo `tessdata_fast` já usado hoje — sem mudança de qualidade de OCR
PT-BR esperada.

### 1.3 Pyodide vs. reescrita em TypeScript
Pyodide é **tecnicamente viável, mas inviável para um app "leve"**: mesmo
minimizado (via `pyodide-pack`), o runtime soma dezenas de MB e 4-5s de
inicialização — desproporcional para heurísticas que são só regex,
contagem de frequência, mediana e comparação de conjuntos. **A lógica já
documentada em `ARCHITECTURE.md` (clustering de cabeçalho, detecção de
título por altura) é simples o bastante para reescrever em TS com baixo
custo** — mas com custo real de **revalidação completa** (ver §5).

### 1.4 Geração de EPUB no navegador
Formato é só ZIP+XHTML — tecnicamente trivial. Nenhuma biblioteca madura
disponível hoje: `epub-gen-memory` está abandonada (sem push desde
jul/2024); `jEpub` está ativa mas é pequena (54★) e não documenta
compatibilidade testada contra Kindle/Apple Books. **Recomendação**:
construir um gerador fino próprio sobre JSZip (controle total de
metadados/NCX/nav.xhtml) em vez de depender de qualquer uma das duas.

### 1.5 AZW3/MOBI — confirmado: droppar do caminho web é seguro
Calibre/`ebook-convert` (C++/Qt) não tem build WASM e não há sinal de
port em andamento. Mas isso deixou de importar: **Send-to-Kindle aceita
EPUB diretamente em 2026** e converte no lado da Amazon; KindleGen está
descontinuado desde 2020. Manter AZW3 só faz sentido no caminho
desktop/Python, para quem quer sideload sem depender do Send-to-Kindle.

### 1.6 Módulos standalone — onde vale competir
- **OCR-only** e **HTML→EPUB**: mercados saturados por projetos gigantes
  e ativamente mantidos (Tesseract 76k★, PaddleOCR 88k★, Pandoc 46k★) —
  **não compensa** oferecer como ferramenta separada.
- **PDF→HTML standalone**: nicho mal servido — a ferramenta mais popular
  (`pdf2htmlEX`, 10,6k★) está **arquivada desde 2023**, sem sucessor
  ativo. É a única categoria onde expor um módulo standalone do Foliant
  teria valor de mercado real (usando pdf.js como base).

### 1.7 Stack de hospedagem
Cloudflare Pages estático segue **grátis e ilimitado**. Workers free tier
(100k req/dia, 10ms CPU/req) e D1 (5GB, 5M leituras/dia, 100k
escritas/dia) **passaram a ter enforcement real a partir de 1º/set/2026**
(antes eram só nominais). **Achado crítico**: como o processamento é
100% client-side, **nenhum dos dois é necessário** — só entrariam em
cena para conta de usuário, histórico sincronizado ou telemetria
server-side, nenhum requisito atual do projeto. Astro e SvelteKit também
são overkill: o app é essencialmente uma tela única
(upload→processar→baixar), sem necessidade de SSR/roteamento.
**Recomendação**: Vite (ou nada) + TS vanilla + Cloudflare Pages estático
puro (ou GitHub Pages, equivalente e sem nenhum lock-in). Reavaliar
Workers/D1 só se/quando surgir uma feature de servidor real.

### 1.8 PWA offline-first
Service Worker + Cache API maduros nos três engines em 2026. **Ponto de
atenção real**: iOS Safari apaga Cache API/IndexedDB de PWAs **não
instaladas na tela de início** após 7 dias de inatividade — PWAs
instaladas ficam isentas dessa política. Requisito prático: o app
precisa incentivar ativamente "Adicionar à Tela de Início" para garantir
persistência confiável do WASM cacheado em iOS.

### 1.9 Unificação Rust/WASM (web) + Tauri (desktop)
É **realista compartilhar o mesmo código-fonte Rust** compilando para
WASM (navegador) e **binário nativo direto** (Tauri, sem passar pelo
WASM) — esse é o padrão real encontrado em produção (Typst Studio
Desktop, 2026). Porém: **não há evidência de caso real documentado**
combinando bindings Rust de Tesseract (`leptess`/`tesseract-rs`)
embarcados num app Tauri — tecnicamente plausível, mas não comprovado em
campo. Além disso, reescrever o núcleo em Rust joga fora a validação de 3
fases já feita em Python (ver §5). Tauri **já suporta rodar um sidecar
Python empacotado via PyInstaller** — padrão documentado oficialmente
pelo próprio time do Tauri. **Recomendação**: não reescrever o núcleo em
Rust agora. Para desktop, empacotar o Python já validado via sidecar
Tauri (resolve fricção de instalação sem reescrever nada); reservar
Rust/WASM (ou TS/WASM) só para a versão web, onde Python literalmente não
roda.

### 1.10 IndexedDB como substituto do cache em disco
Adequado para o mesmo padrão de streaming (gravação incremental por
página). Quotas: confortáveis em Chrome/Firefox para um livro de até
~200MB; **Safari é o caso limitante** (menor alocação inicial, prompts de
permissão, eviction de 7 dias). Web Workers são obrigatórios e maduros
para não travar a UI durante OCR pesado — padrão de facto confirmado.

---

## 2. Tabela comparativa de arquiteturas candidatas

| Critério | A) Status quo (Python CLI local) | B) Full edge/client-side (WASM navegador, sem servidor) | C) Alternativa enxuta a B (mesma stack, Vite+vanilla em vez de framework) | D) Híbrido (núcleo Python via Tauri sidecar + web leve limitada) |
|---|---|---|---|---|
| **Eficiência (CPU/RAM)** | Validada: ~282MB pico, independe do tamanho do PDF (ver `ARCHITECTURE.md`) | Depende do hardware do usuário — WASM+OCR é mais pesado que nativo; sem controle sobre a máquina que roda | Igual a B (mesma engine de processamento) | Desktop mantém eficiência A; web limitada a livros menores (ver §4 do briefing original) |
| **Escalabilidade (a quantos usuários serve)** | Baixa — só quem instala manualmente | Alta — qualquer navegador, mas cada usuário paga o custo de CPU local | Igual a B | Alta para casos leves (web) + robusto para casos pesados (desktop) |
| **Sustentabilidade (esforço de manutenção, risco de dependência abandonada)** | Alta — 3 fases já validadas, dependências estáveis (PyMuPDF/Tesseract/Calibre) | Média/baixa — bibliotecas de EPUB client-side são pequenas/abandonadas (epub-gen-memory parada); exige reescrever e revalidar heurísticas | Igual a B, mas sem risco extra de framework (menos superfície) | Mantém A intacto (baixo risco) + adiciona uma segunda base de código pequena (risco isolado, não contamina o core validado) |
| **Custo computacional** | Do Thiago (MacBook 2016) | Transferido para cada usuário — celular/máquina fraca pode travar em livro grande | Igual a B | Desktop: do usuário que baixa; Web: só para livros pequenos, com limite declarado |
| **Segurança/privacidade** | Documento nunca sai da máquina | **Mesma vantagem** — processamento 100% no navegador, documento nunca é enviado a servidor (diferencial real para PDFs sensíveis) | Igual a B | Igual — ambos os caminhos são locais/client-side |
| **Custo de hospedagem** | US$0 (não hospeda nada) | US$0 (Cloudflare Pages estático ilimitado) — **se evitar Workers/D1** | US$0, e com **menor risco** de acidentalmente precisar de Workers/D1 (sem framework empurrando SSR) | US$0 (mesma hospedagem estática da versão web) |
| **Offline-first** | Nativo (é CLI local) | Requer PWA + Service Worker bem implementado (viável, mas trabalho extra; iOS exige "instalar" o PWA) | Igual a B | Desktop nativo offline; web com mesmo requisito de PWA de B |
| **Fricção de distribuição** | Alta — instalar Python/Tesseract/Calibre manualmente | Baixa — abrir uma URL | Igual a B | Baixa para ambos os caminhos (instalador Tauri de um clique / URL) |

---

## 3. Recomendação

**Não recomendo reescrever o núcleo agora (rejeita B como primeiro
passo), e recomendo D como direção, faseada e com gate de validação em
cada etapa — não uma decisão de "migrar tudo".**

Justificativa central: o Python atual já cumpre integralmente os
objetivos declarados (offline, custo zero, RAM constante validada com
dado real, OCR PT-BR calibrado em 2 livros reais) para o único usuário
confirmado hoje (o Thiago). O ganho real de uma versão web/edge não é
técnico — é de distribuição, para outras pessoas usarem sem instalar
nada. Esse ganho é real, mas **não justifica jogar fora 3 fases de
calibração empírica documentada** reescrevendo o núcleo inteiro em
Rust/TS de uma vez (opção B "puro"). A pesquisa confirma que dá para
capturar o ganho de distribuição **sem esse risco**: Tauri aceita um
sidecar Python via PyInstaller — ou seja, o mesmo binário Python já
validado pode virar um app desktop instalável de um clique, sem reescrever
nada. Isso sozinho já resolve a maior parte da fricção de distribuição
(usuários com Mac/Linux, que é o público mais próximo do caso de uso
declarado — livros de 190MB+, OCR pesado).

A versão web client-side (opção C: Vite/TS vanilla + Cloudflare Pages
estático, sem Astro/SvelteKit/Workers/D1) só se justifica como
**complemento leve** para casos simples (PDFs pequenos, poucas dezenas
de páginas) onde baixar um app não vale a pena — não como substituto do
pipeline pesado. Ela exige reescrita real (heurísticas em TS, gerador de
EPUB próprio sobre JSZip, pdf.js/mupdf.js, tesseract-wasm) e, portanto,
revalidação completa contra os mesmos 2 livros de teste antes de confiar
nela.

---

## 4. Plano faseado (se a direção D for adotada)

Seguindo o mesmo padrão de execução incremental já usado nas Fases 1-3
(implementar, validar contra dado real, só então fechar):

**Fase 4 — Desktop de baixo risco (sem reescrita)**
Empacotar `foliant.py` como sidecar Tauri via PyInstaller. Sem mudança de
lógica. Critério de fechamento: o app empacotado produz saída
byte-idêntica ao `python3 foliant.py` de hoje, nos mesmos 2 livros de
teste (80 e 208 páginas).

**Fase 5 — MVP web leve, escopo reduzido deliberadamente**
Construir a versão client-side só para PDFs pequenos (limite explícito a
definir, ex.: <50MB / <100 páginas — mesma disciplina de "declarar limite
realista" pedida no briefing original). Stack: pdf.js/mupdf.js +
tesseract-wasm + heurísticas reescritas em TS + gerador de EPUB próprio
sobre JSZip + IndexedDB/Web Workers para streaming + PWA com prompt de
"instalar" para mitigar a eviction de 7 dias do iOS. Hospedar em
Cloudflare Pages estático (ou GitHub Pages), sem Workers/D1.
Critério de fechamento: mesmo tipo de validação já usada nas fases
anteriores — rodar contra `samples/001-080.pdf` e comparar HTML/EPUB
gerado linha a linha contra a saída Python, documentando divergências
como risco residual explícito (mesmo padrão de honestidade de
`ARCHITECTURE.md`).

**Fase 6 — só se a manutenção de 2 bases de código virar dor real**
Reavaliar unificação do núcleo em Rust/WASM (rodando nativo no Tauri e
compilado para WASM no navegador). Não antecipar — não há evidência de
caso real validado de Tesseract nativo em Rust dentro de Tauri; tratar
como experimento, não como plano firme.

---

## 5. Avaliação de risco de migração — o que se perde

Isto pesa explicitamente contra qualquer proposta de reescrita total
(opção B), e é o motivo central da recomendação em §3:

- **3 fases de calibração empírica, documentadas com evidência real**,
  seriam re-testadas do zero: limiar de cabeçalho (`LIMIAR_CABECALHO_MINIMO
  = 3`, corrigido depois de falhar em generalizar de fração para contagem
  absoluta), limiar de similaridade por sobreposição de palavras (0.70,
  substituindo `difflib` que misturava cabeçalhos diferentes), critério de
  detecção de título (razão 2.0, tolerância de linha fraca, janela de 7
  linhas — todos ajustados depois de 4 bugs reais encontrados só em volume
  real de 208 páginas). Uma reescrita em TS **não herda automaticamente**
  nenhuma dessas correções — o mesmo tipo de bug (ex.: limiar que não
  generaliza para um livro com perfil de capítulos diferente) pode
  reaparecer silenciosamente se a reescrita não for validada com o mesmo
  rigor.
- **RENDER_DPI=200 foi uma decisão validada por comparação real** (300/250
  pioraram a leitura de sumário) — uma stack WASM diferente (mupdf.js vs.
  PyMuPDF, Tesseract-wasm vs. pytesseract nativo) pode ter comportamento de
  renderização/OCR sutilmente diferente no mesmo DPI, exigindo repetir essa
  comparação, não assumir que o número transfere.
- **Risco residual já documentado como aceito** (ex.: perda de recall em
  variantes de OCR muito degradadas, falso positivo "Bibliograi sam") foi
  calibrado contra o comportamento específico do Tesseract nativo — o
  Tesseract-wasm pode ter um perfil de erro de OCR diferente o bastante
  para mudar essas margens.
- **Contra isso**, o ganho da reescrita completa é teórico até ser
  validado: nenhuma fonte de pesquisa encontrou um caso real e comprovado
  de app Tauri com Tesseract nativo em Rust — ou seja, a "melhor" opção
  teórica de unificação de código ainda não tem prova de campo.

Dado esse desequilíbrio (perda concreta e documentada vs. ganho ainda não
comprovado), manter o núcleo Python intacto e usar Tauri só como casca de
distribuição (Fase 4) captura a maior parte do valor prático com risco
quase zero — e é por isso que essa é a peça do plano recomendada para
agir primeiro, não a reescrita web.

---

## 6. Restrições inegociáveis — checklist de conformidade da proposta

- [x] OCR em português na mesma qualidade: preservado em D (Tesseract
  nativo intacto no desktop; `por.traineddata` do mesmo `tessdata_fast` no
  web, mesma fonte de hoje).
- [x] Offline-first como requisito de primeira classe: desktop nativo
  offline por padrão; web via PWA com Service Worker (trabalho extra
  real, não automático — ver §1.8).
- [x] Custo de hospedagem zero: Cloudflare Pages/GitHub Pages estático,
  sem Workers/D1.
- [x] Nenhuma dependência nova que contrarie a filosofia de leveza: opção
  C rejeita Astro/SvelteKit/Pyodide explicitamente por esse motivo.
- [x] Mesmo padrão de documentação (decisões com evidência real, riscos
  residuais declarados): este documento segue o padrão, e cada fase do
  plano (§4) tem critério de fechamento por comparação com dado real,
  como as Fases 1-3.

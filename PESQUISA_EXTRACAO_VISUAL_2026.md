# Pesquisa — extração de figura, tabela e infográfico em página escaneada

**Data**: 2026-09-23. **Escopo**: mapear as tecnologias open-source que
resolvem, hoje, detecção de região visual (figura / tabela / gráfico) em
**página escaneada**, e avaliá-las contra as restrições reais do Foliant.
**Isto é uma recomendação técnica para decisão humana, não uma direção
decidida.** Nenhum código de produção foi alterado.

> **Estado em 2026-09-24 — a Etapa 0 (seção 5) foi executada.** O corpus do
> caso-alvo saiu de N=0 para **13 páginas / 16 objetos anotados**, de 5 fontes,
> mais **224 páginas negativas** de 4 scanners: ver `corpus_visual/README.md`,
> onde também está fixado o critério do Portão 1. Registro narrativo no 24º
> episódio do `TRACE.md`; estado na Fase 4.24 do `ARCHITECTURE.md`.
> Pendência conhecida: o tipo *gráfico* ficou com 3 objetos na mesma página —
> recall desse tipo é **inconclusivo por construção**.

Contexto prévio obrigatório: `TRACE.md` episódios 16 a 21,
`ARCHITECTURE.md` Fases 4.18 a 4.22.

---

## 0. Duas premissas de entrada estavam erradas — e elas mudam o mapa

O enquadramento até aqui era: *"modelo de layout é a solução óbvia, mas
está bloqueado por licença (PubLayNet é CC-BY-NC) e por peso
(+50-60 MB)."* Verificado em fonte primária, **nenhuma das duas se
sustenta**.

**Premissa 1 — licença. Errada.** PubLayNet **não é CC-BY-NC**. O
`LICENSE.md` do repositório da IBM diz, textualmente, que as anotações
estão sob **Community Data License Agreement – Permissive – Version 1.0**
(CDLA-Permissive-1.0), e que as imagens seguem os termos do *PMC Open
Access Subset* — subconjunto escolhido justamente por permitir uso
comercial. O DocLayNet usa a **mesma** CDLA-Permissive-1.0.

Mais decisivo: a CDLA-Permissive-1.0, na **Seção 3.4**, diz que não impõe
"obrigações ou restrições sobre o Seu Uso ou Publicação de *Results*"
obtidos por análise computacional dos dados. Um peso treinado é um
*Result*. Ou seja: **o dataset não contamina o modelo treinado**. O
bloqueio de licença que travou essa linha de investigação não existe.

(Onde o cuidado *é* real: o *model zoo* do LayoutParser mistura datasets, e
o **HJDataset** é CC-BY-NC-SA-4.0. O erro provável foi generalizar a
licença de um item do zoo para o zoo inteiro.)

**Premissa 2 — peso. Errada por uma ordem de grandeza.** O
**PP-DocLayout-S** (PaddleOCR, Apache-2.0) pesa **4,8 MB** — medido:
`inference.pdiparams` = 4.804.904 bytes no card do Hugging Face — e
detecta as **mesmas 23 categorias** do irmão grande de 124 MB, incluindo
`image`, `figure`, `chart`, `table`, `figure caption`, `table caption`,
`seal`. Os "+50-60 MB" descrevem a geração anterior (Detectron2/PubLayNet),
não o estado da arte de 2025-2026.

**O custo real não é o peso — é o runtime.** Ver seção 3.

---

## 1. Achado novo desta rodada: Leptonica já está na máquina, e falha

Antes de olhar para fora, testei o candidato mais barato possível: o
**Leptonica** já está instalado como dependência do Tesseract
(`libleptonica.6.dylib` no env `foliant-ocr`; Tesseract 5.5.3 /
leptonica 1.87.0). Seus símbolos de segmentação de página estão
exportados e são chamáveis por `ctypes` (stdlib) — **zero dependência
Python nova**:

```
_pixGetRegionsBinary   _pixGenerateHalftoneMask   _pixGenTextblockMask
_pixConnCompBB         _pixMorphSequence          _pixConvertTo1
```

`pixGetRegionsBinary()` devolve exatamente as três máscaras que o problema
pede: *halftone* (figura), *textline* e *textblock*. Rodei nas **mesmas 5
páginas** do décimo oitavo episódio, nesta máquina:

| página | DPI | máscara halftone | máscara textblock | tempo seg. |
|---|---|---|---|---|
| FDE p.112 — **FIGURA** (MAD Landscape) | 200 | **0,00 %** | 4,33 % | 0,385 s |
| Gil pg.178 — **FIGURA** (Gantt) | 200 | **0,90 %** | 19,47 % | 0,332 s |
| Gil-80 p.22 — prosa | 200 | 0,00 % | 31,39 % | 0,260 s |
| Gil-80 p.46 — prosa | 200 | 0,00 % | 32,29 % | 0,709 s |
| Gil-80 p.70 — prosa | 200 | 0,00 % | 27,14 % | 0,394 s |

Nenhum blob de halftone ≥1 % da página em nenhuma das duas figuras.

**Veredito: reprovado, pelo mesmo perfil de sempre.** Precisão perfeita
(0 falsos positivos na prosa), **recall ≈ 0 nas duas únicas figuras
conhecidas**. É a **quarta** ocorrência do mesmo padrão no projeto —
`find_tables` (16º ep.), `ocr_photo` do hOCR (18º ep.), gap geométrico
(16º ep.) e agora o Leptonica. E a causa é a mesma do `ocr_photo`: máscara
de *halftone* detecta **foto meio-tom reticulada**, não *line-art*. Os
dois casos-alvo do corpus são line-art. O `ocr_photo` do Tesseract é,
literalmente, esse mesmo mecanismo — então o resultado é consistente, não
uma surpresa.

**Sinal secundário, também reprovado.** A cobertura de `textblock_mask`
separa bem a 200 DPI (figuras 4,33 % e 19,47 %; prosa 27,14-32,29 %). Mas
**o ordenamento inverte a 300 DPI** — que é a resolução de operação que o
próprio Leptonica documenta: ali a prosa da p.46 cai para **7,69 %**,
*abaixo* da figura da pg.178 (15,50 %). Um sinal que troca de sinal ao
mudar um parâmetro de render não é um sinal. Não vale limiar.

Custo, para registro: 0,26-0,71 s/página a 200 DPI, ~4-12 % dos 6,08 s/pág
já pagos pelo OCR. Barato. O problema nunca foi custo.

---

## 2. O mapa do mercado, avaliado contra as restrições

Restrições: Python · CPU-only · 100 % offline · AGPL-3.0 · macOS 13.7.8
**x86_64** (MacBook 2016) · sidecar PyInstaller hoje com **37 MB**.

### 2.1 Modelos de layout (detectam figura + tabela + gráfico de uma vez)

| Tecnologia | Licença código / pesos | Tamanho do peso | CPU | Veredito |
|---|---|---|---|---|
| **PP-DocLayout-S** (PaddleOCR) | Apache-2.0 / Apache-2.0 | **4,8 MB** | 18,5 ms (bench do fornecedor) | **Candidato principal** |
| PP-DocLayout-M | Apache-2.0 / Apache-2.0 | 22,6 MB | 43,4 ms | Degrau de fallback |
| PP-DocLayout-L / plus-L | Apache-2.0 / Apache-2.0 | 124 / 126 MB | 503 / 635 ms | Grande demais |
| **DocLayout-YOLO** (OpenDataLab) | AGPL-3.0 / Apache-2.0 | 40,7 MB (`.pt`) | rápido | Viável, mas `.pt` arrasta PyTorch; exigiria export ONNX próprio |
| **Docling layout** (`heron-onnx`, IBM) | MIT / Apache-2.0 | **171 MB** | egret-m é o leve, mas **só o heron tem ONNX** | Reprovado por tamanho |
| **Table Transformer / TATR** (Microsoft) | MIT / MIT (PubTables-1M, CDLA-Perm.) | ~110 MB (28,8 M params) | ~5-15 s/imagem | Reprovado: dobraria o custo/página |
| **Surya** (Datalab) | Apache-2.0 / **OpenRAIL-M modificada** | — | — | **Reprovado por licença**: teto de receita e restrição de campo de uso são incompatíveis com AGPL-3.0 |
| LayoutParser + Detectron2 | Apache-2.0 / misto | 200 MB+ | lento | Geração anterior; Detectron2 sem wheel |

Notas de licença, já checadas: Apache-2.0 é compatível **em uma direção**
com AGPL-3.0 (pode entrar num projeto AGPL). AGPL-3.0 do DocLayout-YOLO é
compatível por identidade. A OpenRAIL-M do Surya é o único bloqueio real
de licença do mapa inteiro — e é bloqueio de verdade, porque restrição de
campo de uso colide com a liberdade 0 exigida pela AGPL.

### 2.2 Métodos clássicos (sem ML)

| Tecnologia | Licença | Dependências | Veredito |
|---|---|---|---|
| **Leptonica `pixGetRegionsBinary`** | BSD-2 | **nenhuma nova** (ctypes + dylib já presente) | **Medido nesta rodada: recall ≈ 0** (seção 1) |
| Morfologia + CC com Pillow | — | nenhuma nova | Já prototipado (18º ep.): 0,10-0,29 s/pág, **poder discriminante insuficiente** (figura 60,5 % vs prosa 63,5 % de área) |
| **RLSA** (Run Length Smoothing) | implementações MIT | OpenCV + numpy, ou reimplementar em Pillow | Mesma classe do que já falhou; exige limiar `C` calibrado — e é limiar que o corpus não sustenta |
| Docstrum / X-Y cut / Voronoi | variadas | numpy | Idem: segmentam bem **texto**; "figura" sai por exclusão, que é o que já falhou |
| **img2table** | MIT | **OpenCV + numpy** | Só tabela, e **bloqueado na prática**: ver 3.2 |
| Camelot / pdfplumber | MIT | — | **Fora de escopo**: exigem texto/linhas nativos, não funcionam em escaneado |

**O padrão que o mapa revela**: todo método clássico converge para "achar
o texto bem e chamar o resto de figura", e precisa de **pelo menos um
limiar calibrado**. O projeto já provou quatro vezes que não tem amostra
para calibrar limiar nenhum. Insistir na família clássica é insistir na
família que depende exatamente do recurso que falta.

---

## 3. O custo real: runtime, não modelo

### 3.1 Footprint de adicionar inferência ONNX (medido no PyPI)

| pacote | wheel macOS x86_64 | licença |
|---|---|---|
| `onnxruntime` 1.23.2 | **19,2 MB** | MIT |
| `numpy` 2.5.3 | 17,0 MB (`macosx_10_13`) | BSD-3 |
| PP-DocLayout-S (ONNX) | ~4,8 MB | Apache-2.0 |

Ou seja: **~41 MB de wheels**, sobre um sidecar que hoje tem 37 MB. O
sidecar mais que dobraria — e essa é a objeção honesta, não a licença.
Contrapeso: o usuário final **não faz `pip install`**; o PyInstaller
empacota tudo no build. O custo é de download do `.dmg`, pago uma vez.

### 3.2 Dois congelamentos de plataforma — e este é o risco de sustentabilidade real

Medido na API do PyPI, hoje:

- **`onnxruntime`**: último wheel macOS **x86_64** é o **1.23.2**
  (`macosx_13_0_x86_64`, 19,2 MB). A versão corrente é a **1.30.0**, e para
  macOS ela só publica **arm64**. O x86_64 do macOS está **congelado**.
- **`opencv-python-headless`**: os wheels x86_64 atuais (4.13+, 5.0) são
  `macosx_14_0_x86_64` — exigem **macOS 14 (Sonoma)**. Esta máquina roda
  **13.7.8**, e um MacBook 2016 **não pode** ir para o Sonoma. O último
  wheel instalável aqui é o **4.12.0.88** (57,3 MB).

Consequências diretas:

1. **OpenCV está efetivamente fora**, e isso derruba o `img2table` e toda a
   família clássica que depende dele — não por escolha de estilo, mas
   porque a plataforma-alvo não tem wheel corrente. Vale registrar que a
   norma anti-`numpy` do projeto (`scripts/calibrar_ocr.py:60-73`) agora
   tem um reforço externo que não existia quando foi escrita.
2. **`onnxruntime` 1.23.2 funciona aqui** (exige macOS ≥13,0; temos 13,7,8)
   mas é uma dependência sem futuro nesta arquitetura. Isso é menos grave
   do que parece: é um runtime de inferência puro, com contrato estável
   (opset ONNX), sem superfície de rede e sem exposição a CVE de
   aplicação. Congelar um interpretador de grafo é risco muito menor do
   que congelar um framework web. E o congelamento é **da arquitetura
   x86_64, não do produto**: o caminho arm64 está vivo e atual.

**A leitura sóbria**: qualquer caminho que dependa de wheel binário nesta
máquina já está em conta-gotas. Isso é argumento para decidir *agora*, com
a versão que ainda existe, e para prever o build arm64 — não é argumento
para não decidir.

---

## 4. O gargalo continua sendo amostra — e agora é o único

Os documentos do projeto dizem três vezes que o gargalo é amostra, não
método. Esta rodada confirma e **estreita** a afirmação: com licença e
peso descartados como bloqueios, a amostra é o **único** bloqueio que
sobrou.

Mas há uma assimetria que muda a estratégia, e que não estava explícita:

| abordagem | o que o corpus precisa fazer | tamanho de amostra exigido |
|---|---|---|
| heurística clássica | **ajustar** um limiar | grande — é ajuste de parâmetro, e foi o que matou os 4 detectores |
| modelo pré-treinado | apenas **validar** parâmetros já aprendidos em 150k-300k documentos de terceiros | pequeno — basta medir, não estimar |

Um modelo pré-treinado **não pede ao corpus do Foliant que escolha número
nenhum**. Ele chega com os parâmetros prontos; o corpus serve só para
medir recall e falso positivo e para decidir aceitar ou rejeitar. Isso é
uma exigência amostral qualitativamente menor — e é exatamente o motivo
pelo qual essa linha merece a próxima rodada, e não a quinta tentativa de
heurística.

---

## 5. Recomendação

**Direção: PP-DocLayout-S via ONNX Runtime, com decisão em dois portões e
sem integração antes do segundo.** Ordem de preferência de fallback:
PP-DocLayout-S (4,8 MB) → PP-DocLayout-M (22,6 MB) → arquivar.

### Etapa 0 — corpus (bloqueante, sem código, sem dependência)

Nada abaixo disto pode ser validado sem isto. Alvo mínimo:

- **12-20 páginas escaneadas com figura embutida em página de texto** —
  o caso-alvo que está em N=0 desde a Fase 4.20 — com **cobertura de tipos
  visuais**: foto/meio-tom, gráfico de barras com rótulo **horizontal**,
  fluxograma, e tabela-como-figura. Mais exemplares do tipo já coberto
  confirmariam o artefato em vez de testá-lo (lição da Fase 4.20).
- **Ground truth de bbox anotada à mão.** Sem isso só se mede precisão, e
  foi essa assimetria que deixou o 17º episódio inconclusivo.
- **Classe negativa**: as 288 páginas de texto escaneado do Gil, já
  disponíveis, rodadas **inteiras** — não páginas escolhidas a dedo
  (lição do 16º episódio).

Fontes de aquisição plausíveis, todas offline-compatíveis e com licença
limpa: Internet Archive (domínio público escaneado), imagens do próprio
**DocLayNet** (CDLA-Permissive-1.0), corpora **PRImA** / IMPACT, e scans
próprios de material físico.

### Etapa 1 — avaliação offline, em script de pesquisa

Instalar `onnxruntime==1.23.2` + `numpy` **num venv separado**, não no do
projeto. Rodar PP-DocLayout-S contra o corpus da Etapa 0. Medir, com os
números na mesa: recall por tipo visual, falso positivo no corpus negativo
completo, e **tempo por página nesta máquina de 2016** — a marca de 18,5 ms
é bench de servidor do fornecedor e não vale aqui; a comparação relevante
é contra os 6,08 s/pág do OCR.

### Portão 1 — critério de aceitação, definido *antes* de medir

Aceitar apenas se: recall ≥ ~80 % no caso-alvo **e** falso positivo ~0 nas
288 páginas negativas. Se o recall repetir o padrão dos quatro detectores
anteriores, **arquivar sem forçar** — o padrão da Fase 4.5 ("investigado,
sem solução viável, não forçado"), que este projeto já aplicou bem duas
vezes.

### Etapa 2 — integração, se e só se o Portão 1 passar

Sob a **invariante da Fase 4.20, sem exceção**: o recorte **não remove** o
texto OCR da região. Falso positivo custa uma `<figure>` redundante, nunca
perda de texto. Mesma separação D1/D2 da Fase 4.21 — embutir a imagem
agora; suprimir texto OCR é outra decisão, outra rodada, outro corpus.

### Um ganho lateral que vale explicitar

No **caminho OCR**, detectar uma região como `table` e **embuti-la como
imagem** é estritamente melhor que o status quo: hoje uma tabela escaneada
vira sopa de prosa OCR, sem estrutura e frequentemente com erro de leitura.
Uma imagem da tabela preserva a informação. Isso **não** vale no caminho
nativo — lá o texto da tabela ao menos é texto real, e a Fase 4.18 acertou
em não mexer. É o mesmo mecanismo da figura, sem custo adicional, e é o
melhor argumento para o modelo pagar por si além do caso-figura.

---

## 6. O que não fazer, e por quê

- **Não** tentar uma quinta heurística clássica antes da Etapa 0. Quatro já
  falharam pelo mesmo motivo, e o Leptonica desta rodada é a quarta.
- **Não** adotar OpenCV nesta plataforma: sem wheel corrente para
  macOS 13 / x86_64.
- **Não** adotar Surya: licença de pesos incompatível com AGPL-3.0.
- **Não** adotar Docling `heron` (171 MB) nem TATR (~110 MB e 5-15 s/pág).
- **Não** gatear o OCR pela geometria — decisão já tomada e bem
  fundamentada na Fase 4.21.

---

## 7. Fontes primárias consultadas

- PubLayNet `LICENSE.md` — CDLA-Permissive-1.0 (anotações) + PMC OA Terms
  (imagens): https://github.com/ibm-aur-nlp/PubLayNet/blob/master/LICENSE.md
- DocLayNet `LICENSE` — CDLA-Permissive-1.0, Seção 3.4 (Results):
  https://github.com/DS4SD/DocLayNet/blob/main/LICENSE
- PaddleOCR, tabela de modelos de layout (tamanhos, tempos de CPU, as 23
  categorias):
  https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/layout_detection.en.md
- Card HF `PaddlePaddle/PP-DocLayout-S` — Apache-2.0, `inference.pdiparams`
  4.804.904 bytes: https://huggingface.co/PaddlePaddle/PP-DocLayout-S
- Card HF `docling-project/docling-layout-heron-onnx` — Apache-2.0,
  `model.onnx` 171.220.471 bytes:
  https://huggingface.co/docling-project/docling-layout-heron-onnx
- Card HF `juliozhao/DocLayout-YOLO-DocStructBench` — Apache-2.0, 40,7 MB:
  https://huggingface.co/juliozhao/DocLayout-YOLO-DocStructBench
- DocLayout-YOLO (código, AGPL-3.0):
  https://github.com/opendatalab/DocLayout-YOLO
- Surya (código Apache-2.0, pesos OpenRAIL-M modificada):
  https://github.com/datalab-to/surya
- Table Transformer (MIT): https://github.com/microsoft/table-transformer
- img2table (OpenCV, sem deep learning):
  https://github.com/xavctn/img2table
- Leptonica `pageseg.c` (`pixGetRegionsBinary`, `pixGenerateHalftoneMask`):
  https://github.com/DanBloomberg/leptonica/blob/master/src/pageseg.c
- Disponibilidade de wheels: API JSON do PyPI para `onnxruntime`, `numpy`
  e `opencv-python-headless`, consultada em 2026-09-23.

**Medições próprias desta rodada** (macOS 13.7.8, x86_64, Tesseract 5.5.3 /
leptonica 1.87.0, PyMuPDF 1.28.2): tabela da seção 1, obtida por sonda
`ctypes` contra `libleptonica.6.dylib`, nas mesmas 5 páginas do décimo
oitavo episódio.

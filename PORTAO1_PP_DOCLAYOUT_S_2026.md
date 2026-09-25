# Portão 1 — PP-DocLayout-S contra o corpus da Etapa 0

**Data**: 2026-09-24. Etapa 1 de `PESQUISA_EXTRACAO_VISUAL_2026.md`.
**Escopo**: medição pura. Nada em `foliant.py`, em `desktop/` ou no `.venv` do
projeto foi tocado. Script em [scripts/medir_layout_portao1.py](scripts/medir_layout_portao1.py).

> **Revisado em 2026-09-25** (segunda rodada da Etapa 1). A primeira versão
> deste relatório afirmava "5 não-detecções" entre as 11 falhas. **Isso estava
> errado** — era artefato de só olhar detecções acima do limiar. Ver seção 5,
> reescrita. As seções 4 (negativo), 6 (memória) e 10-11 (novas) também mudaram.
>
> **Veredito: INCONCLUSIVO, encostado na reprovação.** O critério de precisão
> passou com folga (**zero** falso positivo real em 225 páginas). O critério de
> recall **não** foi alcançado em nenhum dos dois domínios — 62,5% no público e
> 66,7% no local, contra a meta de ~80% —, mas os intervalos de Wilson ainda
> encostam nos 80%, e a regra fixada na Etapa 0 manda chamar isso de
> inconclusivo, não de reprovado. **A decisão é do Thiago.**

---

## 1. Ambiente

| item | valor |
|---|---|
| máquina | MacBook 2016, Intel Core m3-6Y30 @ 0,90 GHz, 4 CPUs |
| macOS | 13.7.8 (22H730), x86_64 |
| Python | 3.11.9, venv isolado (`venv_layout`), fora do `.venv` do projeto |
| onnxruntime | **1.23.2** (wheel `cp311-macosx_13_0_x86_64`, o último para x86_64) |
| numpy | **2.2.6** — compatibilidade verificada antes de medir (import + `OrtValue` round-trip) |
| pymupdf | 1.28.2 (render a 200 DPI, igual ao `RENDER_DPI` de produção) |

**Throttling (padrão da Fase 4.15)**: `pmset -g therm` reportou
`CPU_Speed_Limit = 50` no início e **45** durante a corrida — a máquina estava
com o relógio cortado pela metade o tempo todo. Os tempos da seção 6 são,
portanto, **pessimistas**; não foram normalizados.

## 2. Passo 1 — o modelo em ONNX: o que bloqueou e como saiu

O peso oficial **não** é ONNX. `PaddlePaddle/PP-DocLayout-S` publica só
`inference.json` + `inference.pdiparams` (formato Paddle 3.0/PIR), Apache-2.0.
A PaddlePaddle mantém repositórios `_onnx` oficiais para **V2, V3 e plus-L** —
**não** para o `-S`.

**A conversão local é impossível nesta máquina, e o motivo não é o paddlepaddle.**

| tentativa | resultado |
|---|---|
| `paddlepaddle==3.0.0` | **funciona** — existe wheel `cp311-macosx_10_9_x86_64`, instalou e rodou inferência |
| `paddle2onnx` (1.3.1, 2.0.1, 2.0.2rc3, 2.1.0) | **quebrado para x86_64** |

Todas as wheels de macOS do `paddle2onnx` são publicadas com a tag
`macosx_12_0_universal2`, mas o binário dentro delas é **arm64 puro**:

```
$ lipo -archs paddle2onnx_cpp2py_export.cpython-311-darwin.so
arm64                       # nas quatro versões testadas
```

O pip instala sem reclamar (a tag mente) e só estoura no `dlopen`. Não é
limitação do projeto, é **empacotamento errado no PyPI**.

### A saída: exportação de terceiro, verificada numericamente

Usei [`stefanj0/PP-DocLayout-S-ONNX`](https://huggingface.co/stefanj0/PP-DocLayout-S-ONNX),
Apache-2.0, declarado como export do checkpoint oficial.

```
sha256  33688dbee1c23e34b81777e97cb428eb40f24b242c02b5f623484959e830aec8
bytes   4.917.852
```

O repositório tem **0 downloads** e autor desconhecido — checksum sozinho não
prova nada, porque prova só que o arquivo não mudou, não que ele é o modelo
certo. Como o `paddlepaddle` **roda** aqui, deu para fazer a prova de verdade:
rodei o checkpoint oficial e o ONNX **sobre o mesmo tensor de entrada** e
comparei saída com saída.

| comparação | resultado |
|---|---|
| classes preditas | **idênticas** |
| maior diferença de score | **8,3 × 10⁻⁷** |
| maior diferença de coordenada | **0,001 px** |

É o mesmo modelo, dentro do ruído de ponto flutuante. A procedência fica
estabelecida por equivalência numérica contra o peso oficial, não por confiança
no autor do upload.

**Repetido em escala (2026-09-25)**, porque um tensor só não é evidência: as
**26 páginas positivas** mais **20 negativas** (14 do Gil-208 espalhadas + 2 de
cada um dos três scanners), com as duas engines recebendo o **mesmo** `.npy`
pré-processado.

| | valor |
|---|---|
| páginas comparadas | **46** (26 positivas + 20 negativas) |
| linhas de detecção comparadas | **4.414** |
| páginas com nº de linhas diferente | **0** |
| páginas com classe diferente | **0** |
| maior diferença de score | **1,4 × 10⁻⁶** |
| maior diferença de coordenada | **3,8 × 10⁻³ px** |

Em 4.414 detecções não há **uma** divergência de classe. A equivalência está
estabelecida sobre o corpus inteiro, não sobre um caso.

Conferido também, contra o `inference.yml` oficial: **23 categorias na mesma
ordem**, entrada **480×480**, e os nomes de nó `p2o.pd_op.*` (assinatura do
`paddle2onnx`).

### Pré e pós-processamento, lidos da configuração oficial

Do `inference.yml`, não de suposição:

- `Resize` para **480×480**, `keep_ratio: false`;
- `NormalizeImage` com `is_scale: true` (÷255) e ImageNet
  (`mean=[0.485,0.456,0.406]`, `std=[0.229,0.224,0.225]`);
- `Permute` (HWC→CHW);
- **`NMS` vem no grafo.** O nó `NonMaxSuppression.0` está presente no ONNX —
  a supressão de caixas sobrepostas **não** precisa ser implementada.
  `score_threshold: 0.3`, `nms_threshold: 0.5`, `keep_top_k: 100`.

## 3. Passo 2 — regras, fixadas antes de medir

Gravadas no cabeçalho do script antes da primeira execução.

- **Limiar de decisão: 0,50** — o `draw_threshold` da configuração oficial.
  Não foi ajustado olhando o corpus. O grafo já corta em 0,30 (NMS), então 0,30
  é o piso do que sai; os outros limiares aparecem na seção 5 **como dado
  extra**, e não decidem nada.
- **Acerto**: `IoU ≥ 0,50` **e** tipo compatível. `figura ↔ {image, chart}` —
  o modelo **não tem** classe `figure`; `tabela ↔ {table}`. Subtipo não precisa
  bater (idêntico ao README §5 da Etapa 0).
- **Legenda não conta**: `figure_title`, `chart_title`, `table_title` ficam fora
  do recall.
- **Falso positivo**: qualquer detecção de `{image, chart, table}` em página
  negativa — **inspecionada com render antes de ser contada**.
- Recall **sempre separado por domínio**, nunca somado, sempre com Wilson 95%.

## 4. Resultado do Portão 1

### Recall — critério 1, NÃO atingido

| domínio | acertos | recall | IC95 (Wilson) | contra a meta de ~80% |
|---|---|---|---|---|
| público (≤1930) | 10/16 | **62,5%** | [38,6% – 81,5%] | abaixo; IC ainda toca 80% |
| local (moderno) | 10/15 | **66,7%** | [41,7% – 84,8%] | abaixo; IC ainda toca 80% |

Nunca somados: são 31 objetos em dois domínios diferentes.

Por tipo visual (N minúsculo — os intervalos são enormes de propósito, para não
deixar ninguém ler ponto sem incerteza):

| tipo | público | IC95 | local | IC95 |
|---|---|---|---|---|
| foto | 4/5 (80%) | [38–96%] | 4/6 (67%) | [30–90%] |
| gráfico | **0/3 (0%)** | [0–56%] | 3/4 (75%) | [30–95%] |
| line-art | 3/3 (100%) | [44–100%] | 0/1 (0%) | [0–79%] |
| tabela | 3/5 (60%) | [23–88%] | 3/4 (75%) | [30–95%] |

### Falso positivo — critério 2, ATINGIDO

225 páginas, 5 produtores de scan. O modelo disparou 12 detecções visuais em
9 páginas. **Inspecionei as 9 com render, uma a uma, antes de contar** — como
a regra mandava. Resultado:

| página | o que o modelo achou | é erro? |
|---|---|---|
| gil208 idx5 | logotipo **abdr** no rodapé | **não** — logo real |
| gil208 idx24 | **Figura 1.1**, fluxograma | **não** — figura real |
| gil208 idx88 | **Quadro 7.1** e **Quadro 7.2** | **não** — 2 tabelas reais |
| gil208 idx89 | **Quadro 7.5** | **não** — tabela real |
| gil208 idx90 | **Quadro 7.6** | **não** — tabela real |
| gil208 idx123 | **Tabela 11.1** | **não** — tabela real |
| gil208 idx169 | tabela comparativa | **não** — tabela real |
| gil208 idx180 | **Figura 20.2**, formulário | **não** — tabela real |
| gil208 idx190 | **Tabela 1** (IBGE) | **não** — tabela real |

**Zero falso positivo real em 225 páginas.** As 18 páginas dos três scanners
novos e a página do `corpus_local` não tiveram nenhuma detecção. A precisão do
modelo neste corpus é excelente.

**Corpus negativo corrigido (2026-09-25).** As 9 páginas com objeto visual real
saem do corpus negativo, que passa de 225 para **216 páginas** (197 do Gil-208 +
18 dos três scanners + 1 do `corpus_local`). Sobre esse corpus limpo:

| | valor |
|---|---|
| falsos positivos | **0 em 216 páginas** |
| taxa de página com FP | 0,00%, IC95 de Wilson **[0,00% – 1,75%]** |

As 9 **não** entram como positivas. Foram encontradas **pelo próprio modelo**;
promovê-las a gabarito faria o recall ser medido contra objetos que o modelo já
provou que enxerga — corpus de ajuste disfarçado de corpus de teste.

### O corpus negativo está contaminado — e a Etapa 0 previu isso

Nenhuma das 9 é erro do modelo: **são figuras e tabelas reais dentro do
corpus que estava marcado como negativo**. A afirmação herdada do 18º episódio
do TRACE — "a pg. 178 é a única figura de conteúdo real do corpus escaneado" —
é **falsa**. O Gil-208 tem pelo menos 9 páginas com objeto visual real, e
provavelmente mais (essas são só as que o modelo viu).

O README §4 da Etapa 0 tinha escrito, palavra por palavra: *"Se a Etapa 1
acusar falso positivo no Gil-208, inspecionar a página antes de contá-la como
erro."* Foi exatamente o que aconteceu. Se eu tivesse contado sem olhar, teria
reprovado o modelo por 12 erros que ele não cometeu.

## 5. Onde o recall se perdeu — as 11 falhas, revisadas

**A primeira versão desta seção estava errada.** Ela dizia que em 5 das 11
falhas o modelo "não achou nada". Esse diagnóstico só olhava as detecções
**acima do limiar de 0,50** — e por isso não via o que o modelo tinha produzido
abaixo dele. Refazendo a conta sobre **todas** as detecções, em qualquer score:

| domínio | página | tipo | melhor caixa (qualquer score) | diagnóstico |
|---|---|---|---|---|
| público | portos idx0 | tabela | IoU **0,85** @ 0,78 | **tipo trocado** — `image` em vez de `table` |
| público | tecnica idx0 | tabela | IoU **0,64** @ 0,55 | **tipo trocado** — `image` em vez de `table` |
| público | tecnica idx1 | gráfico | IoU **0,76** @ **0,21** | caixa certa **abaixo do limiar** |
| local | 463485 idx0 | foto (casa) | IoU **0,87** @ **0,35** | caixa certa **abaixo do limiar** |
| local | 463754 idx6 | gráfico | IoU **0,76** @ **0,34** | caixa certa **abaixo do limiar** |
| local | 463485 idx0 | foto (retrato) | IoU **0,71** @ **0,28** | caixa certa **abaixo do limiar** |
| local | 463972 idx10 | tabela | IoU **0,63** @ **0,19** | caixa certa **abaixo do limiar** |
| local | 463639 idx3 | line-art | IoU **0,55** @ **0,32** | caixa certa **abaixo do limiar** |
| público | tecnica idx1 | gráfico | IoU 0,45 @ 0,49 | ninguém passa de 0,50 |
| público | tecnica idx1 | gráfico | IoU 0,41 @ 0,47 | ninguém passa de 0,50 |
| público | tecnica idx0 | foto | IoU 0,38 @ 0,20 | ninguém passa de 0,50 |

**Decomposição completa, somando 11:**

| diagnóstico | n |
|---|---|
| caixa certa (IoU ≥ 0,50) **abaixo** do limiar de 0,50 | **6** |
| tipo trocado (`table` saindo como `image`; IoU 0,64 e **0,85**) | **2** |
| gabarito largo — a caixa do modelo cobre o objeto melhor que a minha (IoU 0,38) | **1** |
| quase passa nos dois eixos — gráficos de oscilógrafo (IoU 0,41 @ 0,47 e 0,45 @ 0,49) | **2** |
| **não-detecções** | **0** |
| **total** | **11** |

**"Zero não-detecções" quer dizer, precisamente**: nenhum dos 31 objetos do
corpus ficou sem caixa candidata **em nenhum limiar**. Varrendo todas as
detecções das classes visuais em qualquer score, o pior objeto do corpus tem
uma caixa com **IoU 0,382**, e nenhum tem IoU 0. O modelo não deixou de ver
nada — o que falhou foi passar do corte ou acertar o rótulo.

Em **8 das 11** o modelo desenhou uma caixa com IoU ≥ 0,50 sobre o objeto certo
e a perdeu por confiança baixa (6) ou rótulo errado (2).

### O modo de falha real: caixa grossa com confiança alta, caixa certa com confiança baixa

Nos 6 casos de "abaixo do limiar", o padrão é o mesmo. Na página `463485`, por
exemplo, o modelo emite **uma** caixa `image` de score 0,588 que engole o
retrato, o título, a foto da casa e as duas legendas num bloco só — e emite
**também** as caixas justas de cada foto, com score 0,28 e 0,35. O limiar de
0,50 fica exatamente entre as duas: passa a caixa grossa, corta as certas.

| objeto | caixa que passou (≥0,50) | caixa certa (cortada) |
|---|---|---|
| retrato | `image` 0,588 — IoU 0,11, **8,7×** maior que o objeto | `image` 0,279 — IoU **0,71** |
| foto da casa | `image` 0,588 — IoU 0,42 | `image` 0,346 — IoU **0,87** |
| diagrama da bomba | `image` 0,517 — IoU 0,31, engloba diagrama + chave + aviso | `image` 0,315 — IoU **0,55** |

Isso muda a leitura do resultado. O problema deste modelo neste corpus **não é
enxergar o objeto** — é *calibração de confiança* em material de 1915 e de
celular, e *granularidade* (fundir figura com legenda). São defeitos de natureza
diferente de "o modelo não serve", e de custo de correção diferente.

**Continua valendo que nada disso muda o Portão 1.** O número do portão
continua sendo o de 0,50, e é 62,5% / 66,7%.

**E não, baixar o limiar não é uma saída disponível aqui.** Recuperar as 6
caixas certas que ficaram abaixo de 0,50 exigiria mexer no corte **depois** de
ter visto onde elas caem — isto é, **calibrar no gabarito do próprio Portão 1**,
que é exatamente o que a regra da Etapa 0 proíbe. O número deixaria de medir o
modelo e passaria a medir o ajuste. Qualquer mexida em limiar — para cima ou
para baixo — só vale medida contra um **corpus de validação separado deste**,
montado antes e nunca usado para escolher o valor. Enquanto esse corpus não
existir, o limiar fica no 0,50 oficial.


### As 2 caixas do gabarito que estão largas

Duas das falhas acima são, em parte, imprecisão da minha anotação — a caixa do
modelo cobre o objeto melhor que a minha. Conferido contra o
`revisao/…_idx0.jpg` que você aprovou: são as mesmas caixas do JSON, então não
é bug de coordenada. **Não foram redesenhadas** — mexer no gabarito depois de
ver o resultado é calibrar no teste.

## 6. Desempenho nesta máquina

251 páginas medidas, com a CPU limitada a 45–50%.

| métrica | valor | comparação |
|---|---|---|
| inferência, mediana | **≈ 0,57 s/página** | **~10× mais barato** que os 6,08 s/página do OCR |
| inferência, p90 | **≈ 0,89 s/página** | |
| carga do modelo | **≈ 1,2 s**, uma vez por processo | |
| pico de RSS | **425–447 MB** | **atenção** — ver abaixo |
| render 200 DPI | ≈ 1,28 s/página | custo já pago hoje pelo caminho de OCR |

O tempo é bom: somar detecção ao pipeline custaria cerca de **+9%** sobre o
tempo de OCR de uma página, e o render não é custo novo.

### Memória, decomposta (2026-09-25)

A primeira rodada reportou "pico de 425–447 MB" e comparou com os ~282 MB do
pipeline. **A comparação estava errada**: os ~282 MB do projeto são
`peak memory footprint` (métrica Mach), e os 425–447 MB eram `maxRSS`. São
métricas diferentes — o próprio pipeline tem maxRSS de 383,7 MiB (80 pg) e
449,0 MiB (208 pg). Refeito medindo as duas, e com um controle.

**De onde vem cada parte** (RSS acumulado, antes do laço):

| etapa | RSS | delta |
|---|---|---|
| python nu | 9,1 MB | |
| + numpy | 20,0 MB | +10,9 |
| + pillow | 22,2 MB | +2,2 |
| + pymupdf | 51,2 MB | +29,0 |
| + onnxruntime (import) | 63,4 MB | +12,2 |
| **+ sessão ONNX criada** | **76,9 MB** | **+13,5** |
| + 1 render a 200 DPI | 138,2 MB | **+61,4** |
| + 1ª inferência | 138,7 MB | +0,4 |

Carregar o modelo custa **~25,7 MB** (import + sessão) e cada inferência
acrescenta ~0,4 MB. **Um render de página a 200 DPI custa mais que o modelo
inteiro.**

**Fica constante?** Sim. Rodando 197 páginas seguidas, o RSS estabiliza e não
cresce:

| após | 24 | 48 | 96 | 144 | 192 | 197 |
|---|---|---|---|---|---|---|
| RSS (MB) | 419 | 386 | 390 | 394 | 394 | 392 |

Platô em ~390 MB desde a página 24. Sem vazamento, sem crescimento com o número
de páginas — a invariante de RAM constante se mantém.

**Quanto custa de verdade** — mesmo laço, mesmas 197 páginas, com e sem o
detector, medido com `/usr/bin/time -l`:

| | só render | render + detector | **custo do detector** |
|---|---|---|---|
| `maximum resident set size` | 475,3 MiB | 449,5 MiB | ~0 (ruído do alocador) |
| **`peak memory footprint`** | **294,1 MiB** | **410,5 MiB** | **+116,4 MiB (+40%)** |

O controle valida o método: o laço só-render dá 294,1 MiB de peak footprint,
perto dos **281,9 MiB** que o projeto mediu no pipeline real — ou seja, o
harness é comparável à linha de base.

**A conclusão é desconfortável.** Os ~26 MB da sessão ONNX não explicam os
+116 MiB de peak footprint. A diferença é do **alocador de arena do
onnxruntime**, que reserva e segura memória além do peso do modelo. E
`ARCHITECTURE.md` fixa como referência de regressão: *"pico de RAM não deve
passar de ~300MB (peak memory footprint)"*. Com o detector, o pico vai a
**410,5 MiB — a referência de regressão seria rompida**.

Existe caminho conhecido para reduzir isso (configurar a arena do onnxruntime:
`arena_extend_strategy`, ou desligar a arena). **Não foi tentado** — é
otimização, e esta rodada é de medição. Fica como a pendência principal se a
direção for adiante.

## 7. Fora do portão — dados que pedem leitura à parte

### Rotação: o defeito de orientação é caro

As **11 páginas do `corpus_local` que precisaram de correção de rotação**,
medidas nas duas versões (caixas do modelo giradas de volta para o referencial
do gabarito, para a comparação ser honesta):

| versão | acertos |
|---|---|
| corrigida (o gabarito) | **9/13** |
| torta, como saiu do celular | **2/13** |

**O recall cai para menos de um quarto.** Em 5 das 11 páginas tortas o modelo
não achou **nada**. Isso põe número no defeito aberto registrado na Fase 4.24:
sem correção de orientação, detecção de figura em material de celular não
funciona — e, como o OSD do Tesseract já se mostrou inconfiável (confiança
0,55–33,5, errando um caso), **corrigir orientação é pré-requisito**, não
melhoria opcional.

### Sanidade: página-figura inteira (Fase 4.21)

| caso | resultado |
|---|---|
| Gil idx178 (Gantt, rotacionado 90°) | **achou** — `chart` 0,64 |
| FDE idx27 | **achou** — `chart` 0,68 |
| FDE idx28 | nada |

Os dois casos conhecidos de página-figura foram detectados, e como `chart`, o
rótulo certo. Coerente com a Fase 4.21.

### Recall em outros limiares (dado extra, não decide)

| limiar | público | local |
|---|---|---|
| 0,30 (piso do NMS) | 12/16 | 13/15 |
| 0,40 | 11/16 | 11/15 |
| **0,50 (portão)** | **10/16** | **10/15** |
| 0,60 | 9/16 | 8/15 |
| 0,70 | 8/16 | 4/15 |

A 0,30 o local chegaria a 13/15 (86,7%). **Isso não aprova nada**: baixar o
limiar depois de ver o corpus é calibrar no gabarito, que é exatamente o que a
regra proíbe. Está aqui só para mostrar que a curva existe e que o custo de
mexer nela é falso positivo, que teria de ser medido de novo.

## 8. Veredito

| critério | meta | resultado | passa? |
|---|---|---|---|
| recall, público ≤1930 | ~80% | 62,5% [38,6–81,5%] | **não** |
| recall, local moderno | ~80% | 66,7% [41,7–84,8%] | **não** |
| falso positivo | ~0 | **0 real** em 225 páginas | **sim** |

**INCONCLUSIVO.** Os dois recalls ficam claramente abaixo da meta no ponto, e
os dois intervalos de Wilson ainda **cruzam** os 80% — e a regra da Etapa 0 diz,
literalmente, que resultado cujo IC cruza os 80% é inconclusivo, não aprovado.
Com N=16 e N=15 a amostra não resolve a questão.

Nada foi ajustado para forçar aprovação: o limiar continua no 0,50 oficial, o
gabarito continua como você confirmou, e as 9 páginas de falso positivo foram
inspecionadas em vez de contadas no escuro.

**O que o número esconde, e que pesa na sua decisão**: das 11 falhas, só 5 são
"o modelo não viu o objeto". Duas são rótulo errado com localização boa (uma
delas IoU 0,85), duas são folga do meu gabarito, e duas são fusão de figura com
sua legenda. E a precisão foi perfeita. Isso é um perfil de erro muito
diferente de "o modelo não serve" — mas **corrigir qualquer um desses itens
exige medir de novo**, com corpus maior, e não é decisão que eu deva tomar
sozinho.

## 9. Recall sem distinção de tipo — **pós-hoc, não altera o portão**

> **Declarado como pós-hoc.** Esta métrica está aqui porque, **no Foliant**,
> tabela e figura teriam a **mesma ação**: embutir como imagem. Uma tabela
> detectada como `image` levaria ao resultado certo na prática. Mas isto foi
> decidido **depois** de ver o resultado, então **não vale como critério do
> Portão 1** — vale como leitura de produto.

| domínio | portão (tipo exigido) | pós-hoc (tipo ignorado) |
|---|---|---|
| público (≤1930) | 10/16 = 62,5% [38,6–81,5%] | **12/16 = 75,0%** [50,5–89,8%] |
| local (moderno) | 10/15 = 66,7% [41,7–84,8%] | 10/15 = 66,7% [41,7–84,8%] |

Só o domínio público muda — as duas confusões `table`→`image` estão lá. Mesmo
assim, **continua inconclusivo**: o IC de [50,5%–89,8%] cruza os 80% com folga
dos dois lados.

## 10. Revisão do critério para a próxima medição — **feita depois de ver o resultado**

> **Declarado.** O que segue foi formulado **após** conhecer o resultado da
> medição. Por isso **não** se aplica ao Portão 1 desta rodada, que continua
> julgado pela regra original. Vale a partir da próxima medição.

O corte fixo de "recall ≥ ~80%" foi herdado do desenho da Etapa 0, quando não
se sabia o custo de errar. Com a invariante das Fases 4.20/4.21 — **embutir a
figura sem remover o texto** — os dois erros possíveis são baratos e
assimétricos ao contrário do que um corte de recall pressupõe:

| erro | consequência real no EPUB |
|---|---|
| **figura não detectada** | **status quo** — o leitor fica com o que já tem hoje; nada piora |
| **falso positivo** | uma **imagem redundante** embutida; o texto continua lá, legível |

Nenhum dos dois corrompe o livro. Um corte fixo de recall trata "não detectar"
como reprovação, quando na verdade é empate com o estado atual.

**A decisão futura deve pesar ganho × custo**, não um número único:

- **ganho**: quantas figuras reais passam a ser embutidas, por domínio;
- **custo de tamanho**: +4,8 MB do modelo e +19,2 MB do onnxruntime no sidecar;
- **custo de memória**: **+116 MiB de peak footprint**, que rompe a referência
  de regressão de ~300 MB — hoje o item mais caro;
- **custo de procedência**: o único ONNX do `-S` é export de terceiro (embora
  verificado numericamente) e o `paddle2onnx` não roda em x86_64, então
  regerar o peso nesta máquina é impossível;
- **dependência de orientação**: sem corrigir rotação, o recall em material de
  celular cai para 2/13 — o modelo **não se sustenta sozinho** nesse domínio.

## 11. O que a medição deixou como pendência

1. **Corpus negativo corrigido nesta rodada** — as 9 páginas do Gil-208 com
   objeto visual real saíram; ficam **216 negativas, 0 falso positivo**. Elas
   **não** viraram positivas, de propósito (foram achadas pelo modelo).
   Continua sem varredura página a página: pode haver mais figura escondida nas
   197 restantes, que o modelo não viu.
2. **Gabarito com folga** em 2 caixas. Não redesenhadas — seria calibrar no
   teste. Se forem, é corpus novo e medição nova.
3. **Memória decomposta nesta rodada**: +116,4 MiB de peak footprint, que
   **rompe** a referência de regressão de ~300 MB. Reduzir a arena do
   onnxruntime é o caminho conhecido e **não foi tentado**.
4. **Orientação primeiro.** Caminho aprovado: resolver rotação de página antes
   de decidir sobre o modelo. O recall de 2/13 em página torta torna qualquer
   número de detecção condicional a isso.
5. **N pequeno**: com 16 e 15 objetos, qualquer recall tem IC de ~40 pontos.
   Resolver o Portão 1 de verdade pede corpus maior, não medição melhor.

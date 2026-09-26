# Orientação de página — investigação dos candidatos a detecção e correção

**Data**: 2026-09-25. Pré-requisito da decisão sobre o PP-DocLayout-S
(ver `PORTAO1_PP_DOCLAYOUT_S_2026.md`, seção 7, e o defeito aberto da Fase 4.24).
**Escopo**: investigação. Nada em `foliant.py`, em `desktop/` ou no `.venv` foi
alterado. Script: [scripts/pesquisa_orientacao.py](scripts/pesquisa_orientacao.py);
medições cruas em `scripts/pesquisa_orientacao_resultados/`.

> **Recomendação**: adotar **OSD do Tesseract (`--psm 0`) sobre a página
> binarizada, a 200 DPI, com veto por texto escasso**. Mede **15/15** nas
> páginas tortas e **0 rotações indevidas em 236** páginas já em pé
> (IC95% [0 %, 1,6 %]). Não acrescenta dependência nenhuma — o Tesseract já
> está instalado e o pixmap a 200 DPI já é renderizado pelo pipeline.
>
> **Três afirmações registradas nos documentos do projeto estavam erradas** e
> são corrigidas aqui com evidência: o OSD *não* errou a página `463802`; o
> OSD *não* é inconfiável; e o corpus do Gil-208 *não* é um caso de "scan
> alinhado por sorte" — ele declara a rotação em `/Rotate` e o PyMuPDF já a
> aplica.

---

## 1. As três checagens de graça, antes de medir candidato nenhum

### 1.1 Etiqueta EXIF de orientação: **não existe neste material**

As 27 digitalizações do `corpus_local` são JPG de celular. Todas as 27 têm
bloco EXIF, e **nenhuma tem etiqueta de orientação válida**: 26 trazem
`Orientation = 0` e uma traz `Orientation = 524288`. Os dois valores estão
**fora da faixa válida 1–8** da especificação EXIF, isto é, são lixo, não
"orientação normal". Não há `Make`, `Model` nem `Software`.

**Consequência**: nada de graça por aqui. A rotação dessas páginas está
**assada nos pixels**, sem metadado que a descreva.

### 1.2 `/Rotate` de PDF: o PyMuPDF respeita, e isso já salva o projeto hoje

Confirmado por experimento direto: com `page.set_rotation(90)`, o
`get_pixmap()` devolve o raster **já girado** (1200×1780 → 1780×1200) e
`page.rect` acompanha. O caminho de render de produção
(`extrair_texto_pagina`) portanto **já corrige** qualquer rotação declarada
em `/Rotate`.

Isso não é hipotético — é o que acontece com o material do próprio usuário:

| PDF | páginas | `/Rotate` |
|---|---|---|
| `samples/livro_completo_208pg.pdf` | 208 | **104 com `/Rotate 180`**, 104 com 0 |
| `samples/001-080.pdf` | 80 | 39 com 180, 41 com 0 |
| `samples/081-160.pdf` | 80 | 41 com 180, 39 com 0 |
| `samples/161-208.pdf` | 48 | 24 com 180, 24 com 0 |

O digitalizador alternou o sentido das páginas e **registrou isso em
`/Rotate`**. Das 206 páginas do Gil-208 usadas aqui como controle negativo,
**104 carregam `/Rotate 180`** — e todas renderizam em pé.

**Isto corrige uma leitura registrada no TRACE** ("acervo digitalizado
profissionalmente é alinhado"): o Gil-208 não está alinhado no arquivo, ele
está **declarado**. O pipeline acerta essas 104 páginas porque o PyMuPDF
aplica o `/Rotate`, não porque o scan saiu reto.

### 1.3 PDF gerado por app de celular: **não testado, por falta de amostra**

O material da persona chegou como **JPG**, não como PDF de app. Os PDFs do
`corpus_local` foram montados pelo próprio projeto na Etapa 0, a partir das
imagens **já corrigidas**, e por isso têm `/Rotate 0` — não dizem nada sobre
o que um app de celular produz.

Fica **em aberto**, e é barato de fechar: basta uma página exportada como PDF
pelo app que o usuário usa, e conferir se a rotação veio em `/Rotate` (caso
1.2, já resolvido) ou assada nos pixels (caso 1.1, que exige detecção).

---

## 2. O gabarito — e a circularidade que precisou ser desfeita antes de medir

O `manifesto_local.json` diz, com todas as letras, que a rotação de cada
página foi **"proposta pelo OSD do Tesseract (--psm 0) e conferida
visualmente uma a uma"**. Medir o OSD contra esse gabarito mede o OSD **no
corpus que ele mesmo ajudou a montar**. A conferência a olho garante que os
*rótulos* estão certos, mas não desfaz o viés de **seleção**: páginas em que
o OSD tropeçou podem ter saído do corpus por outro motivo.

Duas providências:

**(a) As 6 páginas descartadas na Etapa 0 entraram nesta medição.** Foram
descartadas por **conteúdo** (figura ocupando a página inteira, sem prosa em
volta), não por orientação. A rotação verdadeira delas foi estabelecida
**por inspeção visual nesta rodada**, sem consultar o OSD:

| página | rotação verdadeira | o que é |
|---|---|---|
| `1790222463802` | **0°** | TABELA 1, página em formato paisagem |
| `1790222463832` | **0°** | QUADRO 1, tabela impressa girada dentro da página |
| `1790222463873` | **0°** | QUADRO 1, tabela horizontal |
| `1790223220989` | **90°** | foto de Pollock, legenda vertical |
| `1790223221066` | **90°** | montagem de fotos, título vertical |
| `1790223221102` | **90°** | montagem de fotos, legendas verticais |

Isso somou 3 páginas tortas e — o que importa mais — **3 páginas em pé do
tipo mais difícil que existe**: formato paisagem, quase só tabela, prosa
escassa. **As duas únicas rotações indevidas de toda a medição saíram
justamente dessas três.** Sem elas, o OSD teria marcado 0 erro em 233 e
pareceria perfeito.

**(b) A reconstrução da página torta é exata, não aproximada.** Cada página
torta foi remontada girando a página corrigida por múltiplo de 90° — que é
permutação de pixels, sem reamostragem. A conferência por correlação com o
JPG original deu **1,000 em 12 de 12** (0,999 numa). A inclinação leve, a
sombra e a perspectiva da foto original **continuam lá**; só o enquadramento
de 90° foi desfeito. Não é rotação sintética de página de acervo.

De quebra, isso mostrou que a coluna `rotacao_aplicada_graus` usa a
**convenção horária**, oposta à do PIL — os 90° do manifesto são os 270° do
`Image.rotate`. O manifesto está internamente correto; quem for usá-lo
precisa saber disso.

### A página `463802` não precisou de correção nenhuma no corpus

A suspeita natural, depois de descobrir que a página está em pé, é que a
Etapa 0 a tenha girado indevidamente. **Não girou.** Estado dela no
`corpus_local`, verificado item a item:

| verificação | resultado |
|---|---|
| grupo no manifesto | `descartadas` (só lá) |
| campo `rotacao_aplicada_graus` | **ausente** — nunca foi preenchido |
| caixas em `anotacoes_local.json` | **0** (as 13 anotadas não a incluem) |
| presença nos 3 PDFs do corpus | **nenhuma** |
| medida pelo PP-DocLayout-S | **não** |

Ela foi descartada **antes** da etapa de rotação, por conteúdo ("TABELA 1
ocupa a página inteira, sem texto corrido" — classe da Fase 4.21). Logo:
não há PDF a regerar, não há campo a corrigir, não há caixa a reavaliar, e
**os números do Portão 1 não mudam**. O erro foi só de narrativa, não de
dado.

### Reconciliação das contagens: 12 de 20 (Etapa 0) × 15 tortas (aqui)

Os dois números estão certos, em escopos diferentes:

| grupo do manifesto | n | tortas | como a Etapa 0 contou | como esta rodada conta |
|---|---|---|---|---|
| `positivas` | 13 | **11** (3×180, 3×90, 5×270) | ✅ contadas | ✅ contadas |
| `negativa_extra` | 1 | **1** (270) | ✅ contada | ✅ contada |
| `descartadas` | 7¹ | **3** (90°) | ❌ rotação **nunca registrada** | ✅ rotuladas por inspeção visual |
| `brancas_com_sombra` | 7 | 0 | — | ✅ controle negativo |
| **total** | | | **12 de 20**² | **15 tortas** |

¹ uma das 7 (`221132`) é a própria `negativa_extra`, reaproveitada em vez de
descartada — por isso 13 + 1 + 7 − 1 = **20 "páginas úteis"**.
² 11 + 1 = 12, e o detalhe "3× 180°, 3× 90°, 6× 270°" do TRACE bate exato.

**A diferença é inteira das descartadas**: como o campo de rotação nunca foi
preenchido para elas, as 3 páginas tortas ali dentro ficaram fora da conta da
Etapa 0. 12 + 3 = **15**.

### Composição final

| grupo | n | verdade |
|---|---|---|
| `rot_real` — foto de celular, torta | **15** | 6× 90°, 3× 180°, 6× 270° |
| `ctrl_gil` — Gil-208 (104 com `/Rotate 180`) | 206 | 0° |
| `ctrl_ia` — negativas do Internet Archive | 18 | 0° |
| `ctrl_branca` — em branco com sombra | 7 | 0° |
| `ctrl_local0` + 3 descartadas em pé | 5 | 0° |
| **total em pé (controle negativo)** | **236** | 0° |
| `sintetico` — acervo girado 90/180/270 | 60 | exato |

---

## 3. Candidato 1 — OSD do Tesseract (`--psm 0`)

Nenhuma dependência nova: o binário já é exigido em `REQUIRED_BINARIES`.

### 3.1 Resultado, por variante de pré-processamento (200 DPI, 251 páginas)

| variante | tortas | rot. **indevida** | falha em pé | s/página |
|---|---|---|---|---|
| cru | **15/15** | 2/236 | 21 | 2,73 |
| **binarizado (Otsu)** | **15/15** | 2/236 | 22 | **2,11** |
| margem (corte de 8 %) | 14/15 | 2/236 | 21 | 2,31 |
| binarizado + margem | **15/15** | 2/236 | 21 | **1,87** |

As quatro variantes propõem a rotação indevida **nas mesmas duas páginas**
(`463832` e `463873`) — o erro é da página, não do pré-processamento. A
binarização por Otsu **corta 23 % do tempo sem custar acerto**.

### 3.2 A confiança do OSD **não** separa acerto de erro

| grupo | n | mín | mediana | máx |
|---|---|---|---|---|
| tortas, acertou | 15 | 1,82 | 4,70 | 19,88 |
| em pé, acertou 0° | 213 | 1,11 | 28,64 | 38,13 |
| em pé, **rotação indevida** | 2 | 0,02 | 1,43 | 2,83 |

As duas indevidas (0,02 e 2,83) caem **dentro** da faixa das tortas corretas
(1,82–19,88). Varrendo o limiar:

| limiar de confiança | tortas corrigidas | rot. indevidas |
|---|---|---|
| sem limiar | 15/15 | 2 |
| ≥ 2,0 | 14/15 | 1 |
| ≥ 3,0 | 12/15 | **0** |
| ≥ 4,0 | 9/15 | 0 |

Zerar a rotação indevida por confiança custa **3 das 15 tortas**. É o
instrumento errado — e é por isso que o veto da seção 5 existe.

### 3.3 DPI: 200 é o ponto certo, e é o que produção já renderiza

| DPI | tortas | rot. indevida | s/página |
|---|---|---|---|
| 100 | 7/15 (6 erradas) | **31/236** | 2,22 |
| **200 (produção)** | **15/15** | **2/236** | 2,73 |
| 300 (só nas 21 locais) | 12/12 | 0/9 | 2,52 (vs 1,85 a 200) |

A 100 DPI o sinal **desmorona** e economiza 0,5 s. A 300 DPI não melhora nada
e custa mais. A 200 DPI o OSD **reaproveita o pixmap que o pipeline já
renderiza** — custo de render adicional: zero.

### 3.4 Páginas em branco: o OSD falha nas 7, e falhar é seguro

Falha do OSD (`Too few characters`) significa **nenhuma proposta de rotação**,
ou seja, página não girada. Nas 7 em branco com sombra o OSD falhou nas 7 —
resultado correto pelo critério que importa (não estragar). O mesmo aconteceu
em 14 páginas do Gil-208, todas em branco ou quase.

**Mas falha do OSD ≠ página em branco**: das 21 falhas em páginas em pé, 7 são
brancas e 14 são do Gil. Quem for usar esse sinal para outra coisa precisa
separar os dois casos, como o TRACE já avisava.

### 3.5 Rotação sintética (caso fácil, gabarito exato)

Em 60 rotações sintéticas de páginas de acervo já em pé: **60/60**, mediana de
confiança **28,44**.

Comparar com a mediana de **4,70** nas páginas de celular é o dado
importante: **material limpo é fácil e confiante; foto de celular é certa mas
pouco confiante**. Um limiar de confiança calibrado em acervo reprovaria
quase toda a página de celular. As rotações sintéticas **não** reproduzem
inclinação leve nem perspectiva — medem o caso fácil, e é assim que devem ser
lidas.

---

## 4. Candidato 2 — comparação por OCR

Roda o OCR em mais de uma orientação e fica com a que produz melhor texto.
A premissa era ser **autovalidante**. Ela se sustenta só em parte.

### 4.1 Sem margem de segurança, é ruim

Escolhendo o ângulo de maior escore, sem exigir margem (85 páginas medidas):

| escore | resolução | tortas | rot. indevida |
|---|---|---|---|
| confiança média | 200 DPI | 5/15 | 28/70 |
| `n_conf60` | 200 DPI | 10/15 | 6/70 |
| `n_conf60` | 100 DPI | 12/15 | 14/70 |
| frac. léxico × n | 100 DPI | 12/15 | 11/70 |

**Uma rotação errada vence com frequência.** A autovalidação sozinha não
protege contra o erro caro.

### 4.2 Com piso e margem, fica seguro — e fraco

Melhor ponto conservador (`n_conf60` a 100 DPI, piso 20, margem 25 %):
**10/15 tortas, 0/70 indevidas**. Seguro, mas perde 5 tortas e custa
**4 × OCR = 10,3 s/página** (a 100 DPI) ou 18,7 s (a 200 DPI), **em toda
página**, contra 2,11 s do OSD.

### 4.3 Páginas em branco: nunca são giradas

Em **nenhuma** configuração testada a comparação por OCR girou uma das 7
páginas em branco. Ponto a favor dela — e a razão de o veto da seção 5
herdar exatamente esse mecanismo.

### 4.4 A variante barata **não funciona**, e o motivo é grave

A ideia era acionar a detecção só quando o primeiro OCR viesse com confiança
baixa. **O primeiro OCR não denuncia página torta:**

| métrica no OCR a 0° | tortas (n=15) | em pé com texto (n=63) |
|---|---|---|
| confiança média | mediana **74,54**, máx 88,30 | p10 81,39, mediana 93,26 |
| `n_conf60` | mediana 81 | p10 138, mediana 322 |

Uma página de lado sai do Tesseract com **confiança média de 74,5** — dentro
da faixa das páginas boas. Nenhum corte útil existe: a `conf_media < 65` pega
7 das 15 tortas e já aciona 7 páginas boas; `n_conf60 < 20` pega 2 de 15.

**É a quarta aparição do mesmo buraco** (19º episódio, Fase 4.15, Fase 4.24):
o pipeline sabe distinguir "nenhum texto" de "algum texto", e continua sem
saber distinguir **texto de lixo**. Aqui isso tem consequência de custo: não
dá para pagar a detecção de orientação só nas páginas suspeitas, porque
**não existe sinal barato de suspeita**.

---

## 5. A combinação recomendada — OSD propõe, texto escasso veta

O erro do OSD tem assinatura: nas duas páginas que ele quis girar
indevidamente, o OCR **no ângulo proposto** produz **0 tokens** com confiança
≥ 60. Nas 15 tortas, no ângulo certo, produz de **15 a 260** (mediana 135).

**Regra**: aceitar a proposta do OSD só se o OCR no ângulo proposto render ao
menos *piso* tokens com confiança ≥ 60.

| piso | tortas | rot. indevidas |
|---|---|---|
| 0 | 15/15 | 2/70 |
| **5** | **15/15** | **0/70** |
| **10** | **15/15** | **0/70** |
| **15** | **15/15** | **0/70** |
| 20 | 13/15 | 0/70 |
| 30 | 12/15 | 0/70 |

O ponto ótimo é um **platô de 5 a 15**, não um fio de navalha — o vão entre
os dois grupos é de 0 a 15 tokens. Qualquer valor nessa faixa dá o mesmo
resultado.

**Extensão para as 236 páginas em pé**: nas 236, o OSD propôs rotação em
**apenas 2**, e as duas estão dentro do subconjunto de 85 páginas em que o
veto foi medido — e são vetadas. Como o veto só pode **reduzir** rotações,
a taxa de rotação indevida do conjunto recomendado nas 236 é **0/236**.

| | valor | IC95% (Wilson) |
|---|---|---|
| acerto nas tortas | 15/15 = 100 % | [79,6 %, 100 %] |
| **rotação indevida** | **0/236 = 0 %** | **[0 %, 1,6 %]** |

**Custo, separado por etapa.** Referência: o OCR de produção mediu
**4,68 s/página** nesta corrida (o 6,08 s da Fase 4.15 é de outra corrida, com
`CPU_Speed_Limit` diferente; nenhum dos dois foi normalizado).

| corpus | n | OSD s/pág | aciona o veto | veto s/pág | **total** | sobre o OCR |
|---|---|---|---|---|---|---|
| **PEREIRA (camada de texto nativa)** | 903 | — | — | — | **0,00 s** | **+0 %** |
| Gil-208 (scan, `/Rotate` declarado) | 206 | 2,19 | **0/206** | 0,00 | **2,19 s** | +47 % |
| negativas do Internet Archive | 18 | 2,00 | **0/18** | 0,00 | **2,00 s** | +43 % |
| celular, em pé | 2 | 2,02 | 0/2 | 0,00 | 2,02 s | +43 % |
| celular, em branco | 7 | 0,40 | 0/7 | 0,00 | **0,40 s** | +9 % |
| celular, torta | 12 | 2,07 | **12/12** | 2,57 | **4,64 s** | +99 % |
| celular, descartadas da Etapa 0 | 6 | 1,75 | 5/6 | 2,14 | 3,90 s | +83 % |
| **agregado: material alinhado** | **224** | **2,18** | **0/224** | **0,00** | **2,18 s** | **+47 %** |
| **agregado: material de celular** | **27** | **1,56** | 17/27 | **1,62** | **3,18 s** | **+68 %** |

Três leituras que mudam o quadro:

**O veto é de graça onde o volume está.** Em 224 páginas de material alinhado
o OSD propôs rotação **zero vezes**, então o veto **nunca rodou**: os +47 %
são **OSD puro**. O veto só cobra onde há rotação para corrigir — e lá ele
compra o 0/236.

**Documento com camada de texto nativa não paga nada.** `extrair_texto_pagina`
sai pelo ramo nativo antes de renderizar pixmap: não há OCR, logo não há
orientação a detectar. Medido no PEREIRA (903 páginas): **41 de 42** páginas
amostradas têm texto nativo. O custo de orientação incide **só sobre PDF
escaneado**, que é o Gil-208 (0 de 42 com texto nativo).

**Página em branco é o caso mais barato**: o OSD falha em 0,40 s por falta de
caractere, contra 2,19 s numa página cheia.

---

## 6. Candidato 3 — perfil de projeção (Pillow, sem dependência)

Separa **eixo** (retrato 0/180 vs paisagem 90/270). **Não separa 0 de 180**,
por construção.

Acerto de eixo: **231/251 (92,0 %)**, a **0,024 s/página** — cem vezes mais
barato que o OSD. Duas decisões vieram de medição:

- **recortar 12 % de margem antes de projetar**. Sem o recorte a variância é
  dominada pela borda da página e pela sombra da lombada: o acerto cai de
  **227/245 para 152/245**.
- **não binarizar**. O Otsu na página inteira pega o fundo cinza do scan
  (19 % de preto numa página de texto limpa) e destrói o sinal.

**Por que não serve de primeira etapa**: dos 20 erros, 14 são páginas **em
branco ou quase** (razão exatamente 1,000 = nenhum sinal) e **2 são páginas
tortas de verdade** — `positivas_6` e `positivas_11`, que são justamente
**páginas com gráfico**. Ele erra onde o PP-DocLayout-S precisa acertar. E
como 3 das 15 tortas são de 180°, que é retrato, o perfil **não elimina a
necessidade do OSD** em página nenhuma: não economiza a chamada, só
economizaria metade das passadas de uma comparação por OCR que já não é a
recomendada.

**Dado colateral útil**: razão ≈ 1,000 exata é marcador barato de página sem
conteúdo. Não confundir com o marcador de falha do OSD (seção 3.4) — são
sinais independentes.

---

## 7. Candidato 4 — PP-LCNet_x1_0_doc_ori (referência, não medido)

Não foi executado: exige `onnxruntime`, que **não está aprovado**, e `numpy`,
que nem está no `.venv`. O que foi verificado, sem instalar nada:

| item | valor |
|---|---|
| peso oficial ONNX | **existe**: `PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx`, `inference.onnx` |
| tamanho | **6.788.069 bytes** (6,5 MiB) |
| licença | **Apache-2.0** |
| classes | 0°, 90°, 180°, 270° |
| acurácia declarada | 99,06 % top-1 |
| inferência CPU declarada | 3,24 ms (CPU de servidor, não esta máquina) |

**Diferença importante em relação ao PP-DocLayout-S**: aqui a PaddlePaddle
publica o **ONNX oficial**. Não há conversão a fazer (o `paddle2onnx` está
quebrado para x86_64, 25º episódio) nem export de terceiro desconhecido para
auditar. O obstáculo do Portão 1 **não se repete** neste modelo.

**Mas o custo de runtime se repete inteiro.** O Portão 1 mediu o
`onnxruntime` em **410,5 MiB de pico (+116 MiB)**, rompendo a referência de
~300 MB. Adotar este modelo **só** para orientação significaria romper a
referência de memória para resolver um problema que o OSD resolve com **0
dependências novas** e 15/15.

**Recomendação sobre ele**: não adotar agora. Se o PP-DocLayout-S for
aprovado um dia, o `onnxruntime` já estará carregado e este classificador sai
quase de graça (+6,5 MiB) — aí vale reavaliar, contra o OSD, com corpus de
validação separado.

---

## 8. Tabela comparativa

| candidato | tortas (n=15) | **rot. indevida** | brancas giradas | s/página | dep. nova |
|---|---|---|---|---|---|
| **OSD binarizado + veto** ⭐ | **15/15** | **0/236** | 0/7 | **2,11** (+2,57 só se propuser) | **nenhuma** |
| OSD binarizado, sem veto | 15/15 | 2/236 (0,8 %) | 0/7 | 2,11 | nenhuma |
| OSD com confiança ≥ 3,0 | 12/15 | 0/236 | 0/7 | 2,11 | nenhuma |
| Comparação por OCR 4× (piso+margem) | 10/15 | 0/70 | 0/7 | **10,3** | nenhuma |
| Comparação por OCR, sem margem | 12/15 | 14/70 (20 %) | 0/7 | 10,3 | nenhuma |
| OCR só se 1º vier ruim | ≤7/15 | — | — | ~0 | nenhuma |
| Perfil de projeção (só eixo) | eixo 231/251 | não decide | — | **0,024** | nenhuma |
| PP-LCNet doc_ori | não medido | não medido | — | não medido | **onnxruntime + numpy** |

## 9. Recomendação, justificada pela assimetria

A assimetria manda otimizar **rotação indevida**, não acerto. Na ordem:

1. **OSD do Tesseract com binarização Otsu, a 200 DPI, sobre o pixmap que o
   pipeline já renderiza.**
2. **Veto por texto escasso**: aceitar a proposta só se o OCR a 100 DPI no
   ângulo proposto render ≥ **10** tokens com confiança ≥ 60 (meio do platô
   5–15). Uma passada extra, só quando o OSD propõe rotação.
3. **Falha do OSD ⇒ não girar.** Cobre as 7 em branco e as 14 quase-brancas.
4. **Não** usar limiar de confiança do OSD: custa 3 tortas e o veto já
   entrega 0 indevidas (seção 3.2).
5. **Não** adotar comparação por OCR 4×: 5× o custo e pior acerto.
6. **Não** adotar o PP-LCNet agora: rompe a referência de memória sem ganho
   sobre o OSD.

**Honestidade sobre o piso = 10**: ele foi escolhido **depois** de ver o
gabarito. É exatamente o que a regra do Portão 1 proíbe fazer com um número
de decisão. Três atenuantes, e nenhum deles é prova: o platô é largo (5–15
dão idêntico), o vão entre os grupos é grande (0 vs mínimo 15), e o
mecanismo é explicável (página sem texto legível no ângulo proposto). Ainda
assim, **o valor precisa ser confirmado num corpus de validação separado**
antes de virar constante de produção — mesma pendência já aberta para o
limiar 0,50 do PP-DocLayout-S.

## 10. O que muda no recall do PP-DocLayout-S

Do Portão 1: as 11 páginas tortas das positivas locais contêm **13 objetos**;
corrigidas dão **9/13**, tortas dão **2/13**. O corpus local tem 15 objetos
no total; as 2 páginas não rotacionadas contribuem 1 de 2.

O detector recomendado corrige **todas as 11** (estão entre as 15/15).
Portanto o 9/13 transfere **exatamente**, sem desconto probabilístico:

| cenário | recall local | |
|---|---|---|
| produção hoje, material cru de celular | **3/15 = 20,0 %** | 2/13 + 1/2 |
| com orientação corrigida | **10/15 = 66,7 %** | 9/13 + 1/2 |

**Corrigir orientação mais que triplica o recall** no domínio da persona.

**E não resolve o Portão 1.** 66,7 % continua abaixo da meta de ~80 %, que é
exatamente o número já reportado como inconclusivo. A correção de orientação
é **pré-requisito**, não conserto: ela tira o recall de 20 % — onde qualquer
medição de detecção era ruído — e o devolve ao patamar em que a pergunta
sobre o PP-DocLayout-S pode ser feita. A decisão sobre o modelo continua
aberta e continua dependendo de corpus maior.

## 11. Correções a afirmações já registradas

**(a) O OSD não errou a página `463802`.** O TRACE (24º episódio, adendo) e o
`PORTAO1` afirmam que o OSD "errou" essa página, reportando `rotate=0` com
confiança 1,42 "numa página que está de lado". A inspeção em resolução plena
mostra que a página **está em pé**: o cabeçalho corrente, o título "TABELA 1"
e os rótulos de linha leem-se todos na horizontal. É uma página de **formato
paisagem** (tabela larga de relatório), fotografada direito. O que confunde
são os cabeçalhos de coluna, impressos girados 90° — propriedade da
tipografia da tabela, não da página. **O OSD acertou**; a confiança baixa é
que estava certa em ser baixa.

**(b) "O OSD já se mostrou inconfiável" não se sustenta.** Essa conclusão,
registrada no `PORTAO1` como motivo para tratar orientação como pré-requisito
difícil, repousa no caso (a). Medido: **15/15** em página de celular, **60/60**
em rotação sintética, **2 propostas indevidas em 236** páginas em pé — as duas
vetáveis por um sinal simples. O OSD é **confiável para propor** e precisa de
guarda **para não estragar página boa**, que é coisa diferente de inconfiável.

**(c) O Gil-208 não é "acervo que sai alinhado".** 104 de suas 208 páginas
têm `/Rotate 180`. Ele renderiza em pé porque o PyMuPDF **aplica** o
`/Rotate`. A lição de corpus do 24º episódio continua válida no essencial
(o material da persona expôs o defeito), mas o mecanismo é outro: a diferença
entre os dois corpora não é scanner bom contra celular ruim, é **rotação
declarada em metadado contra rotação assada em pixel**.

## 12. Fora de escopo e risco residual

- **Inclinação leve e perspectiva**: fora de escopo, como combinado. Estão
  presentes no material (foto de mesa, página curva, sombra de lombada) e
  **não foram tratadas**. O gabarito as preserva — o 15/15 do OSD foi obtido
  **com** elas na imagem.
- **N pequeno do lado torto**: 15 páginas, IC95% [79,6 %, 100 %]. O limite
  inferior encosta em 80 %. Mais páginas tortas reais mudariam isso; rotação
  sintética não, porque mede o caso fácil.
- **Um único idioma e um único aparelho**: todo o material torto é `por`, do
  mesmo celular. O OSD do Tesseract é treinado por script (Latin), não por
  idioma, mas isso não foi medido aqui.
- **Piso do veto ajustado no gabarito** (seção 9).
- **PDF de app de celular não testado** (seção 1.3).
- **Custo de +47 %** no OCR de **PDF escaneado** alinhado — e ele é
  **OSD puro**, porque o veto não dispara nenhuma vez em 224 páginas.
  Documento com camada de texto nativa paga **0 %**. Não há como baratear o
  OSD via gate barato (seção 4.4): reduzir isso exigiria outro sinal de
  suspeita, que esta rodada não achou.

---

## 13. Propostas de registro (NÃO gravadas — decisão do Thiago)

Nada abaixo foi escrito em `TRACE.md`, `TASKS.md` ou `ARCHITECTURE.md`.

### 13.1 `TRACE.md` — proposta de "Vigésimo sexto episódio"

> **Vigésimo sexto episódio — o OSD era confiável, e quem estava errado era
> o gabarito de uma página só**
>
> A Fase 4.24 registrou que o OSD do Tesseract "errou a página `463802`,
> reportando `rotate=0` numa página que está de lado", e o Portão 1 promoveu
> essa frase a motivo: corrigir orientação seria difícil porque a ferramenta
> óbvia era inconfiável. Fui medir os candidatos com essa expectativa e a
> primeira coisa que caiu foi a expectativa.
>
> A página `463802` **está em pé**. É uma TABELA 1 de relatório, em formato
> **paisagem**, fotografada direito: cabeçalho corrente, título e rótulos de
> linha leem-se todos na horizontal. O que enganou foram os cabeçalhos de
> coluna, impressos girados 90° — tipografia de tabela estreita, não rotação
> de página. Confundiu-se *formato paisagem* com *página deitada*. O OSD
> acertou, e a confiança baixa (1,42) estava certa em ser baixa.
>
> Medido contra gabarito: **15/15** em foto de celular, **60/60** em rotação
> sintética, **2 propostas indevidas em 236** páginas já em pé. O OSD é
> confiável para **propor**. O que ele precisa é de guarda para **não
> estragar página boa** — que é problema diferente, e tem solução barata:
> nas duas páginas que ele quis girar à toa, o OCR no ângulo proposto
> devolve **0** palavras com confiança ≥ 60; nas 15 tortas, de 15 a 260.
>
> Duas lições de método. A primeira: **o corpus foi semeado pelo próprio
> candidato**. O manifesto diz que a rotação foi "proposta pelo OSD e
> conferida a olho" — medir o OSD ali seria medi-lo no corpus que ele
> ajudou a escolher. Trouxe de volta as 6 páginas que a Etapa 0 descartou
> por conteúdo e rotulei-as sem consultar o OSD. **As duas únicas rotações
> indevidas de toda a medição saíram dessas 6.** Sem elas o OSD teria
> marcado 0 erro em 233 e eu teria recomendado, com número bonito, uma
> regra sem guarda nenhuma.
>
> A segunda desmonta a moral do 24º episódio. Eu havia escrito que acervo
> digitalizado "sai alinhado porque tem berço e operador". Não sai:
> **104 das 208 páginas do Gil-208 têm `/Rotate 180`**. Elas aparecem em pé
> porque o PyMuPDF **aplica** o `/Rotate` ao renderizar. A diferença entre
> os dois corpora nunca foi scanner bom contra celular ruim — é **rotação
> declarada em metadado contra rotação assada em pixel**. O JPG de celular
> não traz nem EXIF: as 27 imagens têm `Orientation` igual a 0 ou 524288,
> valores fora da faixa válida 1–8. Lixo, não "orientação normal".
>
> E um buraco velho apareceu pela quarta vez, agora cobrando caro. A ideia
> de acionar a detecção só quando o primeiro OCR viesse ruim **não
> funciona**: página de lado sai do Tesseract com confiança média **74,5**,
> dentro da faixa das páginas boas (p10 = 81,4). Não existe sinal barato de
> suspeita, e por isso a correção de orientação custa **+47 %** sobre o OCR
> em PDF escaneado alinhado (documento com texto nativo não paga nada). O pipeline continua sabendo separar "nenhum
> texto" de "algum texto" e continua sem saber separar **texto de lixo** —
> 19º episódio, Fase 4.15, Fase 4.24, e agora o preço disso virou tempo de
> CPU em toda conversão.

### 13.2 `ARCHITECTURE.md` — proposta de "Fase 4.26"

> **Fase 4.26 — orientação de página: candidatos medidos, nada implementado**
>
> Investigação registrada em `ORIENTACAO_PAGINA_2026.md`. `foliant.py` **não
> foi alterado**: o defeito aberto na Fase 4.24 continua aberto, agora com
> caminho medido.
>
> **Já resolvido de graça, e documentado porque não estava**: o PyMuPDF
> aplica `/Rotate` ao renderizar (`get_pixmap` devolve o raster girado).
> 104 das 206 páginas do Gil-208 usadas como controle negativo carregam
> `/Rotate 180` e renderizam em pé. Rotação **declarada** já é tratada; o
> defeito é só de rotação **assada em pixel**, que é o caso do JPG de
> celular (sem EXIF de orientação válido nas 27 imagens).
>
> **Caminho recomendado** (não implementado): OSD do Tesseract `--psm 0`
> sobre a página binarizada por Otsu, a 200 DPI, reaproveitando o pixmap que
> `extrair_texto_pagina` já renderiza — **2,11 s/página**, nenhuma
> dependência nova. Proposta aceita só se o OCR a 100 DPI no ângulo proposto
> render ≥ 10 palavras com confiança ≥ 60; falha do OSD ⇒ não girar.
> Medido: **15/15** tortas, **0/236** rotações indevidas (IC95% [0 %, 1,6 %]),
> 0/7 páginas em branco giradas.
>
> **Reprovados com número**: comparação por OCR 4× (10/15 a 10,3 s/página);
> limiar de confiança do OSD (custa 3 tortas para chegar ao mesmo 0
> indevidas); perfil de projeção como primeira etapa (não separa 0 de 180 e
> erra justamente nas páginas com gráfico); PP-LCNet doc_ori (ONNX oficial
> Apache-2.0 de 6,5 MiB existe, mas exige `onnxruntime`, que repõe os
> +116 MiB de pico do Portão 1 para resolver o que o OSD resolve sem
> dependência).
>
> **Pendências antes de virar código**: (a) o piso de 10 foi ajustado sobre o
> gabarito e precisa de corpus de validação separado, mesma pendência do
> limiar 0,50 do PP-DocLayout-S; (b) `+47 %` de custo no OCR de PDF escaneado
> alinhado (OSD puro — o veto não dispara lá; documento nativo paga 0 %); (c) inclinação leve e perspectiva
> seguem fora de escopo e presentes no material.

### 13.3 `TASKS.md` — proposta de entrada

> **Tarefa — investigar detecção e correção de orientação de página
> (pré-requisito da decisão sobre o PP-DocLayout-S)**
>
> *Critério de validação fixado antes de medir*: a métrica que decide é
> **rotação indevida em página já em pé**, não acerto em página torta —
> deixar de corrigir é status quo, girar página boa estraga página boa.
>
> *Resultado*: ✔ investigação fechada com recomendação. Corpus de 251
> páginas (15 tortas reais de celular, 236 em pé, 60 rotações sintéticas
> à parte). Recomendado OSD binarizado a 200 DPI + veto por texto escasso:
> **15/15** e **0/236**. Custo **+2,18 s/página** em PDF escaneado
> (OSD puro; o veto não dispara em material alinhado), **0** em documento
> com camada de texto nativa.
>
> *Efeito no Portão 1*: o recall local do PP-DocLayout-S sai de **3/15
> (20,0 %)** em material cru de celular para **10/15 (66,7 %)** com
> orientação corrigida — as 11 páginas tortas das positivas estão todas
> entre as 15/15, então o 9/13 do Portão 1 transfere exato. **Continua
> abaixo da meta de ~80 %**: orientação era pré-requisito, não conserto.
> A decisão sobre o modelo segue aberta.
>
> *Correções a registro anterior*: três afirmações derrubadas com evidência
> — o OSD não errou a `463802` (a página está em pé, é formato paisagem);
> "o OSD é inconfiável" repousava só nesse caso; e o Gil-208 não "sai
> alinhado", ele declara `/Rotate 180` em 104 das 208 páginas.
>
> *Não feito*: nada implementado em `foliant.py`. Piso do veto pendente de
> corpus de validação separado. PDF gerado por app de celular não testado,
> por falta de amostra.

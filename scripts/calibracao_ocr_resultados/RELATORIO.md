# Relatório — medição real de tempo de OCR e confiança do Tesseract (Fase 4.15)

Investigação exploratória. **Nenhuma mudança de comportamento no
pipeline de produção** — o critério binário de página vazia (Fase
4.16) continua sendo o único critério de `com_ressalva`/`FALHA` em
produção. Este documento só registra dado bruto medido; decisão de uso
de qualquer número aqui fica para uma etapa posterior.

## RENDER_DPI usado nesta medição

**200** — lido diretamente de `foliant.RENDER_DPI` (import, não
hardcoded no script de medição). É o mesmo valor fixado em produção
(`foliant.py:92`). Confirmado por asserção no próprio script
(`scripts/calibrar_ocr.py`, `rodar_medicoes`) antes de qualquer
medição rodar — os tempos abaixo são comparáveis ao pipeline real
porque o render usa a matriz de zoom idêntica à de `foliant.py:873`.

## Ambiente de medição

- Hardware: MacBook 2016 (macOS-13.7.8-x86_64-i386-64bit — a mesma
  máquina de desenvolvimento documentada em `ARCHITECTURE.md:1794`,
  Intel Core m3 dual-core, sem ventoinha).
- `pmset -g therm` no momento da medição: `CPU_Speed_Limit = 77`
  (throttling parcial ativo, mas MENOS severo que o episódio documentado
  em `ARCHITECTURE.md:1798` — `CPU_Speed_Limit = 50` — durante o qual o
  livro de 208 páginas chegou a 20-24s/página; aqui os números ficaram
  mais próximos do baseline histórico de ~6-9s/página, mas ainda sob
  alguma contenção, não em condição ideal).
- Tesseract 5.5.3, `/usr/local/bin/tesseract`.
- `lang="por"` (default do projeto).
- Metadados completos desta rodada:
  `scripts/calibracao_ocr_resultados/metadados_20260919_195128.json`.
- CSV bruto (uma linha por página medida):
  `scripts/calibracao_ocr_resultados/medicoes_consolidado.csv`.

## 1. Tempo por página

### Páginas OCR (render 200 DPI + `pytesseract.image_to_data`)

| Arquivo | n medido | média | mediana | min | max | desvio-padrão |
|---|---|---|---|---|---|---|
| `001-080.pdf` (80p, 100% escaneado) | 20 | 6,203s | 6,318s | 2,615s | 8,601s | 1,672s |
| `livro_completo_208pg.pdf` (208p, 100% escaneado, mesma obra "Gil") | 20 | 5,948s | 6,419s | 0,682s | 8,557s | 2,249s |
| `falha_ocr_ilegivel.pdf` (3p, ruído sintético) | 3 | 5,277s | 5,287s | 5,021s | 5,524s | 0,252s |
| `ressalva_parcial.pdf` (4p, mix legível+ruído) | 4 | 3,083s | 2,812s | 0,930s | 5,777s | 2,509s |
| PEREIRA (903p, só a página 0 é OCR) | 1 | 1,404s | — | — | — | — (n=1) |
| Fundamentals (210p nativo, 2 páginas amostradas caem em OCR) | 2 | 3,957s | — | 1,990s | 5,924s | 2,782s (n=2) |

**Achado principal**: tempo por página OCR varia entre ~0,7s e ~8,6s
mesmo DENTRO do mesmo livro (`001-080.pdf`: desvio-padrão 1,672s sobre
média 6,203s; `livro_completo_208pg.pdf`: desvio-padrão 2,249s sobre
média 5,948s — quase 40% da média). **Uma estimativa de "X min" com
tempo médio fixo por página não é confiável** — o desvio é grande
demais para tratar como constante, mesmo dentro de um único livro já
100% escaneado. Página 171/208 de `livro_completo_208pg.pdf` levou só
0,682s (provavelmente página quase vazia/imagem simples), contra 8,6s
de outra página do mesmo livro.

Comparando as duas amostras da MESMA obra ("Gil", `001-080.pdf` vs.
`livro_completo_208pg.pdf`): médias muito próximas (6,203s vs. 5,948s)
— consistente, já que é o mesmo conteúdo físico reamostrado — mas isso
não testa variação ENTRE obras diferentes, já que não há uma segunda
obra 100% escaneada disponível no repo. **Lacuna amostral explícita**:
esta investigação não pode afirmar que 6s/página generaliza para OUTRO
livro escaneado — só para esta obra específica.

### Páginas nativas (`get_text` isolado)

| Arquivo | n medido | média | mediana | min | max | desvio-padrão |
|---|---|---|---|---|---|---|
| PEREIRA (903p) | 29 | 0,017s | 0,018s | 0,007s | 0,022s | 0,004s |
| Fundamentals (210p) | 28 | 0,014s | 0,015s | 0,002s | 0,017s | 0,003s |

**Diferença nativo vs. OCR confirmada com número, não suposição**:
página nativa custa ~0,01-0,02s; página OCR custa ~1-8,6s — **entre
~100x e ~800x mais lenta**. A afirmação do comentário em
`foliant.py:801-806` ("custo desprezível") é confirmada: nativa é de
fato desprezível frente ao OCR. Uma estimativa de tempo futura DEVE
contar nativas e escaneadas separadamente (o `--inspect` já faz essa
contagem) — tratar todas as páginas com o mesmo tempo médio erraria
por 2-3 ordens de magnitude.

## 2. Distribuição de confiança do Tesseract (`conf`)

Filtro aplicado (confirmado antes de medir em lote): `image_to_data`
retorna `conf=-1` para blocos estruturais sem palavra real, e ainda
`conf` positivo em linhas de texto vazio (ex.: página 0 de
`falha_ocr_ilegivel.pdf` tem uma entrada com `conf=95` mas `text=""`)
— filtrado por `texto.strip() and conf >= 0`. Ver inspeção bruta que
motivou o filtro em `scripts/calibrar_ocr.py` (comentário na função
`medir_pagina_ocr`).

| Grupo | n páginas com ≥1 palavra confiante | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|---|
| "boas" (livros de calibração, por nome de arquivo) | 40 | 91,6 | 93,5 | 94,7 | 95,4 | 95,6 |
| "ruins" (fixtures sintéticas, por nome de arquivo) | 2 | 77,2 | 79,8 | 84,2 | 88,7 | 91,3 |

**Achado crítico sobre as fixtures sintéticas**: das 7 páginas das duas
fixtures "ruins" (`falha_ocr_ilegivel.pdf`: 3 páginas; `ressalva_parcial.pdf`:
4 páginas), **5 produziram ZERO palavras com confiança válida** — as 3
páginas de `falha_ocr_ilegivel.pdf` (ruído puro) e as 2 páginas de
ruído dentro de `ressalva_parcial.pdf`. Só as 2 páginas LEGÍVEIS de
`ressalva_parcial.pdf` entraram no grupo "ruins" acima (com
`conf_media` de 93,1 e 75,4 — a segunda já abaixo do p10 do grupo
"boas"). **Isso significa que a maioria da amostra sintética "ruim" não
dá NENHUM dado de confiança para comparar** — o Tesseract não retorna
palavras com confiança sobre ruído puro, ele simplesmente não encontra
palavra nenhuma. Essa é exatamente a razão pela qual o critério binário
já em produção (nenhum parágrafo/título detectado) captura esse caso
sem precisar de threshold de confiança: **quando não há palavra
nenhuma, não há `conf` para limiar decidir sobre.**

**Achado real (não sintético) de página com confiança baixa**: dentro
da amostra espalhada de `Fundamentals of Data Engineering` (livro
nativo real, 210 páginas), a página de índice 112 (113ª página, 1-based)
caiu no caminho OCR (não é 100% nativo como assumido — há ao menos uma
página escaneada/imagem embutida) e produziu:
- `conf_media = 37,09`, `conf_mediana = 39,0`, `conf_min = 0`
- 532 palavras detectadas, 1157 caracteres

Isso é um exemplo REAL (não ruído sintético) de página com confiança
sistematicamente baixa mas com MUITO texto extraído (não vazio) — o
critério binário de produção (nenhum parágrafo) **não pegaria esse
caso**, porque a página produz texto, só que de baixa confiabilidade.
Este é o único ponto de dado real (n=1) desta investigação que sugere
onde um threshold de confiança poderia agregar valor sobre o critério
binário atual — mas n=1 é insuficiente para calibrar qualquer valor de
corte a partir dele.

**Sobreposição de faixas**: comparando p10 do grupo "boas" (91,6) com a
mediana das 2 páginas legíveis de `ressalva_parcial.pdf` (84,2) e a
página 113 real do Fundamentals (39,0) — há uma faixa claramente baixa
(~37-40) que não aparece em nenhuma página "boa" amostrada, mas também
uma faixa intermediária (75-93) onde página boa e página ruim-mas-legível
se sobrepõem. **Não há evidência suficiente aqui para fixar um único
valor de corte** — a amostra de páginas genuinamente "ruins mas com
texto" é pequena (n=3: 2 de `ressalva_parcial.pdf` + 1 real do
Fundamentals).

## 3. Limitações explícitas da amostra

- N=20-30 páginas por livro é pequeno para uma variância robusta —
  confirmado pelo desvio-padrão observado (até ~40% da média nos livros
  OCR). Rodar OCR completo nos livros de 208/903 páginas não foi feito
  aqui (custo de tempo de máquina inviável para iteração), mas seria o
  próximo passo para reduzir essa incerteza.
- As duas fixtures "ruins" do repo são ruído RGB **sintético**, não
  scans reais borrados/mal escaneados — a maioria delas (5 de 7 páginas)
  não produz NENHUM dado de confiança (zero palavras), o que limita seu
  valor para calibrar um threshold de confiança especificamente (elas
  já são bem cobertas pelo critério binário existente).
- Só existe UMA obra real 100% escaneada disponível para medir tempo de
  OCR (`001-080.pdf`/`livro_completo_208pg.pdf` são a mesma obra) — não
  há evidência de variância de tempo ENTRE obras escaneadas diferentes.
- O único exemplo real (não sintético) de página com confiança baixa
  encontrado nesta amostra é N=1 (Fundamentals, página 113) — insuficiente
  para qualquer calibração de threshold, só um sinal de que a pergunta é
  legítima e merece mais amostra real antes de decidir.

## Conclusão (sem decisão de threshold/fórmula — fora de escopo aqui)

- Tempo: nativo (~0,01-0,02s) é 2-3 ordens de magnitude mais rápido que
  OCR (~1-8,6s, com desvio grande até dentro do mesmo livro). Uma
  estimativa de tempo futura precisa tratar as duas contagens
  separadamente E comunicar incerteza (faixa, não valor único), dado o
  desvio observado.
- Confiança: o Tesseract retorna zero palavras confiantes sobre ruído
  puro (o critério binário já cobre isso), mas existe pelo menos 1
  página real com texto extraído e confiança baixa (Fundamentals,
  p.113) que o critério binário não capturaria — sinal fraco (n=1) de
  que um threshold de confiança poderia ter valor complementar, mas sem
  amostra real suficiente para calibrar um valor de corte agora.

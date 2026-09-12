# Fixtures de teste de falha

Criadas para cobrir o caminho de falha da conversão, nunca testado antes
(só sucesso e cancelamento manual tinham validação real). Ver
`ARCHITECTURE.md`/`TASKS.md` para o relato completo do ciclo que gerou
estes arquivos e o achado que ele revelou. `falha_ocr_ilegivel.pdf` e
`ressalva_parcial.pdf` também são usadas como fixtures de regressão do
critério de página sem texto útil (`RESSALVA:`/`FALHA:sem_texto_legivel`,
ver TRACE.md episódio 8).

## `falha_ocr_ilegivel.pdf` (3 páginas, ~1,4 MB)

Três páginas de ruído RGB puro (aleatório, sem nenhuma estrutura
reconhecível como texto ou forma), renderizadas como imagem JPEG
embutida — sem depender de nenhum threshold de confiança já calibrado
(o projeto ainda não tem um, ver Fase 5.x em `ARCHITECTURE.md`).
Gerada com `pymupdf` + `PIL.Image` com pixels aleatórios (`random.seed(42)`
para reprodutibilidade), a 100 DPI.

**Achado original (motivou a correção)**: antes da correção descrita em
TRACE.md episódio 8, o pipeline completo (`primeira_passada` →
`construir_html` → `convert_to_ebook`) processava esse PDF até o fim com
**exit code 0** e a mensagem `Concluído: <saída>` — sem nenhum erro, sem
nenhum aviso. O `.epub` gerado tinha 3 páginas com um único caractere de
espaço cada (`<p class="calibre1"> </p>`), ou seja, um livro
completamente vazio apresentado como sucesso.

**Comportamento atual (pós-correção)**: como as 3 páginas (100% do
total) não produzem texto útil, `construir_html` reporta as 3 na lista
de páginas sem texto, `main()` detecta que é o total e aborta antes de
chamar o Calibre — `FALHA:{"motivo": "sem_texto_legivel"}`, `exit code
1`, nenhum `.epub` é gerado. No app desktop, isso leva à tela "falha"
com a mensagem "Não há texto legível neste PDF para converter...".

## `ressalva_parcial.pdf` (4 páginas, ~930 KB)

Duas páginas com texto real legível (renderizado como imagem para forçar
o caminho OCR) seguidas de duas páginas de ruído RGB puro (mesmos
parâmetros de `falha_ocr_ilegivel.pdf`, `random.seed(7)`) — cobre o caso
intermediário: nem 0% nem 100% das páginas sem texto útil.

**Comportamento esperado e confirmado**: `construir_html` reporta as
páginas físicas 3 e 4 (não as 1 e 2, legíveis) na lista de páginas sem
texto. Como é só parte do total, a conversão segue normalmente —
`RESSALVA:{"paginas_sem_texto": [3, 4]}`, `exit code 0`, `.epub` gerado
com o marcador `"[Página N do PDF original não pôde ser transcrita pelo
OCR — verifique o arquivo original nesta página.]"` no lugar do conteúdo
das páginas 3 e 4. No app desktop, isso leva à tela "com_ressalva".

## `falha_corrompido.pdf` (60.000 bytes)

`samples/001-080.pdf` truncado nos primeiros 60.000 bytes
(`head -c 60000`), quebrando a xref table e os streams de objeto no
meio. `pymupdf.open()` não lança exceção ao abrir (é tolerante), mas
recupera o arquivo como tendo **0 páginas**.

**Achado**: `--inspect` classifica corretamente como
`INSPECAO_ERRO:{"erro": "sem_paginas"}` — o fluxo real da UI nunca deixa
esse arquivo chegar à tela de conversão, volta para "selecionar" com
aviso. Testado também o caminho de conversão direto (bypassando
`--inspect`, simulando o arquivo mudar entre a inspeção e a confirmação,
ou uma chamada fora da UI): `primeira_passada` chama
`extrair_capa` → `doc.load_page(0)`, que lança `ValueError: page not in
document`, não capturada em `main()` — propaga, `exit code 1`,
traceback no stderr. Isso corresponde ao branch de `close` no `main.js`
que leva à tela "falha" (código != 0, sem cancelamento solicitado) — a
propagação funciona, só que com a mensagem genérica de erro, não a
mensagem específica de "corrompido" que `--inspect` já tem.

## Como regenerar

```python
import pymupdf, random
from PIL import Image

random.seed(42)
doc = pymupdf.open()
for i in range(3):
    img = Image.new("RGB", (827, 1169))
    img.putdata([(random.randint(0,255), random.randint(0,255), random.randint(0,255))
                 for _ in range(img.width * img.height)])
    path = f"/tmp/ruido_{i}.jpg"
    img.save(path, "JPEG", quality=60)
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, filename=path)
doc.save("tests/fixtures/falha_ocr_ilegivel.pdf", garbage=4, deflate=True)
```

```bash
head -c 60000 samples/001-080.pdf > tests/fixtures/falha_corrompido.pdf
```

```python
import pymupdf, random
from PIL import Image, ImageDraw

random.seed(7)
doc = pymupdf.open()
textos = [
    "Este e um texto legivel de verdade, pagina um do fixture misto.",
    "Segunda pagina tambem legivel, com texto real reconhecivel pelo OCR.",
]
for i in range(4):
    page = doc.new_page(width=595, height=842)
    if i < 2:
        img = Image.new("RGB", (827, 1169), "white")
        ImageDraw.Draw(img).text((60, 500), textos[i], fill="black")
        path = f"/tmp/mix_{i}.png"
        img.save(path)
    else:
        img = Image.new("RGB", (827, 1169))
        img.putdata([(random.randint(0,255), random.randint(0,255), random.randint(0,255))
                     for _ in range(img.width * img.height)])
        path = f"/tmp/mix_{i}.jpg"
        img.save(path, "JPEG", quality=60)
    page.insert_image(page.rect, filename=path)
doc.save("tests/fixtures/ressalva_parcial.pdf", garbage=4, deflate=True)
```

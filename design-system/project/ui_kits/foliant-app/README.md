# UI kit — Foliant (app desktop)

Recriação clicável do fluxo do app, telas 1 a 8 do wireframe consolidado.
Abra `index.html`: a barra superior alterna entre as telas; dentro delas os
controles reais funcionam (arraste, opções recolhidas, abas de aparelho,
progresso animado).

| Arquivo | Telas |
|---|---|
| `ScreensStart.jsx` | Instalação/Gatekeeper (tela 1), seleção de arquivo e estado de arraste (telas 2–3) |
| `ScreensConvert.jsx` | Pré-conversão com opções recolhidas (telas 4–5), conversão em andamento (tela 6) |
| `ScreensResult.jsx` | Sucesso + guia de transferência (tela 7), sucesso com ressalva e falha (tela 8) |

Fontes: `uploads/Foliant - Fluxo de telas-selection.png` (wireframe anotado) e
`desktop/src/index.html` + `desktop/src/main.js` do repositório, que definem os
campos reais (PDF de entrada, saída, título, autor, idioma) e as três fases de
progresso. O repositório ainda usa o CSS padrão do Tauri; a aparência aqui é a
do design system, não a do build atual.

Regras respeitadas nas telas:
- selo "100% local" permanente em toda tela de ação e resultado;
- uma ação principal por tela, opções avançadas recolhidas;
- fases nomeadas em vocabulário do usuário, nunca "OCR";
- aviso do macOS em âmbar com ícone `info`, sem "bypass" e sem desculpas;
- em falha, o fundo continua neutro e o CTA de recuperação é azul.

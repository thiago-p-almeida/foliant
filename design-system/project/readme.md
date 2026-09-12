# Foliant — Design System

Foliant é um app desktop gratuito e open-source (macOS/Linux) que converte PDFs
grandes ou escaneados em EPUB, reconhecendo o texto de páginas que só existem
como imagem. Roda 100% offline: o arquivo nunca sai do computador do usuário,
inclusive em máquinas antigas e sem placa de vídeo.

O público é o estudante/concurseiro brasileiro que lê material digitalizado de
qualidade irregular (apostilas de concurso, livros esgotados, PDFs de
biblioteca) em tablet Android, e que já travou no Calibre e não pode pagar o
ABBYY. Letramento técnico baixo: a pessoa não busca "OCR", busca "converter PDF
para EPUB". O modelo de referência é Nubank — simplicidade radical,
transparência explícita, acabamento polido — e o anti-modelo é o Calibre, o
"wild west of settings".

## Princípios

1. **Uma ação principal por tela.** Opções avançadas existem, mas recolhidas.
2. **Confiança é visual, não retórica.** O selo "100% local" aparece na tela, não só na documentação.
3. **Nada de jargão.** Nunca "OCR" na interface: "reconhecer o texto". Nunca código de erro, nome de dependência ou "bounding box".
4. **O aviso do sistema não é defeito do app.** A tela do Gatekeeper do macOS é rotina, tratada em âmbar, sem "bypass" e sem pedido de desculpas.
5. **Todo valor é rastreável.** Paleta, tipografia e contraste vêm da pesquisa consolidada, não de gosto.

## Fontes deste design system

- `uploads/foliant-design-system-consolidado.md` — paleta, tipografia, tokens, matriz de contraste WCAG (28 pares) e decisões por tela. **Fonte primária.**
- `uploads/foliant-persona-canvas-consolidado.md` e `uploads/deep-research-experiência-de-leitura-t1+t3+t4.md` — persona e pesquisa de leitura.
- `uploads/Foliant - Fluxo de telas-selection.png` — wireframe anotado das 8 telas, com a copy real em português.
- Repositório: **https://github.com/thiago-p-almeida/foliant** — `desktop/src/index.html`, `desktop/src/main.js` e `desktop/src/styles.css` definem os campos, as três fases de progresso e o comportamento real. Vale explorar `ARCHITECTURE.md` e `TASKS.md` do repo para entender restrições técnicas antes de desenhar telas novas.
- O arquivo Figma "Neo Brutalism UI Library (Community)" foi **descartado** por decisão do usuário: sua estética não corresponde à direção do Foliant.

## Índice

| Caminho | O que é |
|---|---|
| `styles.css` | Entrada única de CSS (só `@import`s) |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `base.css` |
| `components/core/` | `Button`, `Card`, `Tag`, `Icon` |
| `components/forms/` | `TextField`, `SegmentedControl`, `Checkbox`, `Disclosure`, `DropZone` |
| `components/feedback/` | `LocalBadge`, `Callout`, `ProgressPhase` |
| `components/chrome/` | `AppWindow`, `FileSummary` |
| `guidelines/` | 17 cards de fundamentos (cores, tipo, espaçamento, marca, voz) |
| `ui_kits/foliant-app/` | Fluxo clicável das 8 telas do app |
| `SKILL.md` | Empacotamento como Agent Skill |
| `github.md` | Associação com o repositório de origem |

## Visual foundations

**Cor.** Azul navy médio-escuro como marca (`--blue-800` `#1E4D8C`; header em
`--blue-900` `#15375F`), neutros quentes como base (`--warm-white` `#FAF7F2` no
fundo do app, `--beige` `#F2EBE0` nos cards, `--beige-200` `#EAE0D0` em card
dentro de card e na área de drop), verde exclusivamente para progresso e
confirmação (`--green-600` na barra, `--green-700` no texto de sucesso),
vermelho dessaturado só para falha real (`--red-700` `#9B3636`) e âmbar para
rotina do sistema (`--amber-700` `#8A5A1F`). Nunca preto puro, nunca cinza
frio, nunca saturação alta, nunca gradiente. Máximo de duas superfícies de
fundo por tela.

**Tipografia.** Uma família só: Inter, pesos 400/500/700. Display 28/700/1.15,
heading 20/700/1.25, corpo **17**/400/1.6 (a persona estuda por horas), rótulo
16/500/1.5, legenda 14/400/1.4 — piso absoluto. Nada de peso 300 ou 800; nada
de negrito em corpo de texto ou em texto de erro (a cor já diferencia).

**Espaçamento e densidade.** Escala 4/8/12/16/24/32/48. A densidade segue a
categoria do elemento: essencial 24–32px em fundo de marca ou tint,
condicional 16px em neutro e recolhido por padrão, contextual 4–12px com fundo
semântico e borda. Largura máxima de conteúdo 560px (a mesma do app real).

**Raios.** 4px em input e tag, 8px em card e botão, 12px em drop e modal.
Nunca 0px (estética técnica), nunca 20px+ (lúdico demais para o tom 70/30).

**Bordas e sombras.** Toda superfície tem borda de 1px `--gray-300`; sombras
são curtas e quentes (`0 1px 2px` → `0 8px 24px` em rgba(42,37,32)). Nenhuma
sombra colorida, nenhum glow, nenhum efeito interno. A área de drop é a única
borda tracejada do sistema (2px), e ela vira sólida azul no estado ativo.

**Fundos e imagem.** Sem imagem de fundo, sem padrão, sem textura, sem
full-bleed: o fundo é cor plana quente. A única imagem prevista no produto é o
screenshot real do aviso do macOS na tela de instalação — nenhuma ilustração
foi fornecida, e nenhuma foi inventada aqui.

**Movimento.** Transições curtas de 120/180/300ms com `cubic-bezier(.2,0,.2,1)`.
Fade e mudança de cor; nunca bounce, nunca spring. A única animação contínua é
a barra indeterminada da fase sem contador granular. O selo de privacidade
**nunca** anima — animação sinaliza instabilidade, não segurança.

**Estados.** Hover escurece dentro da família (primário `--blue-800` →
`--blue-700`; secundário ganha fundo bege e borda azul; ghost ganha fundo
`--blue-100`). Press desloca 1px para baixo, sem encolher. Foco é anel azul de
3px `rgba(58,115,181,.45)` mais borda `--blue-600`. Desabilitado é opacidade
45% com cursor bloqueado. Nenhum estado usa só cor: sempre borda ou ícone
acompanha.

**Transparência e blur.** Praticamente ausentes — só nas sombras e no anel de
foco. Sem vidro, sem overlay difuso, sem gradiente de proteção: o contraste é
resolvido por cor plana validada, não por camada semitransparente.

**Layout fixo.** O selo "100% local" fica no topo direito de toda tela de ação
e resultado e não desaparece com o scroll. A ação principal fica na base do
fluxo da tela, em largura total.

## Content fundamentals

- **Idioma:** português do Brasil, sempre. Nenhuma string em inglês na interface.
- **Pessoa e voz:** "você" para o usuário, "vamos" quando o app age junto ("Vamos converter seu PDF"). Voz ativa sempre — "o Foliant vai reconhecer o texto", nunca "o arquivo será processado".
- **Tom:** 70% casual / 30% formal. Caloroso, nunca infantil: o público tem formação superior, só não tem vocabulário técnico. Sem gírias, sem exclamações em série.
- **Casing:** frase capitalizada em títulos, rótulos e botões ("Converter para EPUB", "Ajustar título e autor do livro"). Nunca CAPS, nunca Title Case em inglês.
- **Números concretos em vez de vago:** "Página 47 de 312", "~35 min", "903 páginas · 108 MB" — a persona precisa saber que o app não travou.
- **Erro = causa + ação:** "A conversão parou na página 214. O PDF parece estar danificado nessa página. O que já foi feito não foi perdido." Sem pedido de desculpas, sem código bruto.
- **Proibido na interface:** "OCR", "bypass"/"contornar", "bounding box", nome de dependência, código de saída, "algo deu errado".
- **Emoji:** não são usados. Nenhum, em nenhuma superfície.
- **Ponto final:** frases de corpo terminam com ponto; rótulos e botões não.

## Iconography

- Biblioteca: **Lucide** (licença ISC), traço 2px nativo, sempre **linha** — nunca preenchido.
- Tamanhos: 24px padrão (dentro de alvo de 44px), 20px em selos e gatilhos, 16px em tags e legendas.
- Nenhum arquivo de ícone existe no repositório do produto (só `tauri.svg` e `javascript.svg`, logos do framework). O subset usado está **self-hosted** em `assets/icons/` — 14 SVGs copiados verbatim de `github.com/lucide-icons/lucide/icons/`, mais `icon-data.js` com os mesmos dados para uso fora do React. O componente `Icon` renderiza SVG inline a partir desse mapa: nenhuma requisição de rede.
- Ícones canônicos **em uso**: `file-text` (PDF, área de drop), `shield-check` (selo local), `circle-check` (sucesso e `Callout` de progresso — o Lucide renomeou `check-circle` para `circle-check`; o nome antigo segue como alias, mas o canônico é o novo), `check` (fase concluída e caixa marcada), `circle-alert` (falha real), `info` (aviso do sistema e ressalva), `chevron-down` (bloco recolhível), `folder-open` (selecionar arquivo, ver na pasta), `book-open` (abrir EPUB).
- Também presentes no subset, **previstos no wireframe mas ainda sem uso em componente**: `x` (fechar o card de aviso da tela 1b), `tablet` (guia de transferência), `clock` (tempo estimado — hoje o dado aparece só como texto "~35 min"), `hard-drive` (tamanho do arquivo). Ficam no mapa como vocabulário reservado; remova-os se preferir um subset estritamente do que é renderizado.
- `info`, nunca `alert-triangle`, na tela do Gatekeeper.
- Emoji e caracteres unicode não são usados como ícone.

## Marca

**Não existe logo.** Nem o repositório nem os documentos fornecidos contêm um
arquivo de marca. Onde um logo apareceria, escreva **Foliant** em Inter 700,
`--blue-900` sobre fundo claro ou branco sobre `--blue-800`. Nenhum símbolo foi
desenhado aqui de propósito — ver o card "Marca em tipo".

## Adições intencionais

O material fornecido descreve tokens, telas e regras, mas não uma biblioteca de
componentes. Os 14 componentes deste sistema foram derivados diretamente dos
elementos que aparecem nas 8 telas do wireframe e no formulário real do repo —
nenhum primitivo "de praxe" (Toast, Avatar, Tabs, Tooltip, Dialog) foi
inventado. Duas adições merecem nota:

- `Icon` — wrapper do subset Lucide self-hosted, necessário porque a
  especificação define a biblioteca mas o projeto não tinha os arquivos.
- `AppWindow` — moldura de janela para mostrar as telas em contexto; não é um
  componente de produto, é o enquadramento do UI kit.

## Ressalvas

- **Fonte:** `tokens/fonts.css` importa Inter (400/500/700) do Google Fonts, porque nenhum `.woff2` foi entregue. No export standalone os arquivos da fonte ficam embutidos em base64 (sem rede); para o produto, troque por `@fontsource/inter` self-hosted no repositório.
- **Ícones:** self-hosted em `assets/icons/` (subset de 14 glifos do Lucide). Ao adicionar um glifo novo, copie o `.svg` do Lucide e acrescente o `path` ao mapa em `components/core/Icon.jsx` — não referencie CDN.
- **O repositório ainda não usa este design system**: `desktop/src/styles.css` é o CSS padrão do Tauri (azul `#396cd8`, verde `#2e9e4f`, preto `#0f0f0f`, dark mode automático). Os valores deste sistema vêm do documento consolidado, que é a direção aprovada, não do build atual.
- `--gray-500` (#6B6258) é o par de menor margem do sistema (5,59:1). Não use para texto que o usuário precisa ler com atenção.
- Contraste validado computacionalmente, não em campo (tablet real, luz real).
- A copy das telas do UI kit segue o wireframe anotado; onde o texto do wireframe estava ilegível em miniatura, foi escrito respeitando as regras de voz acima — revise antes de usar em release.

# Design System Foliant — Documento Consolidado
## Paleta, Tipografia, Tokens Visuais e Aplicação ao Wireframe

> **Princípio fundacional**: todo valor aqui é rastreável a um achado de
> pesquisa real (persona, benchmarking de mercado, pesquisa de
> identidade visual centrada em confiança). Nenhuma cor "porque ficou
> bonita". Contraste WCAG 2.2 validado computacionalmente — 28 pares
> testados, 0 falhas, com verificação independente confirmando os
> cálculos (diferença máxima de 0,005 entre duas checagens
> independentes).

---

## 1. Paleta

### 1.1 Primária — Azul (confiança)

| Token | Hex | Papel | Justificativa |
|---|---|---|---|
| `--blue-900` | `#15375F` | Header, fundo de selo, texto de marca em fundo claro | Navy é a cor mais consistentemente associada a confiança/autoridade sem agressividade na pesquisa de identidade visual (7+ fontes convergentes) |
| `--blue-800` | `#1E4D8C` | **Cor de marca principal** — botão primário, links, ícones de ação | Tom médio-escuro, não saturado — evita estética "tech startup genérico" |
| `--blue-700` | `#2A609E` | Hover/press de botão primário | Variação de tom mantendo família — evita inconsistência percebida |
| `--blue-600` | `#3A73B5` | Focus ring, borda ativa de input | Mantém a família azul em estados interativos |
| `--blue-100` | `#E4ECF5` | Tint de fundo (selo "100% local", seleção) | Azul claro sinaliza calma — usado no momento de reforço de privacidade |

### 1.2 Secundária — Neutros quentes (humano/acessível)

| Token | Hex | Papel | Justificativa |
|---|---|---|---|
| `--warm-white` | `#FAF7F2` | **Fundo principal do app** | Bege claro evita "branco clínico corporativo" — sinaliza tecnologia fácil e confiável |
| `--beige` | `#F2EBE0` | Fundo de card, superfície elevada | Humaniza o azul, evita paleta corporativa fria |
| `--beige-200` | `#EAE0D0` | Card dentro de card, área de drag-and-drop | Diferenciação de superfície sem recorrer a cinza frio |
| `--gray-800` | `#2A2520` | Texto de título | Cinza-quente escuro, nunca preto puro (preto puro = estética terminal/hacker, anti-modelo explícito) |
| `--gray-700` | `#3A3530` | **Texto de corpo** | Mesma lógica de temperatura; contraste AAA sobre fundos claros |
| `--gray-500` | `#6B6258` | Texto secundário/legenda | ⚠️ Ver ressalva na seção 6 — é o par com menor margem de contraste do sistema |
| `--gray-300` | `#897A60` | Borda/divisor, contorno de input | **Corrigido durante validação** — valor original `#D6CCBD` falhava (1,49:1) |

### 1.3 Accent — Verde (progresso/confirmação, uso exclusivo)

| Token | Hex | Papel | Justificativa |
|---|---|---|---|
| `--green-700` | `#226640` | Texto/ícone de sucesso | **Corrigido durante validação** — `#2F7A4F` falhava 4,5:1 (dava 4,47:1) |
| `--green-600` | `#24663C` | Barra de progresso, botão de sucesso | **Corrigido durante validação** — `#3B8B5C` falhava (4,17:1). Escuro o suficiente para ser visto à distância (usuário se afasta do computador durante conversões longas) sem ser ansiogênico |
| `--green-100` | `#E5F0E9` | Fundo de card de sucesso | Tint suave, não compete com o azul de marca |

### 1.4 Semânticas — Erro e Aviso (deliberadamente distintas uma da outra)

| Token | Hex | Papel | Justificativa |
|---|---|---|---|
| `--red-700` | `#9B3636` | Texto/ícone de erro real | Vermelho **desaturado**, nunca `#FF0000` — erro comunicado como "causa + ação", não catástrofe |
| `--red-100` | `#F6E4E4` | Fundo de card de erro | Tint suave, evita gatilho de pânico visual |
| `--amber-700` | `#8A5A1F` | **Texto do aviso do Gatekeeper**, ressalvas | Deliberadamente **âmbar, nunca vermelho** — o aviso do macOS é rotina do sistema, não falha do app; usar vermelho confundiria com erro real (Tela 8) |
| `--amber-600` | `#A06A24` | Borda/ícone de aviso (elementos grandes) | |
| `--amber-100` | `#F7EFD9` | Fundo de card de aviso/ressalva | Tom quente que conecta ao sistema de neutros — o aviso parece parte do app, não intrusão |

### 1.5 Auxiliar
`--white`: `#FFFFFF` — texto sobre azul/verde escuros, bordas internas de card.

### 1.6 Matriz de contraste — validação WCAG 2.2 AA

Metodologia: cálculo computacional da fórmula oficial de luminância relativa sRGB (não estimativa visual). Alvo: 4,5:1 texto normal / 3:1 texto grande (≥24px) e elementos de UI (bordas, ícones). **Todos os 28 pares abaixo passaram, e foram reconferidos de forma independente com diferença máxima de 0,005 entre as duas checagens.**

| Par (texto sobre fundo) | Razão | Alvo | Nível |
|---|---|---|---|
| `--gray-800` / `--warm-white` (título) | 14,20:1 | 4,5 | AAA |
| `--gray-700` / `--warm-white` (corpo) | 11,35:1 | 4,5 | AAA |
| `--gray-500` / `--warm-white` (secundário) | 5,59:1 | 4,5 | AA |
| `--gray-800` / `--beige` | 12,82:1 | 4,5 | AAA |
| `--gray-700` / `--beige` | 10,24:1 | 4,5 | AAA |
| `--gray-500` / `--beige` | 5,05:1 | 3,0 | AAA |
| `--white` / `--blue-800` (botão) | 8,42:1 | 4,5 | AAA |
| `--white` / `--blue-700` | 6,43:1 | 4,5 | AA |
| `--white` / `--blue-900` (header) | 12,04:1 | 4,5 | AAA |
| `--blue-800` / `--warm-white` | 7,87:1 | 4,5 | AAA |
| `--blue-800` / `--blue-100` | 7,06:1 | 4,5 | AAA |
| `--blue-900` / `--warm-white` | 11,27:1 | 4,5 | AAA |
| `--green-700` / `--warm-white` | 6,46:1 | 4,5 | AA |
| `--green-700` / `--green-100` | 5,91:1 | 4,5 | AA |
| `--white` / `--green-600` (barra) | 6,91:1 | 4,5 | AA |
| `--red-700` / `--red-100` | 5,76:1 | 4,5 | AA |
| `--red-700` / `--warm-white` | 6,61:1 | 4,5 | AA |
| `--amber-700` / `--amber-100` | 5,14:1 | 4,5 | AA |
| `--amber-700` / `--warm-white` | 5,52:1 | 4,5 | AA |
| `--amber-600` / `--warm-white` (≥24px) | 4,29:1 | 3,0 | AA |
| `--gray-300` / `--warm-white` (UI) | 3,92:1 | 3,0 | AA |
| `--gray-300` / `--beige` (UI) | 3,54:1 | 3,0 | AA |
| `--gray-700` / `--amber-100` | 10,57:1 | 4,5 | AAA |
| `--gray-700` / `--green-100` | 10,38:1 | 4,5 | AAA |
| `--gray-700` / `--red-100` | 9,89:1 | 4,5 | AAA |
| `--blue-700` / `--blue-100` (≥24px) | 5,39:1 | 3,0 | AAA |
| `--blue-800` / `--amber-100` | 7,33:1 | 4,5 | AAA |
| `--green-600` / `--warm-white` (UI) | 6,46:1 | 3,0 | AAA |

**Correções aplicadas durante validação (transparência de processo, não escondida):**
1. `--green-700`: `#2F7A4F` → `#226640` (falhava 4,47:1 → corrigido 5,91:1)
2. `--green-600`: `#3B8B5C` → `#24663C` (falhava 4,17:1 → corrigido 6,91:1)
3. `--gray-300`: `#D6CCBD` → `#897A60` (falhava 1,49:1 → corrigido 3,92:1)

---

## 2. Tipografia

**Família única: Inter** (sans-serif, SIL Open Font License — gratuita, coerente com o DNA gratuito do projeto). Self-host obrigatório via `@fontsource/inter` — nunca CDN, já que o Foliant é 100% offline.

Por que uma família só: inconsistência tipográfica é um dos destruidores de credibilidade mais citados na pesquisa de identidade visual — cada família adicional é risco, não variedade.

| Token | Tamanho | Peso | Linha | Uso |
|---|---|---|---|---|
| `--text-display` | 28px | 700 | 1.15 | Título de tela (um por tela) |
| `--text-heading` | 20px | 700 | 1.25 | Subtítulo/título de card |
| `--text-body` | **17px** | 400 | 1.6 | **Texto de corpo, leitura prolongada** |
| `--text-body-md` | 16px | 500 | 1.5 | Texto de botão, label de ação |
| `--text-caption` | 14px | 400 | 1.4 | Legenda, texto de suporte — **mínimo absoluto do sistema** |

**Por que 17px, não 16px**: a persona estuda por horas seguidas; fadiga visual já é queixa documentada contra concorrentes (Calibre criticado por texto pequeno). Nunca usar peso 300 (fino demais) nem acima de 700 (satura leitura). Negrito nunca em corpo de texto nem em texto de erro (a cor já diferencia).

---

## 3. Tokens de espaçamento e densidade

**Escala base 8px**: `4 / 8 / 12 / 16 / 24 / 32 / 48px`.

| Categoria do elemento (classificação já validada no wireframe) | Tratamento visual | Espaçamento |
|---|---|---|
| **Essencial** (ação principal, botão Converter, drop) | Fundo de marca ou tint, ícone preenchido | Generoso (24-32px) |
| **Condicional** (metadados, opções avançadas) | Fundo neutro (card), ícone de linha, recolhido por padrão | Médio (16px) |
| **Contextual** (selo, aviso, badge) | Fundo semântico (âmbar/azul) + borda, compacto | Compacto (4-12px) |

O contextual precisa ser **perceptivelmente diferente** do essencial por cor de fundo e borda — não só por posição na tela, senão a hierarquia visual não comunica a diferença de importância.

**Raio de borda**: `4px` (input/tag) / `8px` (card/botão) / `12px` (drag-and-drop/modal) — arredondamento leve sinaliza "amigável" sem infantilizar; evitar `0px` (estética técnica) e `20px+` (lúdico demais para o tom 70/30 casual-formal já definido).

---

## 4. Iconografia

- **Estilo**: linha (outline), nunca preenchido — mais legível em tamanho médio, não compete com texto.
- **Espessura**: 2px consistente em todos os ícones — variação de espessura é lida como amadorismo.
- **Tamanho**: ícone visual 24px dentro de área de toque de 44px (WCAG 2.5.5 — crítico porque o dispositivo dominante da persona é tablet, onde precisão de toque é menor que com mouse).
- **Biblioteca**: **Lucide** (licença ISC, gratuita, self-host, espessura 2px nativa).

### Selo "100% local" — especificação
- Forma: pill (`--radius-md`), fundo `--blue-100`, borda `1px solid --gray-300`.
- Ícone: `shield-check`, 20px, `--blue-800`.
- Texto: "100% local" em `--text-caption`, peso 500, `--blue-800`.
- Posição: topo direito, permanente em todas as telas de ação e resultado (não some).
- **Não é**: verde (confundiria com progresso/sucesso), vermelho, cadeado genérico (ícone ubíquo, significado diluído), nem animado (animação sinaliza instabilidade, não segurança).

---

## 5. Aplicação às 8 telas do wireframe

| Tela | Decisões-chave |
|---|---|
| **1 — Instalação/Gatekeeper** | Fundo neutro; aviso em `--amber-700`/`--amber-100` (**nunca vermelho**); ícone `info` (não `alert-triangle`); screenshot real do aviso do macOS; texto tranquilizador ("isso é normal"), nunca "bypass" nem pedido de desculpas |
| **2 — Seleção de arquivo** | Área de drop em `--beige-200`, borda tracejada; selo "100% local" já visível aqui, antes do clique |
| **3 — Drag-and-drop ativo** | Área muda para `--blue-100` com borda sólida `--blue-700` no hover |
| **4 — Pré-conversão (preview)** | Card `--beige`; contagem de páginas OCR-vs-texto-nativo como texto contextual |
| **5 — Ajuste de metadados** | Campos condicionais, recolhidos por padrão, em `--beige-200` |
| **6 — Conversão em andamento** | Fundo nunca muda para verde (prematuro); status textual concreto ("Página 47 de 312"); barra em `--green-600`, visível à distância |
| **7 — Sucesso + transferência** | Ícone `check-circle` `--green-700`; card `--green-100`; guia de transferência por dispositivo aparece só aqui |
| **8 — Erro/ressalva** | Fundo permanece neutro (não vermelho global); erro contido em card `--red-100`; CTA de recuperação em **azul**, não vermelho ("vamos resolver junto", não "você errou") |

---

## 6. Ressalvas e riscos residuais (declarados, não escondidos)

- **`--gray-500` (#6B6258) é o par com menor margem** do sistema (5,59:1, ainda acima do mínimo 4,5:1, mas o mais próximo do limite). Se for usado para texto que o usuário realmente precisa ler com atenção (não só decorativo), considerar escurecer — a persona já tem fadiga visual documentada como preocupação real.
- **28 pares foram verificados computacionalmente e reconferidos de forma independente** (diferença máxima de 0,005 entre as duas checagens) — alta confiança nos números, mas o teste real (usuário de verdade, tela real, condição de luz real) ainda não foi feito. Tratar como forte hipótese validada matematicamente, não como validação de campo.
- Este documento herda o mesmo grau de confiança da pesquisa de identidade visual que o originou: paleta e tipografia têm evidência forte; formato exato de mensagens (ex. texto do Gatekeeper) é inferência razoável, não testada com usuário real.

## 7. Checklist de implementação

- [ ] Self-host Inter (pesos 400/500/700) — nunca CDN
- [ ] Self-host Lucide (subset apenas dos ícones usados)
- [ ] `:root` com todos os tokens CSS acima
- [ ] Confirmar `--gray-300 = #897A60`, `--green-700 = #226640`, `--green-600 = #24663C` (valores corrigidos, não os originais que falhavam)
- [ ] Selo "100% local" presente em todas as telas de ação e resultado
- [ ] Tela 1 (Gatekeeper) usa família `--amber-*`, nunca `--red-*`
- [ ] Tela 8 (erro): título em `--red-700`, mas CTA de ação em `--blue-800`
- [ ] Testar em tablet Android (Galaxy Tab S6 Lite — dispositivo dominante da persona)
- [ ] Testar em máquina antiga (renderização de fonte/ícone, performance)
- [ ] Revisão ortográfica de toda copy antes de cada release

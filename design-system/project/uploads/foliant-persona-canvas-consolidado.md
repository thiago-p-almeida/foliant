# Persona Canvas Consolidado — Foliant
## Concurseiro/Estudante brasileiro (nome de referência: "Carlos Estudo" — fictício, só rótulo)

Documento consolidado a partir de: pesquisa JTBD original, Deep Research
T1+T3+T4 (dispositivo/dor/tamanho de arquivo), Deep Research T5
(ferramentas de OCR/conversão já tentadas), Deep Research T2
(transferência pós-conversão). Cada afirmação está rotulada por nível
de confiança: [CONFIRMADO] = evidência direta real; [INFERÊNCIA] =
razoável mas não testada especificamente para este subgrupo.

---

## 1. Contexto situacional [CONFIRMADO]
Estudante/profissional em preparação para concursos públicos no Brasil,
com acesso a materiais digitalizados de qualidade variável (apostilas,
livros esgotados, material de biblioteca/curso escaneado), buscando
estudar de forma portátil e confortável.

## 2. Job funcional [CONFIRMADO]
Transformar um livro/apostila escaneado (PDF só-imagem, centenas de
páginas, **centenas de MB — não dezenas**) em EPUB pesquisável e
reflowável que leia bem em tablet ou e-reader.

## 3. Job emocional/social [CONFIRMADO]
Parar de sofrer com pinch-and-zoom/paisagem constante; estudar com
conforto (fonte ajustável, reflow); sentir que resolveu o material sem
pagar edição paga.

## 4. Gatilho [CONFIRMADO]
Ter em mãos um PDF escaneado essencial e descobrir que o dispositivo de
leitura exibe mal esse tipo de arquivo.

## 5. Dispositivo dominante — TABLET, não e-reader dedicado [CONFIRMADO]
- **Samsung Galaxy Tab S6 Lite** é citado como "o tablet dos
  concurseiros" em múltiplas threads independentes.
- iPad + Apple Pencil: alternativa secundária, menos citada.
- **Kindle/e-reader é percebido como inadequado, não só subótimo**: "não
  tem como mudar o tamanho da fonte de imagens/PDF e a tela é pequena".
  Visto como "só pra leitura"; tablet é multifuncional (aulas,
  anotação).
- Celular é considerado inviável ("complicado demais").
- PC/notebook usado em casa, com mesa digitalizadora para anotação —
  perde portabilidade.

## 6. A dor muda de natureza por dispositivo [CONFIRMADO]
- **E-reader**: dor técnica — reflow não funciona em PDF-imagem.
- **Tablet**: dor de conforto, não de viabilidade — funciona, mas sem
  reflow, compensado por anotação com caneta. "O menor mal."
- **Celular**: dor crítica, inviabilizante.

## 7. Tamanho de arquivo real — centenas de MB é a norma [CONFIRMADO]
- PDF-imagem não-OCR de 500 páginas ≈ 250MB.
- **Bate exatamente com a faixa já validada tecnicamente pelo Foliant**
  (testado até 169MB/903 páginas, RAM constante ~282MB).
- Ferramentas gratuitas online limitam 20-30MB — inviável para os
  arquivos reais.

## 8. Alternativas usadas hoje [CONFIRMADO]
- Ler no tablet mesmo, sem reflow, compensando com anotação.
- Tentar Kindle e desistir.
- Imprimir em gráfica (~R$30/300 páginas) quando a leitura cansa.
- **Calibre trava/falha em PDFs grandes**: "stuck at 1%", "falha na
  extração do texto quando o tamanho do livro é muito grande" — mesmo
  problema que a arquitetura de streaming do Foliant já resolve.
- "PDFs sintéticos" de cursinhos como tentativa paliativa — qualidade
  inferior ao original.
- Pagar PDFelement ou ABBYY FineReader (mesmo motor de OCR por baixo).

## 9. Barreiras reais [CONFIRMADO]
- Instalação técnica complexa (dependências, linha de comando).
- Medo de resultado "bagunçado" (muita imagem/colunas no original).
- Necessidade de confiar que o OCR funcione bem em português.
- Desconfiança de que a conversão preserve qualidade ("conversão de
  pdf para epub por quem não manja não dá certo").

## 10. Jornada de descoberta de ferramentas — achado mais estratégico [CONFIRMADO]
**A barreira real não é falta de ferramenta — é fragmentação.** O
usuário descobre por tentativa e erro (não por conhecimento prévio) que
precisa de dois passos: OCR primeiro, conversão depois, usando 2+
ferramentas diferentes.

- A maioria não busca "OCR" — busca "converter PDF para EPUB".
- **Calibre**: mais tentada e a que mais frustra — não faz OCR
  (confirmado na própria documentação oficial dele). Perde texto,
  destrói formatação, "ilegível", trava em arquivo grande.
- **ABBYY FineReader**: reconhecida como a melhor, mas o custo
  (US$69-165/ano) é a barreira decisiva. Nenhum relato de concurseiro
  brasileiro dizendo "paguei e resolveu".
- **Padrão de abandono mais documentado**: Calibre falha → descobre
  que ABBYY resolveria → ABBYY é caro → desiste (volta à leitura
  desconfortável ou impressão).

**Mensagem de posicionamento sugerida pela pesquisa** (para validar,
não adotar cegamente): *"Calibre não converte PDFs escaneados. ABBYY é
caro. Foliant faz OCR em português e converte para EPUB — grátis e
offline, em um passo só."*

## 11. Anti-necessidade confirmada, com nuance [CONFIRMADO]
Envio automático por e-mail ao dispositivo (SMTP dentro do Foliant) —
**removido do escopo**, decisão fechada. Mas transferência **não é
100% trivial na prática**:

- **EPUB não funciona via USB no Kindle** (confirmado em 5+ threads
  independentes) — o Kindle não reconhece EPUB por cabo, arquivo fica
  "invisível" mesmo na pasta certa. Caminho real: Send to Kindle web
  (até 200MB) ou converter para AZW3 no Calibre.
- **Tablet**: ponte real é nuvem (Google Drive/OneDrive) → abrir com
  Moon+ Reader ou Xodo. Fricção: app às vezes não acha o EPUB no
  auto-import (precisa "Abrir com" manual); Samsung Notes cria cópia em
  vez de ler o original.
- **iPad**: AirDrop ou iTunes/Finder — "a huge pain in the ass".

**Resposta correta à fricção**: um guia curto pós-conversão
(documentação/UI, não código de envio) — não reabre a decisão sobre
e-mail.

## 12. Camada demográfica geral [INFERÊNCIA — não confirmada para o subgrupo de PDF escaneado]
- Idade: 25-39 anos predominante (25-29 mais representativa em 2025).
- Educação: 82,55%-85% com superior completo ou em andamento.
- Renda: 57,9% das famílias com ≤3 salários mínimos.
- Mobilidade valorizada no ambiente de estudo.

---

## Implicações de UI/UX já confirmadas
- Onboarding radicalmente simples (barreira: instalação complexa).
- OCR de alta qualidade em português como prioridade de engenharia.
- Preservar layout complexo na conversão.
- Output sempre reflowável e pesquisável.
- Não construir envio por e-mail.
- Mensagem de produto deve nomear "tablet" explicitamente, não só
  "e-reader".
- "Não trava com arquivos grandes" é diferencial competitivo real e
  nomeável (contraste direto com a dor documentada do Calibre).

## Candidatos de UI/UX a considerar (não são tarefas fechadas)
1. **Transparência sobre o que vai acontecer**: "X de Y páginas já têm
   texto — Z serão processadas com OCR", antes/durante a conversão.
   Ataca diretamente o medo de "resultado bagunçado". O pipeline já
   calcula esse número internamente.
2. **Suavizar a palavra "OCR" na interface visível** — ninguém busca
   por esse termo.
3. **Selo de privacidade/offline dentro do app** ("🔒 100% local — seu
   arquivo nunca sai do computador") — hoje só está no README.
4. **Frase de posicionamento sobre hardware fraco** — usuário real
   relatou não conseguir usar ABBYY por "computador antigo que não
   suportava". Reforça que "roda em máquina fraca" é diferencial
   percebido, não só restrição técnica interna.

## Tarefas de projeto já registradas (contexto, não para o wireframe agir sobre elas diretamente)
- Testar Tesseract contra apostila de concurso real (pendente de
  arquivo do usuário) — fecha lacuna de CER em português.
- Guia pós-conversão por tipo de dispositivo (Kindle/tablet/iPad) — via
  texto de UI, sem SMTP nem nova permissão de rede.

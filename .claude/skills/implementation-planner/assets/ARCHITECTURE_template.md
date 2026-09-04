<!--
Template para uma nova seção em ARCHITECTURE.md, o par técnico de uma
entrada em TASKS.md (ver TASKS_template.md). TASKS.md registra o que foi
feito e o resultado; ARCHITECTURE.md registra o raciocínio, a evidência
completa e as decisões de design por trás. Não duplique o texto entre os
dois — TASKS.md pode linkar aqui para "ver ARCHITECTURE.md para detalhes".
-->

## Fase N: [mesmo nome usado em TASKS.md]

### Objetivo e restrição

[O que esta fase deveria resolver, e o que NÃO podia regredir — RAM,
byte-identidade de outra parte do pipeline, uma heurística já validada
noutro livro. Nomear a restrição aqui é o que permite que a fase de
validação, mais abaixo, tenha um critério de aceite claro.]

### Investigação (dados reais, antes de qualquer código)

[Tabela ou lista com os números reais medidos — posições, alturas,
contagens, o que for o sinal relevante — de páginas/casos reais do
projeto. Se não existe dado real disponível para uma parte do escopo,
declare isso aqui, não deixe implícito.]

### Decisão / critério (calibrado com os números acima)

[O valor escolhido (limiar, regra, fórmula) e por que ESSE valor — a
margem real entre o pior caso positivo e o pior caso negativo
observados, não uma justificativa teórica.]

> **RISCO RESIDUAL** [se aplicável, no mesmo formato usado no resto do
> arquivo]: calibrado contra [N livros/páginas] — não é uma prova geral.
> Cenário concreto que poderia quebrar: [descrição específica, não
> "pode não generalizar"].

### Validação

[Tabela antes/depois ou resultado medido, contra o pipeline de produção
real — não uma função isolada. Ver skill `skeptical-review` antes de
escrever esta seção como "concluída".]

### Limitações conhecidas

- [Cada limitação como um fato observado, não uma hedge genérica —
  "X casos de Y não foram detectados, por Z motivo confirmado", não
  "pode haver casos não cobertos".]

<!--
Template para uma nova entrada em TASKS.md. Copie a seção abaixo, preencha
com dados reais em cada colchete. Não deixe nenhum [placeholder] no texto
final — se um dado real não existir ainda, isso é um achado a registrar
("não testado contra X"), não um espaço para preencher depois.
-->

## Fase N: [nome curto e específico da mudança] ([data ISO])

[1-2 frases: o que motivou esta fase — sintoma relatado, objetivo
funcional, ou item puxado do backlog. Se veio de um relato de usuário,
diga isso explicitamente.]

Testado contra `[arquivo real em samples/]` ([N páginas, tamanho]).

- [ ] **[Nome do item — o que foi mudado, não por que].** Resultado:
  [confirmado / revertido / parcialmente resolvido] — [dado real: uma
  contagem, uma tabela antes/depois, um exit code, não uma afirmação
  genérica de "funcionou"].
  - Se a implementação exigiu mais de uma tentativa: registre a
    tentativa que não funcionou e por quê, não só a versão final.
  - Se um bug real foi encontrado durante a validação (não um ajuste de
    calibração, um erro de lógica): registre separadamente, com a causa
    raiz confirmada por leitura de código/log, não suposição.

**Fechamento**: [resumo de 1-2 frases do resultado líquido — quantos
itens fecharam, quantos foram revertidos com justificativa, o que ficou
como risco residual ou backlog]. Antes de escrever esta linha, rode a
checklist de fechamento (skill `skeptical-review`).

`requirements.txt`: [alterado / não alterado — se alterado, qual
dependência nova e por quê].

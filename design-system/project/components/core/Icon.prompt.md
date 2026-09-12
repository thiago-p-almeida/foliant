Ícone de linha da biblioteca Lucide (traço 2px, nunca preenchido) — use sempre este wrapper em vez de escrever SVG à mão.

```jsx
<Icon name="shield-check" size={20} color="var(--blue-800)" />
```

- `name` é o nome Lucide em kebab-case (`file-text`, `circle-check`, `info`, `folder-open`).
- Tamanho padrão 24px; use 20px dentro de selos/tags e 16px em legendas.
- Nunca use `alert-triangle` para o aviso do Gatekeeper — o ícone correto ali é `info`.
- O Lucide renomeou `check-circle` → `circle-check` e `alert-circle` → `circle-alert`. Os nomes antigos continuam funcionando como alias, mas escreva os novos.

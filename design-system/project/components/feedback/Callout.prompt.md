Mensagem contida em card — o fundo da tela nunca muda de cor, a mensagem fica dentro do bloco.

```jsx
<Callout tone="warning" title="Isso é normal na primeira abertura">
  O macOS avisa que não conhece o desenvolvedor. Clique com o botão direito no
  Foliant e escolha Abrir.
</Callout>

<Callout tone="error" title="A conversão parou na página 214."
  actions={<Button variant="primary">Tentar de novo</Button>}>
  O PDF parece estar danificado nessa página.
</Callout>
```

- Aviso do Gatekeeper: sempre `warning` com ícone `info` — nunca `error`, nunca `alert-triangle`, nunca a palavra "bypass" e nunca pedido de desculpas.
- Erro comunica causa + ação, sem código bruto nem nome de dependência.

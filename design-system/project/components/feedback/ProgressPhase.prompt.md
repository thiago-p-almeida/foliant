Fase de conversão com barra `--green-600` — três fases empilhadas cobrem a conversão inteira.

```jsx
<ProgressPhase label="Lendo as páginas" counter="473 de 903" percent={52} state="active" />
<ProgressPhase label="Montando o livro" state="pending" indeterminate />
<ProgressPhase label="Fechando o EPUB" state="pending" />
```

- Rótulos em vocabulário do usuário: "Lendo as páginas", "Montando o livro", "Fechando o EPUB" — nunca "OCR", "HTML" ou "EPUB pipeline".
- O fundo da tela não muda para verde durante a conversão (comemoração prematura).
- Fase pendente fica a 45% de opacidade; concluída ganha o check verde.

Botão de ação com rótulo em voz ativa ("Converter para EPUB", "Abrir EPUB") — só um `primary` por tela.

```jsx
<Button variant="primary" fullWidth>Converter para EPUB</Button>
<Button variant="secondary" icon="folder-open">Selecionar arquivo…</Button>
<Button variant="ghost" size="sm">Trocar</Button>
```

- Em tela de erro, o CTA de recuperação é azul (`primary`), nunca vermelho.
- `success` só aparece em tela de resultado concluído.
- Altura mínima 44px (alvo de toque); `size="sm"` (36px) apenas para ações auxiliares dentro de card.

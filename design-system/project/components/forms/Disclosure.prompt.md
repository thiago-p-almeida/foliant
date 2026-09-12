Bloco recolhível: o mecanismo que mantém uma ação principal por tela sem esconder recursos.

```jsx
<Disclosure summary="Ajustar título e autor do livro">
  <TextField label="Título" />
  <TextField label="Autor" placeholder="Desconhecido" />
</Disclosure>
```

Sempre recolhido por padrão (`defaultOpen` só quando o usuário já interagiu). Use também para "Ver log detalhado".

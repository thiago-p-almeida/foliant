Moldura de janela para mostrar qualquer tela do app em contexto.

```jsx
<AppWindow title="Foliant" badge={<LocalBadge />}>
  <DropZone />
</AppWindow>
```

O título reflete o estado ("Foliant", "Foliant — convertendo"). O selo fica no slot `badge` em todas as telas de ação e resultado.

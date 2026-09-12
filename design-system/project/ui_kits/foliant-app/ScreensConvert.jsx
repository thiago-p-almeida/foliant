const { AppWindow, LocalBadge, Button, Card, Tag, Callout, ProgressPhase, TextField, SegmentedControl, Checkbox, Disclosure, FileSummary, Icon } = window.FoliantDesignSystem_b90fff;

function PreviewScreen({ onNext, onBack }) {
  return (
    <AppWindow title="Foliant" badge={<LocalBadge />} width={620}>
      <FileSummary
        name="apostila-direito-adm.pdf"
        meta="903 páginas · 108 MB"
        action={<Button variant="ghost" size="sm" onClick={onBack}>Trocar</Button>}
      />
      <Card surface="card" padding="var(--space-4)">
        <h2 className="fo-heading" style={{ marginBottom: "var(--space-3)" }}>O que vai acontecer</h2>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
          <Tag tone="brand">41 páginas com texto</Tag>
          <Tag tone="warning">862 páginas escaneadas</Tag>
        </div>
        <p className="fo-body">
          41 páginas já têm texto de verdade. As outras 862 são imagem escaneada — o Foliant vai reconhecer o texto delas letra por letra.
        </p>
        <p className="fo-body" style={{ marginTop: "var(--space-2)" }}>
          É por isso que demora. No fim, o livro fica com fonte ajustável e busca por palavra.
        </p>
      </Card>
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <span className="fo-caption">Tempo estimado</span>
          <p className="fo-body" style={{ color: "var(--text-title)" }}>~35 min</p>
        </div>
        <div style={{ flex: 2, minWidth: 220 }}>
          <span className="fo-caption">Salva em</span>
          <p className="fo-body" style={{ color: "var(--text-title)", wordBreak: "break-all" }}>
            …/apostila-direito-adm.epub <a href="#" onClick={(e) => e.preventDefault()}>alterar</a>
          </p>
        </div>
      </div>
      <Disclosure summary="Ajustar título e autor do livro">
        <TextField label="Título" placeholder="apostila-direito-adm" help="É o nome que vai aparecer na estante do seu aparelho." />
        <TextField label="Autor" placeholder="Desconhecido" />
        <SegmentedControl label="Idioma do livro" options={["Português", "Inglês", "Espanhol"]} />
        <p className="fo-caption">Ajuda o reconhecimento a acertar acentos e cedilhas.</p>
      </Disclosure>
      <Button variant="primary" size="lg" fullWidth onClick={onNext}>Converter para EPUB</Button>
      <Checkbox label="Continua tudo no seu computador" checked />
    </AppWindow>
  );
}

function ConvertingScreen({ onNext, onError }) {
  const [page, setPage] = React.useState(473);
  React.useEffect(() => {
    const t = setInterval(() => setPage((p) => (p < 903 ? p + 7 : p)), 400);
    return () => clearInterval(t);
  }, []);
  const pct = Math.round((page / 903) * 100);
  return (
    <AppWindow title="Foliant — convertendo" badge={<LocalBadge />} width={620}>
      <p className="fo-heading">apostila-direito-adm.pdf</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <ProgressPhase label="Lendo as páginas" counter={`${page} de 903`} percent={pct} state={page >= 903 ? "done" : "active"} />
        <ProgressPhase label="Montando o livro" state={page >= 903 ? "active" : "pending"} indeterminate={page >= 903} />
        <ProgressPhase label="Fechando o EPUB" state="pending" />
      </div>
      <Callout tone="info" icon="circle-check">
        Até agora: {Math.max(0, page - 75)} páginas reconhecidas a partir da imagem, 41 aproveitadas do texto original. Nenhuma falha.
      </Callout>
      <p className="fo-caption">Faltam ~19 min. Pode deixar rodando e usar o computador normalmente.</p>
      <Disclosure summary="Ver log detalhado" surface="plain">
        <pre style={{ margin: 0, padding: "var(--space-3)", background: "var(--beige-200)", borderRadius: "var(--radius-md)", font: "400 13px/1.6 var(--font-mono)", color: "var(--gray-700)", maxHeight: 120, overflow: "auto" }}>{`página ${page}: texto reconhecido
página ${page - 1}: texto reconhecido
página ${page - 2}: texto já existente, aproveitado`}</pre>
      </Disclosure>
      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={onError}>Simular falha</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="primary" onClick={onNext}>Ir para o resultado</Button>
      </div>
    </AppWindow>
  );
}

Object.assign(window, { PreviewScreen, ConvertingScreen });

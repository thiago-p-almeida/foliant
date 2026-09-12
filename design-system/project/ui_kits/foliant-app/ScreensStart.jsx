const { AppWindow, LocalBadge, Button, Card, Tag, Callout, ProgressPhase, DropZone, TextField, SegmentedControl, Checkbox, Disclosure, FileSummary, Icon } = window.FoliantDesignSystem_b90fff;

function ScreenTitle({ children, sub }) {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
      <h1 className="fo-display">{children}</h1>
      {sub ? <p className="fo-caption">{sub}</p> : null}
    </div>
  );
}

function GatekeeperScreen({ onNext }) {
  return (
    <AppWindow title="Foliant" width={620}>
      <ScreenTitle sub="Converter PDF escaneado para EPUB">Foliant</ScreenTitle>
      <Callout tone="warning" title="Isso é normal na primeira abertura">
        O macOS avisa que não conhece o desenvolvedor de programas gratuitos como este. O Foliant continua sendo o mesmo arquivo que você baixou.
        <ol style={{ margin: "var(--space-3) 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Clique com o botão direito no ícone do Foliant.</li>
          <li>Escolha <strong>Abrir</strong> no menu.</li>
          <li>Confirme <strong>Abrir</strong> na janela do sistema.</li>
        </ol>
      </Callout>
      <p className="fo-caption" style={{ textAlign: "center" }}>Você faz isso uma vez. Nas próximas vezes o app abre com um clique.</p>
      <Button variant="primary" fullWidth onClick={onNext}>Entendi, vamos começar</Button>
    </AppWindow>
  );
}

function SelectScreen({ onNext }) {
  const [dragging, setDragging] = React.useState(false);
  return (
    <AppWindow title="Foliant" badge={<LocalBadge />} width={620}>
      <ScreenTitle sub="Converter PDF escaneado para EPUB">Foliant</ScreenTitle>
      <DropZone
        active={dragging}
        title={dragging ? "Solte para começar" : "Arraste seu PDF aqui"}
        hint={dragging ? null : "ou"}
        action={dragging ? null : <Button variant="secondary" icon="folder-open" onClick={onNext}>Selecionar arquivo…</Button>}
        note={dragging ? null : "Aceita PDF de qualquer tamanho — inclusive apostilas de centenas de MB."}
        onActivate={onNext}
      />
      <Card surface="brandTint" padding="var(--space-3)">
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Icon name="shield-check" size={24} color="var(--blue-800)" />
          <p className="fo-caption" style={{ color: "var(--gray-700)" }}>
            <strong style={{ color: "var(--blue-800)" }}>100% no seu computador.</strong> O arquivo não é enviado para nenhum servidor. Funciona sem internet e em máquina antiga.
          </p>
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Button variant="ghost" size="sm" onMouseDown={() => setDragging(!dragging)}>
          {dragging ? "Sair do estado de arraste" : "Simular arquivo sobre a janela"}
        </Button>
      </div>
    </AppWindow>
  );
}

Object.assign(window, { ScreenTitle, GatekeeperScreen, SelectScreen });

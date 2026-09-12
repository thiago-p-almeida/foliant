const { AppWindow, LocalBadge, Button, Card, Callout, Disclosure, SegmentedControl, Icon } = window.FoliantDesignSystem_b90fff;

const guides = {
  "Tablet Android": [
    "Suba o .epub para o Google Drive ou OneDrive.",
    "No tablet, abra o app do Drive e baixe o arquivo.",
    "Toque no arquivo e escolha Moon+ Reader ou Xodo.",
  ],
  Kindle: [
    "Conecte o Kindle ao computador pelo cabo USB.",
    "Copie o .epub para a pasta Documents do aparelho.",
    "Desconecte: o livro aparece na sua biblioteca.",
  ],
  iPad: [
    "Envie o .epub para você mesmo pelo AirDrop ou e-mail.",
    "Toque no arquivo e escolha Copiar para Livros.",
    "O livro fica na estante do app Livros.",
  ],
};

function SuccessScreen({ onRestart, warning = false }) {
  const [device, setDevice] = React.useState("Tablet Android");
  return (
    <AppWindow title="Foliant" badge={<LocalBadge />} width={620}>
      {warning ? (
        <Callout tone="warning" title="Seu livro está pronto, com uma ressalva">
          61 das 903 páginas estavam tortas ou muito claras no original, e o texto delas pode ter erros. As outras 842 ficaram boas.
          <div style={{ marginTop: "var(--space-2)" }}><a href="#" onClick={(e) => e.preventDefault()}>Ver a lista de páginas</a></div>
        </Callout>
      ) : (
        <Callout tone="success" title="Pronto. Seu livro está convertido.">
          903 páginas, com texto pesquisável e fonte ajustável.
          <div style={{ marginTop: "var(--space-1)", wordBreak: "break-all", color: "var(--gray-500)" }}>…/apostila-direito-adm.epub</div>
        </Callout>
      )}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button variant="success" icon="book-open">Abrir EPUB</Button>
        <Button variant="secondary" icon="folder-open">Ver na pasta</Button>
      </div>
      <Card surface="card" padding="var(--space-4)">
        <h2 className="fo-heading" style={{ marginBottom: "var(--space-3)" }}>Como levar para o seu aparelho</h2>
        <SegmentedControl options={Object.keys(guides)} value={device} onChange={setDevice} />
        <ol style={{ margin: "var(--space-3) 0 0", paddingLeft: 20, font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)", color: "var(--gray-700)" }}>
          {guides[device].map((s) => <li key={s} style={{ marginBottom: "var(--space-1)" }}>{s}</li>)}
        </ol>
        <p className="fo-caption" style={{ marginTop: "var(--space-3)" }}>
          Se o app de leitura não achar o livro, abra o gerenciador de arquivos, toque no .epub e use “Abrir com”. É comum e não significa que a conversão falhou.
        </p>
      </Card>
      <Disclosure summary="Ver log detalhado" surface="plain">
        <pre style={{ margin: 0, padding: "var(--space-3)", background: "var(--beige-200)", borderRadius: "var(--radius-md)", font: "400 13px/1.6 var(--font-mono)", color: "var(--gray-700)" }}>{`903 páginas processadas
862 reconhecidas a partir da imagem
41 aproveitadas do texto original`}</pre>
      </Disclosure>
      <Button variant="secondary" fullWidth onClick={onRestart}>Converter outro PDF</Button>
    </AppWindow>
  );
}

function ErrorScreen({ onRetry }) {
  return (
    <AppWindow title="Foliant" badge={<LocalBadge />} width={620}>
      <Callout
        tone="error"
        title="A conversão parou na página 214."
        actions={<><Button variant="primary" onClick={onRetry}>Tentar de novo</Button><Button variant="secondary">Ver log detalhado</Button></>}
      >
        O PDF parece estar danificado nessa página. O que já foi feito não foi perdido — o Foliant retoma de onde parou.
      </Callout>
      <p className="fo-caption">Se acontecer de novo na mesma página, vale tentar baixar o PDF outra vez da fonte original.</p>
    </AppWindow>
  );
}

Object.assign(window, { SuccessScreen, ErrorScreen });

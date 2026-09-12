/**
 * Área de arrastar-e-soltar do PDF — o elemento essencial da tela inicial.
 * @startingPoint section="Formulários" subtitle="Área de drop em repouso e no estado ativo" viewport="700x320"
 */
export interface DropZoneProps {
  title?: string;
  hint?: string;
  /** Ação alternativa ao arraste, ex. <Button variant="secondary">Selecionar arquivo…</Button>. */
  action?: React.ReactNode;
  /** Nota de suporte abaixo da ação ("Aceita PDF de qualquer tamanho"). */
  note?: string;
  /** Estado ativo (arquivo sobre a janela): tint azul e borda sólida. */
  active?: boolean;
  onActivate?: () => void;
  style?: React.CSSProperties;
}
export function DropZone(props: DropZoneProps): JSX.Element;

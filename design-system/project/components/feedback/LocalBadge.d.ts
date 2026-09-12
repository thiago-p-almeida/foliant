/**
 * Selo "100% local" — presente e permanente em toda tela de ação e resultado.
 * @startingPoint section="Feedback" subtitle="Selo de privacidade permanente" viewport="700x120"
 */
export interface LocalBadgeProps {
  /** Texto do selo. Padrão "100% local". */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function LocalBadge(props: LocalBadgeProps): JSX.Element;

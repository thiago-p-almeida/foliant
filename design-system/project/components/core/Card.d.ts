/**
 * Superfície elevada em neutro quente. Card dentro de card usa `surface="sunken"`.
 * @startingPoint section="Core" subtitle="Superfícies bege, afundada, branca e tint de marca" viewport="700x200"
 */
export interface CardProps {
  children?: React.ReactNode;
  surface?: "card" | "sunken" | "plain" | "brandTint";
  /** Padding CSS. Padrão var(--space-4) — condicional. Use var(--space-8) para conteúdo essencial. */
  padding?: string;
  /** Raio. Padrão var(--radius-md); use var(--radius-lg) em modal/drop. */
  radius?: string;
  bordered?: boolean;
  elevated?: boolean;
  style?: React.CSSProperties;
}
export function Card(props: CardProps): JSX.Element;

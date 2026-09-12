/**
 * Rótulo contextual compacto (contagem de páginas, estado de fase, idioma detectado).
 * @startingPoint section="Core" subtitle="Tags contextuais nos cinco tons semânticos" viewport="700x140"
 */
export interface TagProps {
  children?: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "error";
  /** Nome de ícone Lucide, 16px. */
  icon?: string;
  style?: React.CSSProperties;
}
export function Tag(props: TagProps): JSX.Element;

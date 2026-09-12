export interface IconProps {
  /** Nome do ícone Lucide em kebab-case, ex. "shield-check", "file-text". */
  name: string;
  /** Tamanho em px. Padrão 24 (ícone visual dentro de área de toque de 44px). */
  size?: number;
  /** Cor do glifo. Padrão currentColor. */
  color?: string;
  style?: React.CSSProperties;
}
export function Icon(props: IconProps): JSX.Element;

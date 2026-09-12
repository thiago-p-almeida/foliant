/**
 * Botão de ação. Uma ação principal (`primary`) por tela.
 * @startingPoint section="Core" subtitle="Botões primário, secundário, ghost e sucesso" viewport="700x220"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** `primary` = ação principal da tela; `secondary` = ação alternativa; `ghost` = link de ação; `success` = ação sobre resultado concluído. */
  variant?: "primary" | "secondary" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  /** Nome de ícone Lucide antes do rótulo. */
  icon?: string;
  /** Nome de ícone Lucide depois do rótulo. */
  iconEnd?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Elemento renderizado. Padrão "button". */
  as?: "button" | "a";
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;

/**
 * Moldura da janela do app desktop, com barra de título e slot para o selo "100% local".
 * @startingPoint section="Estrutura" subtitle="Janela do app com barra de título e selo" viewport="700x340"
 */
export interface AppWindowProps {
  /** Texto da barra de título, ex. "Foliant" ou "Foliant — convertendo". */
  title?: string;
  /** Canto superior direito — normalmente <LocalBadge />. */
  badge?: React.ReactNode;
  children?: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
}
export function AppWindow(props: AppWindowProps): JSX.Element;

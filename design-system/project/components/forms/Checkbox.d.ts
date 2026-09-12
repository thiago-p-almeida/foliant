/**
 * Caixa de seleção com rótulo e ajuda opcional.
 * @startingPoint section="Formulários" subtitle="Caixa marcada, desmarcada e com texto de apoio" viewport="700x180"
 */
export interface CheckboxProps {
  label: string;
  help?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  id?: string;
  style?: React.CSSProperties;
}
export function Checkbox(props: CheckboxProps): JSX.Element;

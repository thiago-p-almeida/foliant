/**
 * Escolha única entre três opções curtas e nomeadas (idioma do documento, aparelho de destino).
 * @startingPoint section="Formulários" subtitle="Escolha única com rótulos em português" viewport="700x160"
 */
export interface SegmentedControlProps {
  /** Rótulos visíveis, no idioma do usuário — nunca códigos ("Português", não "por"). */
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  style?: React.CSSProperties;
}
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;

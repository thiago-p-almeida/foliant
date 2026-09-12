/**
 * Bloco recolhível — é assim que opções avançadas e log detalhado existem sem poluir a tela.
 * @startingPoint section="Formulários" subtitle="Opções avançadas recolhidas por padrão" viewport="700x240"
 */
export interface DisclosureProps {
  /** Rótulo do gatilho, em voz ativa ("Ajustar título e autor"). */
  summary: React.ReactNode;
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  surface?: "sunken" | "card" | "plain";
  style?: React.CSSProperties;
}
export function Disclosure(props: DisclosureProps): JSX.Element;

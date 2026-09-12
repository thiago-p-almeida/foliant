/**
 * Uma fase da conversão, com contador concreto e barra verde visível à distância.
 * @startingPoint section="Feedback" subtitle="Fases pendente, ativa, indeterminada e concluída" viewport="700x300"
 */
export interface ProgressPhaseProps {
  /** Nome da fase em vocabulário do usuário ("Lendo as páginas", não "OCR"). */
  label: string;
  /** Progresso concreto, ex. "473 de 903". */
  counter?: string;
  percent?: number;
  state?: "pending" | "active" | "done";
  /** Fase sem contador granular: barra em atividade contínua. */
  indeterminate?: boolean;
  style?: React.CSSProperties;
}
export function ProgressPhase(props: ProgressPhaseProps): JSX.Element;

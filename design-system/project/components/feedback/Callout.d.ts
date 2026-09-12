/**
 * Bloco de mensagem contido: aviso do sistema (âmbar), ressalva, sucesso ou erro real.
 * @startingPoint section="Feedback" subtitle="Aviso âmbar, sucesso verde, erro vermelho e info" viewport="700x400"
 */
export interface CalloutProps {
  /** `warning` (âmbar) para rotina do sistema como o aviso do macOS; `error` só para falha real. */
  tone?: "info" | "warning" | "success" | "error";
  title?: string;
  children?: React.ReactNode;
  /** Sobrescreve o ícone padrão do tom (nome Lucide). */
  icon?: string;
  /** Botões de recuperação. Em erro, o CTA principal é azul. */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Callout(props: CalloutProps): JSX.Element;

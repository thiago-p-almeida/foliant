/**
 * Campo de texto de uma linha, com rótulo e texto de ajuda em linguagem do usuário.
 * @startingPoint section="Formulários" subtitle="Campo com rótulo, ajuda, ação e estado inválido" viewport="700x260"
 */
export interface TextFieldProps {
  label?: string;
  /** Texto de suporte em --text-caption. Nunca jargão técnico. */
  help?: string;
  value?: string;
  placeholder?: string;
  type?: "text" | "search";
  readOnly?: boolean;
  invalid?: boolean;
  id?: string;
  /** Botão colado ao campo, ex. <Button variant="secondary">Selecionar…</Button>. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export function TextField(props: TextFieldProps): JSX.Element;

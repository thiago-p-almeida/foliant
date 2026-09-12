/**
 * Linha do arquivo selecionado: nome, tamanho/páginas e ação de troca.
 * @startingPoint section="Estrutura" subtitle="Arquivo selecionado com ação de troca" viewport="700x140"
 */
export interface FileSummaryProps {
  name: string;
  /** Metadados em uma linha, ex. "903 páginas · 108 MB". */
  meta?: string;
  /** Ação secundária, normalmente <Button variant="ghost" size="sm">Trocar</Button>. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export function FileSummary(props: FileSummaryProps): JSX.Element;

import React from "react";
import { Icon } from "../core/Icon.jsx";

/* Selo permanente de privacidade. Especificação fixa: pill, fundo --blue-100,
   borda 1px --gray-300, ícone shield-check 20px --blue-800, texto caption 500.
   Nunca verde, nunca vermelho, nunca cadeado genérico, nunca animado. */
export function LocalBadge({ children = "100% local", style, ...rest }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-1) var(--space-3)",
        background: "var(--blue-100)",
        border: "1px solid var(--gray-300)",
        borderRadius: "var(--radius-md)",
        font: "500 var(--text-caption)/var(--text-caption-line) var(--font-sans)",
        color: "var(--blue-800)",
        ...style,
      }}
      {...rest}
    >
      <Icon name="shield-check" size={20} color="var(--blue-800)" />
      {children}
    </span>
  );
}

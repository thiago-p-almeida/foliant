import React from "react";

/* Moldura de janela do app desktop: barra de título discreta + área de conteúdo
   com largura máxima de 560px (a mesma do app real). */
export function AppWindow({ title = "Foliant", badge, children, width = 640, style, ...rest }) {
  return (
    <div
      style={{
        width,
        maxWidth: "100%",
        background: "var(--surface-app)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-modal)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--beige)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span style={{ display: "flex", gap: 6 }}>
          {["#D6CCBD", "#D6CCBD", "#D6CCBD"].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: "var(--radius-pill)", background: c, border: "1px solid var(--gray-300)" }} />
          ))}
        </span>
        <span style={{ flex: 1, font: "500 var(--text-caption)/1 var(--font-sans)", color: "var(--gray-500)" }}>{title}</span>
        {badge}
      </div>
      <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>{children}</div>
    </div>
  );
}

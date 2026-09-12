import React from "react";
import { Icon } from "../core/Icon.jsx";

const tones = {
  info: { bg: "var(--blue-100)", border: "var(--blue-600)", fg: "var(--blue-800)", icon: "info" },
  warning: { bg: "var(--amber-100)", border: "var(--amber-600)", fg: "var(--amber-700)", icon: "info" },
  success: { bg: "var(--green-100)", border: "var(--green-700)", fg: "var(--green-700)", icon: "circle-check" },
  error: { bg: "var(--red-100)", border: "var(--red-700)", fg: "var(--red-700)", icon: "circle-alert" },
};

export function Callout({ tone = "info", title, children, icon, actions, style, ...rest }) {
  const t = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-md)",
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon || t.icon} size={24} color={t.fg} style={{ marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: 0 }}>
        {title ? (
          <p style={{ margin: 0, font: "var(--text-heading-weight) var(--text-heading)/var(--text-heading-line) var(--font-sans)", color: t.fg }}>{title}</p>
        ) : null}
        <div style={{ font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)", color: "var(--gray-700)" }}>{children}</div>
        {actions ? <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>{actions}</div> : null}
      </div>
    </div>
  );
}

import React from "react";
import { Icon } from "./Icon.jsx";

const tones = {
  neutral: { background: "var(--beige-200)", color: "var(--gray-700)", border: "var(--gray-300)" },
  brand: { background: "var(--blue-100)", color: "var(--blue-800)", border: "var(--gray-300)" },
  success: { background: "var(--green-100)", color: "var(--green-700)", border: "var(--green-700)" },
  warning: { background: "var(--amber-100)", color: "var(--amber-700)", border: "var(--amber-600)" },
  error: { background: "var(--red-100)", color: "var(--red-700)", border: "var(--red-700)" },
};

export function Tag({ children, tone = "neutral", icon, style, ...rest }) {
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "var(--space-1) var(--space-2)",
        background: t.background,
        color: t.color,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-sm)",
        font: "500 var(--text-caption)/var(--text-caption-line) var(--font-sans)",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}

import React from "react";

const surfaces = {
  card: { background: "var(--surface-card)", borderColor: "var(--gray-300)" },
  sunken: { background: "var(--surface-sunken)", borderColor: "var(--gray-300)" },
  plain: { background: "var(--white)", borderColor: "var(--gray-300)" },
  brandTint: { background: "var(--surface-brand-tint)", borderColor: "var(--blue-600)" },
};

export function Card({ children, surface = "card", padding = "var(--space-4)", radius = "var(--radius-md)", bordered = true, elevated = false, style, ...rest }) {
  return (
    <div
      style={{
        ...surfaces[surface],
        border: bordered ? "1px solid" : "none",
        borderRadius: radius,
        padding,
        boxShadow: elevated ? "var(--shadow-raised)" : "var(--shadow-card)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

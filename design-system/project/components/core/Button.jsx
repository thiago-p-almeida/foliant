import React from "react";
import { Icon } from "./Icon.jsx";

const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-6)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
  cursor: "pointer",
  textDecoration: "none",
  transition: "background-color var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard),color var(--dur-fast) var(--ease-standard)",
};

const variants = {
  primary: { background: "var(--action-primary)", color: "var(--text-on-brand)" },
  secondary: { background: "var(--white)", color: "var(--blue-800)", borderColor: "var(--gray-300)" },
  ghost: { background: "transparent", color: "var(--blue-800)", padding: "0 var(--space-3)" },
  success: { background: "var(--green-600)", color: "var(--white)" },
};

const hovers = {
  primary: { background: "var(--action-primary-hover)" },
  secondary: { background: "var(--beige)", borderColor: "var(--blue-700)" },
  ghost: { background: "var(--blue-100)" },
  success: { background: "var(--green-700)" },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  fullWidth = false,
  disabled = false,
  as = "button",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const Tag = as;
  const sized =
    size === "sm"
      ? { minHeight: 36, padding: variant === "ghost" ? "0 var(--space-2)" : "0 var(--space-4)", fontSize: "var(--text-caption)", fontWeight: 500 }
      : size === "lg"
      ? { minHeight: 52, padding: "0 var(--space-8)" }
      : null;
  return (
    <Tag
      disabled={Tag === "button" ? disabled : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...base,
        ...variants[variant],
        ...sized,
        width: fullWidth ? "100%" : undefined,
        ...(hover && !disabled ? hovers[variant] : null),
        ...(press && !disabled ? { transform: "translateY(1px)" } : null),
        ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 20} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={size === "sm" ? 16 : 20} /> : null}
    </Tag>
  );
}

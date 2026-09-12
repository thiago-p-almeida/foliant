import React from "react";
import { Icon } from "../core/Icon.jsx";

export function Disclosure({ summary, children, open, defaultOpen = false, surface = "sunken", style, ...rest }) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const isOpen = open ?? internal;
  const bg = surface === "sunken" ? "var(--surface-sunken)" : surface === "card" ? "var(--surface-card)" : "transparent";
  return (
    <div
      style={{
        background: bg,
        border: surface === "plain" ? "none" : "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        ...style,
      }}
      {...rest}
    >
      <button
        type="button"
        onClick={() => setInternal(!isOpen)}
        aria-expanded={isOpen}
        style={{
          width: "100%",
          minHeight: "var(--touch-target)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          background: "none",
          border: "none",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          textAlign: "left",
          font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
          color: "var(--text-title)",
        }}
      >
        <span style={{ flex: 1 }}>{summary}</span>
        <Icon
          name="chevron-down"
          size={20}
          color="var(--blue-800)"
          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform var(--dur-base) var(--ease-standard)" }}
        />
      </button>
      {isOpen ? <div style={{ padding: "0 var(--space-3) var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>{children}</div> : null}
    </div>
  );
}

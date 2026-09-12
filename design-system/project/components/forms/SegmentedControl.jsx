import React from "react";

export function SegmentedControl({ options = [], value, onChange, label, style, ...rest }) {
  const [internal, setInternal] = React.useState(value ?? options[0]);
  const current = value ?? internal;
  const pick = (opt) => { setInternal(opt); onChange && onChange(opt); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", ...style }} {...rest}>
      {label ? <span style={{ font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)", color: "var(--text-title)" }}>{label}</span> : null}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = opt === current;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(opt)}
              style={{
                minHeight: "var(--touch-target)",
                padding: "0 var(--space-4)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${active ? "var(--blue-800)" : "var(--border-default)"}`,
                background: active ? "var(--blue-800)" : "var(--white)",
                color: active ? "var(--white)" : "var(--text-body-color)",
                font: "500 var(--text-body-md)/1 var(--font-sans)",
                cursor: "pointer",
                transition: "background-color var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

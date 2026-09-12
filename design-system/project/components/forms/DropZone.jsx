import React from "react";
import { Icon } from "../core/Icon.jsx";

export function DropZone({ title = "Arraste seu PDF aqui", hint = "ou", action, note, active = false, onActivate, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const on = active || hover;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => { e.preventDefault(); setHover(false); onActivate && onActivate(); }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-8) var(--space-6)",
        background: on ? "var(--surface-brand-tint)" : "var(--surface-sunken)",
        border: on ? "2px solid var(--blue-700)" : "2px dashed var(--border-default)",
        borderRadius: "var(--radius-lg)",
        textAlign: "center",
        transition: "background-color var(--dur-base) var(--ease-standard),border-color var(--dur-base) var(--ease-standard)",
        ...style,
      }}
      {...rest}
    >
      <Icon name="file-text" size={40} color={on ? "var(--blue-800)" : "var(--gray-500)"} />
      <p style={{ margin: 0, font: "var(--text-heading-weight) var(--text-heading)/var(--text-heading-line) var(--font-sans)", color: on ? "var(--blue-800)" : "var(--text-title)" }}>{title}</p>
      {hint ? <span className="fo-caption">{hint}</span> : null}
      {action}
      {note ? <span className="fo-caption" style={{ maxWidth: 380 }}>{note}</span> : null}
    </div>
  );
}

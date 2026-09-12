import React from "react";
import { Icon } from "../core/Icon.jsx";

export function Checkbox({ label, help, checked, onChange, id, style, ...rest }) {
  const [internal, setInternal] = React.useState(!!checked);
  const on = checked ?? internal;
  const boxId = id || React.useId();
  return (
    <label
      htmlFor={boxId}
      style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", cursor: "pointer", minHeight: "var(--touch-target)", ...style }}
    >
      <input
        id={boxId}
        type="checkbox"
        checked={on}
        onChange={(e) => { setInternal(e.target.checked); onChange && onChange(e.target.checked); }}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
        {...rest}
      />
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 22,
          height: 22,
          marginTop: 3,
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${on ? "var(--blue-800)" : "var(--border-default)"}`,
          background: on ? "var(--blue-800)" : "var(--white)",
          transition: "background-color var(--dur-fast) var(--ease-standard)",
        }}
      >
        {on ? <Icon name="check" size={16} color="var(--white)" /> : null}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="fo-body">{label}</span>
        {help ? <span className="fo-caption">{help}</span> : null}
      </span>
    </label>
  );
}

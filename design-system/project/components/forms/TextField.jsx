import React from "react";

export function TextField({ label, help, value, placeholder, type = "text", readOnly = false, invalid = false, id, action, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", ...style }}>
      {label ? (
        <label htmlFor={inputId} style={{ font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)", color: "var(--text-title)" }}>
          {label}
        </label>
      ) : null}
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <input
          id={inputId}
          type={type}
          defaultValue={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: "var(--touch-target)",
            padding: "0 var(--space-3)",
            background: "var(--white)",
            color: "var(--text-body-color)",
            font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)",
            border: `1px solid ${invalid ? "var(--red-700)" : focus ? "var(--blue-600)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-sm)",
            boxShadow: focus ? "var(--ring-focus)" : "none",
            outline: "none",
            textOverflow: "ellipsis",
            transition: "border-color var(--dur-fast) var(--ease-standard),box-shadow var(--dur-fast) var(--ease-standard)",
          }}
          {...rest}
        />
        {action}
      </div>
      {help ? <span className="fo-caption">{help}</span> : null}
    </div>
  );
}

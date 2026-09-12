import React from "react";
import { Icon } from "../core/Icon.jsx";

export function FileSummary({ name, meta, action, style, ...rest }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--white)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        ...style,
      }}
      {...rest}
    >
      <Icon name="file-text" size={28} color="var(--blue-800)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, font: "500 var(--text-body)/1.3 var(--font-sans)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        {meta ? <span className="fo-caption">{meta}</span> : null}
      </div>
      {action}
    </div>
  );
}

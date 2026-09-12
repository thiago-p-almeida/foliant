import React from "react";
import { Icon } from "../core/Icon.jsx";

export function ProgressPhase({ label, counter, percent = 0, state = "pending", indeterminate = false, style, ...rest }) {
  const done = state === "done";
  return (
    <div style={{ opacity: state === "pending" ? 0.45 : 1, transition: "opacity var(--dur-slow) var(--ease-standard)", ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
        <span style={{ width: 20, height: 20, display: "grid", placeItems: "center" }}>
          {done ? <Icon name="check" size={18} color="var(--green-700)" /> : null}
        </span>
        <span style={{ flex: 1, font: "500 var(--text-body-md)/var(--text-body-md-line) var(--font-sans)", color: "var(--text-title)" }}>{label}</span>
        {counter ? <span className="fo-caption">{counter}</span> : null}
      </div>
      <div style={{ height: 10, borderRadius: "var(--radius-pill)", background: "var(--beige-200)", border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: indeterminate ? "40%" : `${Math.max(0, Math.min(100, percent))}%`,
            borderRadius: "var(--radius-pill)",
            background: "var(--progress-fill)",
            transition: "width var(--dur-slow) var(--ease-standard)",
            animation: indeterminate ? "foliant-indeterminate 1.1s ease-in-out infinite" : undefined,
          }}
        />
      </div>
      <style>{"@keyframes foliant-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}"}</style>
    </div>
  );
}

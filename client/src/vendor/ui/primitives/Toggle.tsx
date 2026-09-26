import React from "react";

export function Toggle({
  on,
  onChange,
  size = 18,
  disabled = false,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  size?: number;
  /** Renders dimmed and blocks clicks (native `disabled` — no click event
   *  reaches `onClick` at all, so `onChange` can safely stay undefined). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      style={{
        width: size * 1.85,
        height: size + 4,
        borderRadius: 99,
        border: "none",
        padding: 2,
        background: on ? "var(--accent)" : "var(--border-strong)",
        transition: "background .15s",
        position: "relative",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: 99,
          background: "#fff",
          transform: on ? `translateX(${size * 0.85}px)` : "none",
          transition: "transform .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}

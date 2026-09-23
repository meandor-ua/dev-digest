import type { CSSProperties } from "react";
import { tint } from "@/lib/color";

export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  nameCol: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  disabledBadge: { flexShrink: 0 } satisfies CSSProperties,
  disabledCheckbox: { opacity: 0.45, cursor: "not-allowed" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    opacity: dragging ? 0.6 : 1,
  }),
  handle: (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "grab",
    touchAction: "none",
  }),
  name: (enabled: boolean): CSSProperties => ({
    flex: 1,
    fontSize: 13.5,
    fontWeight: 600,
    color: enabled ? "var(--text-primary)" : "var(--text-muted)",
  }),
  badge: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color,
    background: tint(color),
    padding: "2px 8px",
    borderRadius: 4,
    textTransform: "capitalize",
  }),
} as const;

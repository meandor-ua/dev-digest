import type { CSSProperties } from "react";

export const s = {
  empty: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    padding: 18,
    borderRadius: 10,
    border: "1px dashed var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  emptyTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  emptyBody: { fontSize: 13, marginTop: 2 } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

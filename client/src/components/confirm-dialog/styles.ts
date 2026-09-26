import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  body: {
    padding: "20px 24px",
    fontSize: 13.5,
    color: "var(--text-primary)",
    lineHeight: 1.5,
    whiteSpace: "pre-line",
  } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;

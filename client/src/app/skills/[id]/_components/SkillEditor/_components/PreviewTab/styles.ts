import type { CSSProperties } from "react";

export const s = {
  wrap: {
    padding: "24px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 900,
  } satisfies CSSProperties,
  h2: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  previewContainer: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  markdownBody: {
    padding: "20px 24px",
    lineHeight: 1.6,
    fontSize: 14,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;

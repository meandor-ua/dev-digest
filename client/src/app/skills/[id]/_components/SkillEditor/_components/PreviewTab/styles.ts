import type { CSSProperties } from "react";

export const s = {
  wrap: {
    padding: "24px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 900,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  h2: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
  } satisfies CSSProperties,
  hintBox: {
    padding: "10px 14px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  previewContainer: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  promptHeader: {
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  markdownBody: {
    padding: "20px 24px",
    lineHeight: 1.6,
    fontSize: 14,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;

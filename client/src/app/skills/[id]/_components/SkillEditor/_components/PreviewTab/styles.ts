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
    gap: 12,
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
  mdH1: { fontSize: 22, fontWeight: 700, margin: "0 0 12px" } satisfies CSSProperties,
  mdH2: { fontSize: 17, fontWeight: 700, margin: "22px 0 8px" } satisfies CSSProperties,
  mdH3: { fontSize: 15, fontWeight: 650, margin: "18px 0 6px" } satisfies CSSProperties,
  mdP: { margin: "0 0 12px" } satisfies CSSProperties,
  // Explicit list-style: the app's CSS reset strips list markers.
  mdUl: { margin: "0 0 12px", paddingLeft: 22, listStyle: "disc" } satisfies CSSProperties,
  mdOl: { margin: "0 0 12px", paddingLeft: 22, listStyle: "decimal" } satisfies CSSProperties,
  mdLi: { margin: "4px 0" } satisfies CSSProperties,
  mdStrong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  mdPre: {
    margin: "0 0 12px",
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--bg-base)",
    border: "1px solid var(--border)",
    overflowX: "auto",
  } satisfies CSSProperties,
  mdCode: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
} as const;

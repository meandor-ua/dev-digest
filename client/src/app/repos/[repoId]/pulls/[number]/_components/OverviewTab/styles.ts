import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  mdH1: { fontSize: 20, fontWeight: 700, margin: "0 0 12px" } satisfies CSSProperties,
  mdH2: { fontSize: 16, fontWeight: 700, margin: "20px 0 8px" } satisfies CSSProperties,
  mdH3: { fontSize: 14, fontWeight: 650, margin: "16px 0 6px" } satisfies CSSProperties,
  mdP: { margin: "0 0 10px" } satisfies CSSProperties,
  // Explicit list-style: the app's CSS reset strips list markers.
  mdUl: { margin: "0 0 10px", paddingLeft: 22, listStyle: "disc" } satisfies CSSProperties,
  mdOl: { margin: "0 0 10px", paddingLeft: 22, listStyle: "decimal" } satisfies CSSProperties,
  mdLi: { margin: "4px 0" } satisfies CSSProperties,
  mdStrong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  mdPre: {
    margin: "0 0 10px",
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
  mdTableWrap: {
    margin: "0 0 12px",
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  mdTable: {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
  } satisfies CSSProperties,
  mdThead: {
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  mdTh: {
    textAlign: "left",
    fontWeight: 650,
    color: "var(--text-primary)",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  mdTd: {
    padding: "8px 12px",
    borderTop: "1px solid var(--border)",
    verticalAlign: "top",
  } satisfies CSSProperties,
} as const;

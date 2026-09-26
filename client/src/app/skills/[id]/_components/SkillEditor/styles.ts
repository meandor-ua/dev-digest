import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  } satisfies CSSProperties,
  tabsBar: {
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  } satisfies CSSProperties,
} as const;

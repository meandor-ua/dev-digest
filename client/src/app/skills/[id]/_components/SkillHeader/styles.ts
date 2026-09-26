import type { CSSProperties } from "react";
import { tint } from "@/lib/color";

export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 12px",
    flexShrink: 0,
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  iconBox: (color: string): CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    background: tint(color, 15),
    color,
  }),
  name: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  versionIcon: { marginRight: 3, verticalAlign: -1 } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;

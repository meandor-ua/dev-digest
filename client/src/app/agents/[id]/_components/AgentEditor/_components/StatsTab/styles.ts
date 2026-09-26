import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 22, height: "100%", overflow: "auto" } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  costTile: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  costLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } satisfies CSSProperties,
  costValue: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 12 } satisfies CSSProperties,
  costTrend: (color: string): CSSProperties => ({ fontSize: 13, fontWeight: 600, color, marginTop: 6 }),
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" } satisfies CSSProperties,
  donutWrap: { display: "flex", justifyContent: "center", padding: "8px 0" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  tdRight: { padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: "right" } satisfies CSSProperties,
  prLink: { color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  // `ci` is highlighted (amber) so CI-originated runs stand out from local ones.
  sourceBadge: (source: string): CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 11.5,
    fontWeight: 600,
    background: source === "ci" ? "var(--warn-bg)" : "var(--bg-hover)",
    color: source === "ci" ? "var(--warn)" : "var(--text-secondary)",
  }),
} as const;

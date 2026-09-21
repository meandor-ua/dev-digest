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
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  versionCard: (isCurrent: boolean): CSSProperties => ({
    background: isCurrent ? "var(--bg-elevated)" : "var(--bg-surface)",
    border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 8,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "border-color 0.15s",
  }),
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  leftMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  versionBadge: {
    fontWeight: 700,
    fontSize: 13,
  } satisfies CSSProperties,
  dateText: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  bodyPreview: {
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-base)",
    padding: 12,
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    maxHeight: 220,
    overflow: "auto",
  } satisfies CSSProperties,
  diffContainer: {
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-base)",
    padding: 12,
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    maxHeight: 400,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (kind: "same" | "add" | "del"): CSSProperties => {
    const baseStyle: CSSProperties = {
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      lineHeight: 1.5,
      padding: "2px 6px",
      margin: 0,
    };

    if (kind === "add") {
      return {
        ...baseStyle,
        background: "var(--ok-bg, rgba(34, 197, 94, 0.1))",
        color: "var(--ok, #22c55e)",
      };
    } else if (kind === "del") {
      return {
        ...baseStyle,
        background: "var(--crit-bg, rgba(239, 68, 68, 0.1))",
        color: "var(--crit, #ef4444)",
      };
    } else {
      return {
        ...baseStyle,
        color: "var(--text-muted)",
      };
    }
  },
} as const;

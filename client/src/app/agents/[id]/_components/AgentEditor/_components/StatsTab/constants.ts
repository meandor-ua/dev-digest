/** Stacked-bar severity order + colour (recharts findings-by-severity chart). */
export const SEVERITY_BARS = [
  { key: "SUGGESTION", color: "var(--sugg)" },
  { key: "WARNING", color: "var(--warn)" },
  { key: "CRITICAL", color: "var(--crit)" },
] as const;

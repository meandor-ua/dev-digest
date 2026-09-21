/** Donut palette for findings-by-category segments (cycled by index). */
export const CATEGORY_PALETTE = [
  "var(--accent)",
  "var(--info)",
  "var(--warn)",
  "var(--crit)",
  "var(--ok)",
  "var(--text-secondary)",
];

/** Stacked-bar severity order + colour (recharts findings-by-severity chart). */
export const SEVERITY_BARS = [
  { key: "SUGGESTION", color: "var(--sugg)" },
  { key: "WARNING", color: "var(--warn)" },
  { key: "CRITICAL", color: "var(--crit)" },
] as const;

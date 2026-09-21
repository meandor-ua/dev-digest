/* Findings-by-category donut helpers, shared by the agent and skill Stats tabs. */
import type { DonutSegment } from "@devdigest/ui";

/** Theme-aware (CSS-var) colours, cycled over the categories in order. */
export const CATEGORY_PALETTE = [
  "var(--accent)",
  "var(--info)",
  "var(--warn)",
  "var(--crit)",
  "var(--ok)",
  "var(--text-secondary)",
];

/**
 * Integer percentages of `values` that always sum to exactly 100 (largest
 * remainder method); naive per-item rounding can total 99 or 101. All-zero
 * or empty input yields all zeros.
 */
export function toPercentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    floors[i]! += 1;
    remaining -= 1;
  }
  return floors;
}

/** Category counts → donut segments whose values are whole percents summing to 100. */
export function categoryDonutSegments(entries: { label: string; value: number }[]): DonutSegment[] {
  const pct = toPercentages(entries.map((e) => e.value));
  return entries.map((e, i) => ({
    label: e.label,
    value: pct[i] ?? 0,
    color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] ?? "var(--text-secondary)",
  }));
}

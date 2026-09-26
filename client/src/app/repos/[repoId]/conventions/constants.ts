/** Confidence-bar bands (percent) — mirror the bands the extraction prompt asks
 *  the model to use (server/src/prompts/conventions.system.md). */
export const CONFIDENCE_HIGH_PCT = 85;
export const CONFIDENCE_MEDIUM_PCT = 60;

export const CONFIDENCE_COLOR = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
} as const;

export const TRIAGE_FILTERS = ["all", "pending", "accepted", "rejected"] as const;
export type TriageFilter = (typeof TRIAGE_FILTERS)[number];

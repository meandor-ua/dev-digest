/** Seconds-formatted duration (`fallback` — the translated no-value mark — when unknown). */
export function formatDuration(ms: number | null, fallback: string): string {
  if (ms == null) return fallback;
  return `${(ms / 1000).toFixed(1)}s`;
}


/** Seconds-formatted duration ("—" when unknown). */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}


/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** Rough prompt-token estimate for markdown text (~4 chars per token) — UI hint only, never billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

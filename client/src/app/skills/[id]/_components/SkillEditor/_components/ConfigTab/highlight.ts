/* Line classification for the Skill body editor's highlight layer — headings
   only, the markdown itself is never rendered in the editor. */

export type LineKind = "h1" | "h2" | "h3" | "text";

const HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(```|~~~)/;

/** One kind per line of `body`; `#` lines inside a code fence stay text. */
export function markdownLineKinds(body: string): LineKind[] {
  let inFence = false;
  return body.split("\n").map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return "text";
    }
    const m = !inFence && HEADING.exec(line);
    if (!m) return "text";
    const level = m[1]!.length;
    return level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  });
}

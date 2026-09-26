import type { ConventionCandidate } from "@devdigest/shared";

type EvidenceRef = Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_line_end">;

/** `path`, `path:23`, or `path:23-31` for a multi-line snippet. */
export function formatEvidenceLocation(c: EvidenceRef): string {
  if (!c.evidence_line) return c.evidence_path;
  const end = c.evidence_line_end;
  return end && end > c.evidence_line
    ? `${c.evidence_path}:${c.evidence_line}-${end}`
    : `${c.evidence_path}:${c.evidence_line}`;
}

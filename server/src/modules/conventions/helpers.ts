import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConventionCandidate, ConventionCategory } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import {
  MAX_FILE_CHARS,
  MAX_FILE_LINES,
  MAX_SAMPLE_CHARS,
  MAX_SNIPPET_LINES,
  MIN_SNIPPET_CHARS,
} from './constants.js';

export async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

/** A sampled file, truncated to MAX_FILE_LINES/MAX_FILE_CHARS — the ONLY source of truth for verification. */
export interface SampledFile {
  path: string;
  /** 0-indexed; `lines[i]` is 1-based line `i + 1`. */
  lines: string[];
}

export function truncateFile(content: string): string[] {
  const lines = content.split('\n').slice(0, MAX_FILE_LINES);
  let chars = 0;
  const out: string[] = [];
  for (const line of lines) {
    chars += line.length + 1;
    if (chars > MAX_FILE_CHARS) break;
    out.push(line);
  }
  return out;
}

/** Renders one sampled file with a 1-based line-number gutter — what makes a citation checkable. */
function renderWithGutter(file: SampledFile): string {
  const body = file.lines.map((line, i) => `${i + 1}\t${line}`).join('\n');
  return `--- ${file.path} ---\n${body}`;
}

/** Renders every sampled file, stopping once the whole sample hits MAX_SAMPLE_CHARS. */
export function buildSampleText(files: SampledFile[]): string {
  let out = '';
  for (const file of files) {
    const block = renderWithGutter(file);
    if (out.length + block.length + 2 > MAX_SAMPLE_CHARS) break;
    out += (out ? '\n\n' : '') + block;
  }
  return out;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function nonSpaceLength(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** Raw candidate shape as returned by the structured extraction call, before verification. */
export interface RawConventionCandidate {
  rule: string;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
  category: ConventionCategory;
  confidence: number;
}

export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
}

/** The sample is rendered with a `N\t` gutter; a model sometimes copies it into the snippet. */
const GUTTER = /^\s*\d+\t/;

function snippetNeedles(snippet: string): string[] {
  return snippet
    .split('\n')
    .map((line) => normalize(line.replace(GUTTER, '')))
    .filter(Boolean)
    .slice(0, MAX_SNIPPET_LINES);
}

/**
 * Matches the needles in order against consecutive non-blank file lines from
 * `start` (blank lines in the file are skipped, not matched). Stops at the
 * first mismatch, so an invented tail is cut off rather than kept.
 */
function matchRun(lines: string[], start: number, needles: string[]): { count: number; end: number } {
  let count = 0;
  let end = start;
  let i = start;
  for (const needle of needles) {
    while (i < lines.length && normalize(lines[i]!) === '') i += 1;
    if (i >= lines.length || !normalize(lines[i]!).includes(needle)) break;
    count += 1;
    end = i;
    i += 1;
  }
  return { count, end };
}

/** Strips the indentation shared by every non-blank line, keeping relative indentation. */
function dedent(lines: string[]): string {
  const trimmed = lines.map((l) => l.trimEnd());
  const indents = trimmed.filter((l) => l !== '').map((l) => l.match(/^[ \t]*/)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return trimmed.map((l) => l.slice(common)).join('\n');
}

/**
 * The evidence gate: resolves the claimed path against what was actually
 * sampled (exact, else a UNIQUE suffix match — ambiguity is not resolved),
 * checks the snippet is non-trivial, and finds it in the file
 * (whitespace/case-insensitive, line by line over consecutive lines; the run
 * matching the most snippet lines wins, then the one nearest the claimed
 * line). A wrong line number is corrected; an invented snippet is dropped and
 * an invented tail is truncated. The returned snippet and its line range are
 * sliced from the file itself, never the model's text.
 */
export function verifyCandidate(
  raw: RawConventionCandidate,
  sampled: SampledFile[],
): VerifiedCandidate | null {
  if (nonSpaceLength(raw.evidence_snippet) < MIN_SNIPPET_CHARS) return null;

  const exact = sampled.filter((f) => f.path === raw.evidence_path);
  const resolved =
    exact.length === 1
      ? exact[0]!
      : (() => {
          const bySuffix = sampled.filter((f) => f.path.endsWith(`/${raw.evidence_path}`) || f.path === raw.evidence_path);
          return bySuffix.length === 1 ? bySuffix[0]! : undefined;
        })();
  if (!resolved) return null;

  const needles = snippetNeedles(raw.evidence_snippet);
  if (needles.length === 0) return null;

  let best: { start: number; end: number; count: number; dist: number } | null = null;
  for (let i = 0; i < resolved.lines.length; i += 1) {
    const { count, end } = matchRun(resolved.lines, i, needles);
    if (count === 0) continue;
    const dist = Math.abs(i + 1 - raw.evidence_line);
    if (!best || count > best.count || (count === best.count && dist < best.dist)) {
      best = { start: i, end, count, dist };
    }
  }
  if (!best) return null;
  const { start, end } = best;

  return {
    category: raw.category,
    rule: raw.rule.trim(),
    evidencePath: resolved.path,
    evidenceLine: start + 1,
    evidenceLineEnd: end + 1,
    evidenceSnippet: dedent(resolved.lines.slice(start, end + 1)),
    confidence: Math.max(0, Math.min(1, raw.confidence)),
  };
}

export interface DedupeResult {
  kept: VerifiedCandidate[];
  droppedDuplicate: number;
}

/**
 * Sorts by confidence desc, then drops candidates whose rule text (normalized)
 * duplicates one already kept in this scan, or one already accepted/rejected
 * for this repo — a re-scan must never re-litigate a decided rule.
 */
export function dedupeCandidates(
  candidates: VerifiedCandidate[],
  existingRuleTexts: string[],
): DedupeResult {
  const seen = new Set(existingRuleTexts.map(normalize));
  const kept: VerifiedCandidate[] = [];
  let droppedDuplicate = 0;
  for (const c of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
    const key = normalize(c.rule);
    if (seen.has(key)) {
      droppedDuplicate += 1;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, droppedDuplicate };
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    rationale: row.rationale ?? null,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? null,
    evidence_line_end: row.evidenceLineEnd ?? row.evidenceLine ?? null,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

function slugifyRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');
}

/**
 * A code fence longer than any backtick run in `snippet`. Evidence can come from
 * sampled markdown (CONTRIBUTING.md, AGENTS.md…) that itself contains ```
 * fences, which would otherwise close the block early and corrupt the body.
 */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** Merges the accepted candidates of a repo into one markdown skill body. */
export function buildConventionSkillBody(repoSlug: string, accepted: ConventionCandidate[]): string {
  const skillName = `${repoSlug}-conventions`;
  const sections = accepted.map((c) => {
    const heading = slugifyRule(c.rule) || c.category;
    const location = !c.evidence_line
      ? c.evidence_path
      : c.evidence_line_end && c.evidence_line_end > c.evidence_line
        ? `${c.evidence_path}:${c.evidence_line}-${c.evidence_line_end}`
        : `${c.evidence_path}:${c.evidence_line}`;
    const rationale = c.rationale ? `\n${c.rationale}\n` : '';
    const fence = fenceFor(c.evidence_snippet);
    return [
      `## ${heading}`,
      c.rule,
      rationale,
      `Detected in \`${location}\`:`,
      fence,
      c.evidence_snippet,
      fence,
    ]
      .filter((l) => l !== '')
      .join('\n');
  });
  return [
    `# ${skillName}`,
    '',
    `House conventions for \`${repoSlug}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
    sections.join('\n\n'),
  ].join('\n');
}

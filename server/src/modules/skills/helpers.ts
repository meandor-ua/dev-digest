/** Row → DTO mappers — used only by repository.ts, so Drizzle rows never leave it. */
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    is_dangerous: row.isDangerous,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** First markdown heading, else the URL's basename — shared by import + import/preview. */
export function deriveSkillName(body: string, finalUrl: string): string {
  const match = body.match(/^#+\s+(.+)$/m);
  if (match && match[1]) return match[1].trim();
  const urlParts = finalUrl.split('/');
  return urlParts[urlParts.length - 1]?.replace(/\.md$/i, '') || 'imported-skill';
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const PROVENANCE_KEY = 'external_skill_imported_from';

/** Cuts a leading YAML frontmatter block, if any, and trims the result — no
 *  leading/trailing blank lines left behind from the cut. */
export function stripFrontmatter(raw: string): string {
  const match = raw.match(FRONTMATTER);
  return (match ? raw.slice(match[0].length) : raw).trim();
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Flat `key: value` (+ `>`/`|` block scalar) frontmatter reader — same
 * restricted subset as the client's file-import parser
 * (client/src/app/skills/_components/CreateSkillModal/skill-markdown.ts):
 * never a full YAML parse, so nothing in the fetched file executes or
 * expands. Duplicated per-package on purpose (client/server don't share
 * non-vendor code), same as `deriveSkillName` above.
 */
function parseFrontmatterFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const cont: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) cont.push(lines[++i]!.trim());
      out[key] = cont.join(raw.startsWith('>') ? ' ' : '\n');
    } else {
      out[key] = unquote(raw);
    }
  }
  return out;
}

/**
 * Parses a fetched SKILL.md's leading YAML frontmatter (`name`/`description`)
 * and stamps `external_skill_imported_from: <url>` into it as durable
 * provenance — appended as the last frontmatter key when missing, updated in
 * place on re-fetch, or wrapped in a brand-new frontmatter block when the
 * source had none. The returned `body` keeps the (now-stamped) frontmatter
 * inline, so the source URL survives in `skills.body` from the very first
 * saved version even if the description is edited afterward.
 */
export function buildImportedMarkdown(
  raw: string,
  url: string,
): { name: string; description: string; body: string } {
  const match = raw.match(FRONTMATTER);
  const fmLines = match ? match[1]!.split(/\r?\n/) : [];
  const rest = match ? raw.slice(match[0].length) : raw;
  const fields = match ? parseFrontmatterFields(match[1]!) : {};

  const provenanceLine = `${PROVENANCE_KEY}: ${url}`;
  const existingIdx = fmLines.findIndex((l) => new RegExp(`^${PROVENANCE_KEY}:\\s*`).test(l));
  if (existingIdx >= 0) {
    fmLines[existingIdx] = provenanceLine;
  } else {
    fmLines.push(provenanceLine);
  }

  const body = `---\n${fmLines.join('\n')}\n---\n${rest}`;
  const name = fields.name || deriveSkillName(rest, url);
  const description = fields.description ?? '';

  return { name, description, body };
}

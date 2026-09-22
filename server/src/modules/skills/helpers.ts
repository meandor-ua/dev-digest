/** Row → DTO mappers for the skills module (keeps Drizzle row types out of service.ts). */
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

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

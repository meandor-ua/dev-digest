/* Editable fields of a skill and the rebase rule that keeps the Config form
   in step with the server without clobbering the user's unsaved edits. */
import type { Skill } from "@devdigest/shared";

export type SkillDraft = Pick<Skill, "name" | "description" | "type" | "body" | "enabled">;

const FIELDS = ["name", "description", "type", "body", "enabled"] as const;

export const toDraft = (skill: Skill): SkillDraft => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
  enabled: skill.enabled,
});

export const sameDraft = (a: SkillDraft, b: SkillDraft) => FIELDS.every((k) => a[k] === b[k]);

/**
 * Three-way merge after the server copy changed (a restore, a toggle in the
 * list, a save): take the server's value for every field the user hasn't
 * touched since `base`, keep the user's value for the ones they have.
 */
export function rebaseDraft(draft: SkillDraft, base: SkillDraft, server: SkillDraft): SkillDraft {
  const next = { ...draft };
  for (const k of FIELDS) {
    if (draft[k] === base[k]) (next as Record<string, unknown>)[k] = server[k];
  }
  return next;
}

/** Only the fields that differ from the server — a save never re-sends stale values. */
export function draftPatch(draft: SkillDraft, server: SkillDraft): Partial<SkillDraft> {
  const patch: Partial<SkillDraft> = {};
  for (const k of FIELDS) {
    if (draft[k] !== server[k]) (patch as Record<string, unknown>)[k] = draft[k];
  }
  return patch;
}

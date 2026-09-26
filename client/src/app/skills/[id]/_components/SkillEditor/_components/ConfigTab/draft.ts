/* Editable fields of a skill and the rebase rule that keeps the Config form
   in step with the server without clobbering the user's unsaved edits.
   The generic machinery lives in `@/lib/draft` (shared with the agent editor). */
import type { Skill } from "@devdigest/shared";
import * as draft from "@/lib/draft";

export type SkillDraft = Pick<Skill, "name" | "description" | "type" | "body" | "enabled">;
export type SkillDraftState = draft.DraftState<SkillDraft>;

const FIELDS = ["name", "description", "type", "body", "enabled"] as const;

export const toDraft = (skill: Skill): SkillDraft => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
  enabled: skill.enabled,
});

export const sameDraft = (a: SkillDraft, b: SkillDraft) => draft.sameDraft(FIELDS, a, b);

export const rebaseDraft = (d: SkillDraft, base: SkillDraft, server: SkillDraft): SkillDraft =>
  draft.rebaseDraft(FIELDS, d, base, server);

export const draftPatch = (d: SkillDraft, server: SkillDraft): Partial<SkillDraft> =>
  draft.draftPatch(FIELDS, d, server);

/**
 * The editor's unsaved form state, owned above the tabs so Config edits it and
 * Preview renders it. Resets on a different skill; rebases when the same skill
 * changes on the server.
 */
export const useSkillDraft = (skill: Skill): SkillDraftState => draft.useDraft(skill.id, toDraft(skill), FIELDS);

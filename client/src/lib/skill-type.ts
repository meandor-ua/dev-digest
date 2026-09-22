import type { SkillType } from "@devdigest/shared";

/** Accent colour per skill type — shared by the Skills list/editor and the Agent editor's Skills tab. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--info)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/**
 * Every skill type, in display order — derived from the exhaustive map above so
 * a new `SkillType` member can't be forgotten. (Not `SkillType.options`: a
 * runtime import from `@devdigest/shared` breaks the Next build — see
 * client/INSIGHTS.md.)
 */
export const SKILL_TYPES = Object.keys(SKILL_TYPE_COLOR) as SkillType[];

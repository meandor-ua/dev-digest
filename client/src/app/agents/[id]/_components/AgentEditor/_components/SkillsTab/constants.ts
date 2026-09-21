import type { SkillType } from "@devdigest/shared";

/** Accent colour per skill type, for the row's type badge. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--info)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

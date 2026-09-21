import type { SkillType, SkillSource } from "@devdigest/shared";

export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--info)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

export const SKILL_SOURCE_LABEL: Record<SkillSource, string> = {
  manual: "Manual",
  imported_url: "Imported",
  extracted: "Extracted",
  community: "Community",
};

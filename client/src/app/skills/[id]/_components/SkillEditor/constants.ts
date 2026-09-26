export interface SkillTabDef {
  key: "config" | "context" | "preview" | "evals" | "stats" | "versions";
}

// Text-only tabs (design drops the per-tab icons the earlier drawer/URL layout used).
export const SKILL_TABS: SkillTabDef[] = [
  { key: "config" },
  { key: "context" },
  { key: "preview" },
  { key: "evals" },
  { key: "stats" },
  { key: "versions" },
];

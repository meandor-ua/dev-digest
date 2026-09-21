import type { IconName } from "@devdigest/ui";

export interface SkillTabDef {
  key: "config" | "context" | "preview" | "evals" | "stats" | "versions";
  icon: IconName;
}

export const SKILL_TABS: SkillTabDef[] = [
  { key: "config", icon: "FileText" },
  { key: "context", icon: "Layers" },
  { key: "preview", icon: "Eye" },
  { key: "evals", icon: "FlaskConical" },
  { key: "stats", icon: "BarChart" },
  { key: "versions", icon: "History" },
];

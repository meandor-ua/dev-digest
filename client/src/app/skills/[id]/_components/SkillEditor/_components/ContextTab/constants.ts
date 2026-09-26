import type { ProjectDoc } from "@devdigest/shared";

export const CONTEXT_CATEGORY_COLOR: Record<ProjectDoc["category"], string> = {
  specs: "var(--info)",
  docs: "var(--ok)",
  insights: "var(--warn)",
};

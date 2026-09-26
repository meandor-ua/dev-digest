import type { SkillSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "User",
  imported_url: "Link",
  extracted: "FileText",
  community: "Globe",
};

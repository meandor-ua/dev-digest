"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/lib/skill-type";
import { s } from "./styles";

/** Editor header: type-tinted icon, name, type + version badges, and the (not yet available) "Run on evals". */
export function SkillHeader({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];

  return (
    <div style={s.bar}>
      <div style={s.iconBox(color)}>
        <Icon.Sparkles size={16} />
      </div>
      <h1 className="mono" style={s.name}>
        {skill.name}
      </h1>
      <Badge color={color} mono>
        {skill.type}
      </Badge>
      <Badge color="var(--text-secondary)" mono>
        <Icon.GitCommit size={11} style={s.versionIcon} />
        v{skill.version}
      </Badge>
      {!skill.enabled && <Badge color="var(--text-muted)">{t("detail.disabled")}</Badge>}
      {skill.is_dangerous && (
        <span title={t("listItem.dangerousTitle")}>
          <Badge color="var(--crit)">{t("detail.dangerousNotice")}</Badge>
        </span>
      )}
      {skill.source !== "manual" && !skill.enabled && (
        <span title={t("listItem.vettingTitle")}>
          <Badge color="var(--warn)">{t("listItem.needsVetting")}</Badge>
        </span>
      )}

      <div style={s.actions}>
        <span title={t("detail.runOnEvalsTitle")}>
          <Button kind="secondary" size="sm" icon="Play" disabled>
            {t("detail.runOnEvals")}
          </Button>
        </span>
      </div>
    </div>
  );
}

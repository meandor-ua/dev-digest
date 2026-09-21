"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle, Badge } from "@devdigest/ui";
import type { SkillWithStats } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, SKILL_SOURCE_LABEL } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillWithStats;
  active: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type] ?? "var(--text-secondary)";
  const sourceLabel = SKILL_SOURCE_LABEL[skill.source] ?? skill.source;
  const agentCount = skill.agent_count ?? 0;
  const pullPct = skill.pull_frequency_pct ?? 0;
  const acceptPct = skill.accept_rate_pct ?? 100;
  const needsVetting = skill.source !== "manual" && !skill.enabled;

  return (
    <div
      style={s.card(active, skill.enabled)}
      onClick={onClick}
      data-testid={`skill-card-${skill.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge
              color="var(--warning)"
              style={{ fontSize: 11, cursor: "default" }}
            >
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>

      {skill.description ? (
        <div style={s.description}>{skill.description}</div>
      ) : null}

      <div style={s.metaRow}>
        <span style={s.typeBadge(color)}>{skill.type}</span>
        <span style={s.sourceBadge}>{sourceLabel}</span>
      </div>

      <div style={s.statsRow}>
        <span>{agentCount} {agentCount === 1 ? "agent" : "agents"}</span>
        <span style={s.dot}>·</span>
        <span>{pullPct}% pull</span>
        <span style={s.dot}>·</span>
        <span>{acceptPct}% accept</span>
      </div>
    </div>
  );
}

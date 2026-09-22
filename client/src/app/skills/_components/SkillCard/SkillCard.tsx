"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle, Badge } from "@devdigest/ui";
import type { SkillWithStats } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/lib/skill-type";
import { SKILL_SOURCE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting = false,
}: {
  skill: SkillWithStats;
  active: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type] ?? "var(--text-secondary)";
  const sourceLabel = t(`listItem.source.${skill.source}`);
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];
  const agentCount = skill.agent_count ?? 0;
  const pullPct = skill.pull_frequency_pct ?? 0;
  const acceptPct = skill.accept_rate_pct;
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
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={deleting}
            title={t("listItem.deleteTitle")}
            aria-label={t("listItem.deleteTitle")}
            style={s.deleteBtn(deleting)}
          >
            <Icon.Trash size={14} style={deleting ? s.spin : undefined} />
          </button>
        )}
      </div>

      {needsVetting && (
        <div style={s.vettingRow}>
          <span title={t("listItem.vettingTitle")}>
            <Badge
              color="var(--warn)"
              style={{ fontSize: 11, cursor: "default" }}
            >
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        </div>
      )}

      {skill.description ? (
        <div style={s.description}>{skill.description}</div>
      ) : null}

      <div style={s.metaRow}>
        <span style={s.typeBadge(color)}>{t(`listItem.type.${skill.type}`)}</span>
        <span style={s.sourceBadge}>
          <SourceIcon size={11} />
          {sourceLabel}
        </span>
      </div>

      <div style={s.statsRow}>
        <span>{t("listItem.stats.agents", { count: agentCount })}</span>
        <span>{t("listItem.stats.pull", { pct: pullPct })}</span>
        {acceptPct == null ? (
          <span>—</span>
        ) : (
          <span style={s.accept}>{t("listItem.stats.accept", { pct: acceptPct })}</span>
        )}
      </div>
    </div>
  );
}

/* AgentCard — name + enabled toggle, description, model chip + skills count,
   and a stats line (runs · avg score · avg cost) when card stats are available. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent, AgentCardStats } from "@devdigest/shared";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { formatCost } from "../../../../lib/cost";
import { modelColor, scoreColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  stats,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  stats?: AgentCardStats;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);
  const skillCount = stats?.skills_count;
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete agent "${ag.name}"? This cannot be undone.`)) del.mutate(ag.id);
          }}
          disabled={del.isPending}
          title="Delete agent"
          aria-label="Delete agent"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      {stats && (
        <div style={s.statsRow}>
          <span className="tnum">{t("card.runs", { count: stats.runs })}</span>
          <span style={s.dot}>·</span>
          <span
            className="tnum"
            style={{ color: stats.avg_score != null ? scoreColor(stats.avg_score) : "var(--text-muted)" }}
          >
            {stats.avg_score != null
              ? t("card.scorePct", { score: Math.round(stats.avg_score) })
              : t("card.noValue")}
          </span>
          <span style={s.dot}>·</span>
          <span className="tnum">
            {stats.avg_cost_usd != null
              ? t("card.avgCost", { cost: formatCost(stats.avg_cost_usd) })
              : t("card.noValue")}
          </span>
        </div>
      )}
    </div>
  );
}

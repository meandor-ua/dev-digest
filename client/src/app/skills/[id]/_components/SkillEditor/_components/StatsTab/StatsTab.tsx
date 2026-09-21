"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, EmptyState, MetricCard, Donut, CircularScore } from "@devdigest/ui";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { categoryDonutSegments } from "../../../../../../../lib/category-chart";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.kpiGrid}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={90} />
          ))}
        </div>
        <div style={s.grid2}>
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="AlertTriangle"
          title={t("stats.loadError")}
          body={t("stats.loadErrorBody")}
        />
      </div>
    );
  }

  const segments = categoryDonutSegments(
    Object.entries(stats.findings_by_category).map(([label, value]) => ({ label, value })),
  );

  return (
    <div style={s.wrap}>
      <div style={s.kpiGrid}>
        <MetricCard label={t("stats.usedBy")} value={stats.agent_count} />
        <MetricCard label={t("stats.pullFrequency")} value={`${stats.pull_frequency_pct}%`} />
        <MetricCard
          label={t("stats.acceptRate")}
          value={
            <span style={s.gaugeValue}>
              <CircularScore score={stats.accept_rate_pct} size={40} stroke={4} />
              <span>{stats.accept_rate_pct}%</span>
            </span>
          }
        />
        <MetricCard label={t("stats.findings")} value={stats.findings_30d} />
      </div>

      <div style={s.grid2}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>{t("stats.agentsUsing")}</h3>
          {stats.agents.length === 0 ? (
            <span style={s.muted}>{t("stats.noAgents")}</span>
          ) : (
            <div style={s.agentList}>
              {stats.agents.map((ag) => (
                <Link key={ag.id} href={`/agents/${ag.id}?tab=skills`} style={s.agentRow}>
                  <span style={s.agentInfo}>
                    <Icon.Cpu size={15} style={{ color: "var(--accent)" }} />
                    <span>{ag.name}</span>
                  </span>
                  <Icon.ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={s.card}>
          <h3 style={s.cardTitle}>{t("stats.findingsByCategory")}</h3>
          {segments.length === 0 ? (
            <span style={s.muted}>{t("stats.noFindings")}</span>
          ) : (
            <Donut segments={segments} formatValue={(v) => `${v}%`} />
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, EmptyState, MetricCard, Donut, CircularScore } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { categoryDonutSegments } from "@/lib/category-chart";
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
        <MetricCard
          label={t("stats.usedBy")}
          value={stats.agent_count}
          suffix={` ${t("stats.agentsUnit", { count: stats.agent_count })}`}
        />
        <MetricCard label={t("stats.pullFrequency")} value={stats.pull_frequency_pct} suffix="%" />
        {stats.accept_rate_pct == null ? (
          <MetricCard label={t("stats.acceptRate")} value="—" />
        ) : (
          <MetricCard
            label={t("stats.acceptRate")}
            value={stats.accept_rate_pct}
            suffix="%"
            aside={<CircularScore score={stats.accept_rate_pct} size={40} stroke={4} />}
          />
        )}
        <MetricCard label={t("stats.findings")} value={stats.findings_30d} />
      </div>

      <div style={s.grid2}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Icon.Cpu size={14} />
            {t("stats.agentsUsing")}
          </h3>
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
                  <span className="mono" style={s.open}>
                    {t("stats.open")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Icon.Tag size={14} />
            {t("stats.findingsByCategory")}
          </h3>
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

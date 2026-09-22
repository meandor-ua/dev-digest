/* StatsTab — repo-scoped aggregates for one agent: KPI tiles, score sparkline,
   cost trend, most-used skills, findings by severity (stacked) + category
   (donut), and a run-history table that opens the shared RunTraceDrawer. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { MetricCard, BarRow, Donut, Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { AgentRunHistoryItem } from "@devdigest/shared";
import { useAgentStats } from "@/lib/hooks/agents";
import { formatCost } from "@/lib/cost";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { SEVERITY_BARS } from "./constants";
import { formatDuration } from "./helpers";
import { categoryDonutSegments } from "@/lib/category-chart";
import { s } from "./styles";

interface OpenTrace {
  runId: string;
  agentName: string;
  prNumber: number | null;
}

export function StatsTab({
  agentId,
  agentName,
  repoId,
}: {
  agentId: string;
  agentName: string;
  repoId: string | null;
}) {
  const t = useTranslations("agents");
  const { data: stats, isLoading } = useAgentStats(agentId, repoId);
  const [open, setOpen] = React.useState<OpenTrace | null>(null);

  if (!repoId) return <EmptyState icon="BarChart" title={t("stats.noRepo")} />;
  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={92} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (!stats || stats.runs === 0) return <EmptyState icon="BarChart" title={t("stats.noData")} />;

  const costTrend = stats.cost_trend;
  const trendColor = costTrend == null ? "var(--text-muted)" : costTrend > 0 ? "var(--crit)" : "var(--ok)";
  const trendText =
    costTrend == null
      ? t("card.noValue")
      : t("stats.costTrend", { delta: `${costTrend > 0 ? "+" : ""}${formatCost(costTrend)}` });

  const maxSkill = Math.max(1, ...stats.most_used_skills.map((p) => p.value));
  // All-zero weeks mean the agent produced no findings in the window — show the
  // empty state rather than six flat bars.
  const hasSeverityData = stats.findings_by_severity.some(
    (w) => w.CRITICAL + w.WARNING + w.SUGGESTION > 0,
  );
  // Category shares of all findings, as whole percents summing to exactly 100.
  const donutSegments = categoryDonutSegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard label={t("stats.totalRuns")} value={stats.runs} />
        <div style={s.costTile}>
          <span style={s.costLabel}>{t("stats.avgCost")}</span>
          <div className="tnum" style={s.costValue}>
            {formatCost(stats.avg_cost_usd)}
          </div>
          <div style={s.costTrend(trendColor)}>{trendText}</div>
        </div>
        <MetricCard label={t("stats.avgDuration")} value={formatDuration(stats.avg_duration_ms)} />
        <MetricCard
          label={t("stats.avgScore")}
          value={stats.avg_score != null ? Math.round(stats.avg_score) : t("card.noValue")}
          suffix={stats.avg_score != null ? "%" : undefined}
          trend={stats.score_trend.length ? stats.score_trend.map((p) => p.value) : undefined}
        />
      </div>

      <div style={s.grid2}>
        <div style={s.section}>
          <h3 style={s.sectionTitle}>{t("stats.mostUsedSkills")}</h3>
          {stats.most_used_skills.length === 0 ? (
            <EmptyState icon="Sparkles" title={t("stats.noData")} />
          ) : (
            <div>
              {stats.most_used_skills.map((p) => (
                <BarRow key={p.label} label={p.label} value={p.value} max={maxSkill} suffix={`${Math.round(p.value)}%`} />
              ))}
            </div>
          )}
        </div>

        {/* Memory pulls aren't recorded per run yet — deliberate placeholder. */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>{t("stats.mostPulledMemory")}</h3>
          <EmptyState icon="Database" title={t("stats.mostPulledMemoryEmpty")} />
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.section}>
          <h3 style={s.sectionTitle}>{t("stats.findingsBySeverity")}</h3>
          {hasSeverityData ? (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.findings_by_severity} margin={{ top: 10, right: 14, bottom: 8, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  {SEVERITY_BARS.map((b) => (
                    <Bar key={b.key} dataKey={b.key} stackId="sev" fill={b.color} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="BarChart" title={t("stats.noData")} />
          )}
        </div>

        <div style={s.section}>
          <h3 style={s.sectionTitle}>{t("stats.findingsByCategory")}</h3>
          {donutSegments.length === 0 ? (
            <EmptyState icon="Filter" title={t("stats.noData")} />
          ) : (
            <div style={s.donutWrap}>
              <Donut segments={donutSegments} formatValue={(v) => `${v}%`} />
            </div>
          )}
        </div>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>{t("stats.runHistory")}</h3>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("stats.cols.when")}</th>
              <th style={s.th}>{t("stats.cols.pr")}</th>
              <th style={s.th}>{t("stats.cols.tokens")}</th>
              <th style={s.th}>{t("stats.cols.cost")}</th>
              <th style={s.th}>{t("stats.cols.findings")}</th>
              <th style={s.th}>{t("stats.cols.source")}</th>
              <th style={s.th}>{t("stats.cols.trace")}</th>
            </tr>
          </thead>
          <tbody>
            {stats.run_history.map((r) => (
              <RunRow
                key={r.run_id}
                r={r}
                repoId={repoId}
                onOpen={() => setOpen({ runId: r.run_id, agentName, prNumber: r.pr_number })}
                viewLabel={t("stats.viewTrace")}
                noTraceLabel={t("stats.noTrace")}
                noValue={t("card.noValue")}
              />
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <RunTraceDrawer runId={open.runId} agentName={open.agentName} prNumber={open.prNumber} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function RunRow({
  r,
  repoId,
  onOpen,
  viewLabel,
  noTraceLabel,
  noValue,
}: {
  r: AgentRunHistoryItem;
  repoId: string;
  onOpen: () => void;
  viewLabel: string;
  noTraceLabel: string;
  noValue: string;
}) {
  return (
    <tr>
      <td style={s.td} className="tnum">
        {new Date(r.ran_at).toLocaleDateString()}
      </td>
      <td style={s.td} className="mono">
        {r.pr_number != null ? (
          <Link href={`/repos/${repoId}/pulls/${r.pr_number}`} style={s.prLink}>
            #{r.pr_number}
          </Link>
        ) : (
          noValue
        )}
      </td>
      <td style={s.tdRight} className="tnum">
        {r.tokens != null ? r.tokens.toLocaleString() : noValue}
      </td>
      <td style={s.tdRight} className="tnum">
        {formatCost(r.cost_usd)}
      </td>
      <td style={s.tdRight} className="tnum">
        {r.findings_count != null ? r.findings_count : noValue}
      </td>
      <td style={s.td}>
        <span style={s.sourceBadge(r.source)}>{r.source}</span>
      </td>
      <td style={s.td}>
        {r.has_trace ? (
          <Button kind="ghost" size="sm" icon="Eye" onClick={onOpen}>
            {viewLabel}
          </Button>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{noTraceLabel}</span>
        )}
      </td>
    </tr>
  );
}

import type {
  AgentCardStats,
  AgentRepoStats,
  AgentRunHistoryItem,
  AgentSeverityWeek,
  AgentStatPoint,
} from '@devdigest/shared';

/**
 * A2 — pure aggregation helpers for the Agents-column cards and the Stats tab.
 * No DB access here (queries live in ./repository); these operate on plain rows
 * so the tricky aggregation rules are unit-testable (see test/agents-stats.test.ts).
 *
 * Aggregation rules (mirrored in specs/README.md "Agent stats"):
 *  - Population = the agent's DONE runs whose PR is in the repo.
 *  - avg_score / avg_cost_usd = per-PR-then-mean (mean within a PR first, then
 *    mean across PRs); runs with a null score/cost are skipped.
 *  - cost_trend = mean(all run costs) − mean(run costs excluding the 10 most
 *    recent by ran_at); null when there are ≤10 runs.
 *  - Weekly series (score trend, findings-by-severity) span the last 6 ISO weeks.
 */

const RECENT_TREND_WINDOW = 10;
const WEEKS = 6;
const RUN_HISTORY_LIMIT = 5;
const MOST_USED_SKILL_SHARE = 100;

/** One DONE run of an agent within a repo (raw row from the repository). */
export interface RunRow {
  runId: string;
  prId: string | null;
  prNumber: number | null;
  ranAt: Date;
  score: number | null;
  costUsd: number | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  findingsCount: number | null;
  source: string;
  hasTrace: boolean;
}

/** One finding produced by an agent's DONE run within a repo. */
export interface FindingRow {
  severity: string;
  category: string;
  ranAt: Date;
}

// ---- generic numeric helpers ----------------------------------------------

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Per-PR-then-mean: for each PR (grouped by prId, falling back to the runId for
 * runs with no PR) take the mean of the non-null picked values, then average
 * those per-PR means. Returns null when no run has a value.
 */
export function perPrThenMean(runs: RunRow[], pick: (r: RunRow) => number | null): number | null {
  const byPr = new Map<string, number[]>();
  for (const r of runs) {
    const v = pick(r);
    if (v === null || v === undefined) continue;
    const key = r.prId ?? `run:${r.runId}`;
    const arr = byPr.get(key) ?? [];
    arr.push(v);
    byPr.set(key, arr);
  }
  const perPrMeans: number[] = [];
  for (const arr of byPr.values()) {
    const m = mean(arr);
    if (m !== null) perPrMeans.push(m);
  }
  return mean(perPrMeans);
}

// ---- ISO week helpers ------------------------------------------------------

interface IsoWeek {
  year: number;
  week: number;
}

/** ISO-8601 week (Mon-based, week containing the year's first Thursday = 1). */
export function isoWeek(d: Date): IsoWeek {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: date.getUTCFullYear(), week };
}

const weekKey = (w: IsoWeek): string => `${w.year}-${w.week}`;

/** The last `WEEKS` ISO weeks ending at `now`, oldest → newest. */
export function lastIsoWeeks(now: Date): Array<IsoWeek & { label: string }> {
  const out: Array<IsoWeek & { label: string }> = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 3600 * 1000);
    const w = isoWeek(d);
    out.push({ ...w, label: `w${w.week}` });
  }
  return out;
}

// ---- series builders -------------------------------------------------------

/** Weekly mean score for the last 6 ISO weeks (empty week → 0). */
export function scoreTrend(runs: RunRow[], now: Date): AgentStatPoint[] {
  const weeks = lastIsoWeeks(now);
  const byWeek = new Map<string, number[]>();
  for (const r of runs) {
    if (r.score === null) continue;
    const k = weekKey(isoWeek(r.ranAt));
    const arr = byWeek.get(k) ?? [];
    arr.push(r.score);
    byWeek.set(k, arr);
  }
  return weeks.map((w) => ({ label: w.label, value: mean(byWeek.get(weekKey(w)) ?? []) ?? 0 }));
}

/** Cost trend: mean(all) − mean(all but the 10 most recent). Null when ≤10 runs. */
export function costTrend(runs: RunRow[]): number | null {
  const costed = runs.filter((r) => r.costUsd !== null) as (RunRow & { costUsd: number })[];
  if (runs.length <= RECENT_TREND_WINDOW) return null;
  const byRanAtAsc = [...runs].sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());
  const earlier = byRanAtAsc.slice(0, byRanAtAsc.length - RECENT_TREND_WINDOW);
  const earlierCosts = earlier.map((r) => r.costUsd).filter((c): c is number => c !== null);
  const allMean = mean(costed.map((r) => r.costUsd));
  const earlierMean = mean(earlierCosts);
  if (allMean === null || earlierMean === null) return null;
  return allMean - earlierMean;
}

/** Findings-by-severity for the last 6 ISO weeks (each week counts by severity). */
export function findingsBySeverity(findings: FindingRow[], now: Date): AgentSeverityWeek[] {
  const weeks = lastIsoWeeks(now);
  const bucket = new Map<string, AgentSeverityWeek>();
  for (const w of weeks) {
    bucket.set(weekKey(w), { label: w.label, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  }
  for (const f of findings) {
    const cell = bucket.get(weekKey(isoWeek(f.ranAt)));
    if (!cell) continue;
    if (f.severity === 'CRITICAL') cell.CRITICAL += 1;
    else if (f.severity === 'WARNING') cell.WARNING += 1;
    else if (f.severity === 'SUGGESTION') cell.SUGGESTION += 1;
  }
  return weeks.map((w) => bucket.get(weekKey(w))!);
}

/** Finding counts grouped by category, descending. */
export function findingsByCategory(findings: FindingRow[]): AgentStatPoint[] {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Last 5 done runs, newest first, mapped to run-history rows. */
export function runHistory(runs: RunRow[]): AgentRunHistoryItem[] {
  return [...runs]
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
    .slice(0, RUN_HISTORY_LIMIT)
    .map((r) => {
      const tokens =
        r.tokensIn === null && r.tokensOut === null ? null : (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      return {
        run_id: r.runId,
        ran_at: r.ranAt.toISOString(),
        pr_id: r.prId,
        pr_number: r.prNumber,
        tokens,
        cost_usd: r.costUsd,
        findings_count: r.findingsCount,
        source: r.source,
        has_trace: r.hasTrace,
      };
    });
}

/**
 * Most-used skills placeholder (risk #6): runs don't record which skills fired,
 * so every enabled skill shows the same 100% share, kept in `order`.
 */
export function mostUsedSkills(enabledSkillNames: string[]): AgentStatPoint[] {
  return enabledSkillNames.map((label) => ({ label, value: MOST_USED_SKILL_SHARE }));
}

// ---- top-level assemblers --------------------------------------------------

/** Card stats for one agent (skills count + repo-scoped run aggregates). */
export function buildCardStats(
  agentId: string,
  skillsCount: number,
  runs: RunRow[],
): AgentCardStats {
  return {
    agent_id: agentId,
    skills_count: skillsCount,
    runs: runs.length,
    avg_score: perPrThenMean(runs, (r) => r.score),
    avg_cost_usd: perPrThenMean(runs, (r) => r.costUsd),
  };
}

/** Full Stats-tab payload for one agent within a repo. */
export function buildRepoStats(input: {
  agentId: string;
  repoId: string;
  runs: RunRow[];
  findings: FindingRow[];
  enabledSkillNames: string[];
  now: Date;
}): AgentRepoStats {
  const { agentId, repoId, runs, findings, enabledSkillNames, now } = input;
  return {
    agent_id: agentId,
    repo_id: repoId,
    runs: runs.length,
    avg_score: perPrThenMean(runs, (r) => r.score),
    avg_cost_usd: perPrThenMean(runs, (r) => r.costUsd),
    avg_duration_ms: mean(runs.map((r) => r.durationMs).filter((d): d is number => d !== null)),
    cost_trend: costTrend(runs),
    score_trend: scoreTrend(runs, now),
    most_used_skills: mostUsedSkills(enabledSkillNames),
    findings_by_severity: findingsBySeverity(findings, now),
    findings_by_category: findingsByCategory(findings),
    run_history: runHistory(runs),
  };
}

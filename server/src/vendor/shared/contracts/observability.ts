import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Agent card + repo-scoped stats (GET /agents/stats, GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/**
 * Per-agent aggregates for the Agents-column card, computed over the agent's
 * DONE runs whose PR belongs to the given repo. `avg_score`/`avg_cost_usd` are
 * per-PR-then-mean (see specs/README.md). Null when the agent has no such runs
 * (or no scored/costed runs). One row per agent from GET /agents/stats.
 */
export const AgentCardStats = z.object({
  agent_id: z.string(),
  /** ENABLED linked skills (matches the Skills tab's "N of M enabled" N). */
  skills_count: z.number().int(),
  runs: z.number().int(),
  avg_score: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentCardStats = z.infer<typeof AgentCardStats>;

/** One (label, value) point for the stats sparklines/bars. */
export const AgentStatPoint = z.object({ label: z.string(), value: z.number() });
export type AgentStatPoint = z.infer<typeof AgentStatPoint>;

/** Findings counts for one ISO week, split by severity (stacked bars). */
export const AgentSeverityWeek = z.object({
  label: z.string(),
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});
export type AgentSeverityWeek = z.infer<typeof AgentSeverityWeek>;

/** One row of the Stats-tab run-history table (last done runs, newest first). */
export const AgentRunHistoryItem = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  pr_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  tokens: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  source: z.string(),
  has_trace: z.boolean(),
});
export type AgentRunHistoryItem = z.infer<typeof AgentRunHistoryItem>;

/**
 * Repo-scoped aggregates for the Stats tab (GET /agents/:id/stats?repo_id=).
 * Population = the agent's DONE runs whose PR is in the repo. See
 * specs/README.md "Agent stats" for the exact aggregation rules.
 */
export const AgentRepoStats = z.object({
  agent_id: z.string(),
  repo_id: z.string(),
  runs: z.number().int(),
  avg_score: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  /** avg_cost(all) − avg_cost(all but last 10 by ran_at); null when ≤10 runs. */
  cost_trend: z.number().nullable(),
  /** Weekly mean score for the last 6 ISO weeks (oldest→newest sparkline). */
  score_trend: z.array(AgentStatPoint),
  /** Enabled-skill share placeholder (ordered enabled skills). */
  most_used_skills: z.array(AgentStatPoint),
  /** Last 6 ISO weeks × CRITICAL/WARNING/SUGGESTION finding counts. */
  findings_by_severity: z.array(AgentSeverityWeek),
  /** Finding counts grouped by category (descending). */
  findings_by_category: z.array(AgentStatPoint),
  run_history: z.array(AgentRunHistoryItem),
});
export type AgentRepoStats = z.infer<typeof AgentRepoStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;

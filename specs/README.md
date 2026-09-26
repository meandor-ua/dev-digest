# specs — DevDigest

Specs / acceptance criteria that span more than one package.

## Agent stats — cross-package contract

Powers the Agents-column cards (`GET /agents/stats?repo_id=`) and the editor's
Stats tab (`GET /agents/:id/stats?repo_id=`). The aggregation is pure and
unit-tested in `server/src/modules/agents/stats.ts` (mirror any change here and
there together; the wire shapes live in
`{server,client}/src/vendor/shared/contracts/observability.ts`, kept
byte-identical by hand).

- **Population** = the agent's `status = 'done'` runs whose PR belongs to the
  given repo. Every aggregate below is computed over exactly that set — an
  empty population yields `runs: 0` and null/empty aggregates, never a
  fabricated number.
- **`avg_score` / `avg_cost_usd`** = *per-PR-then-mean*: group runs by `pr_id`
  (runs with no PR stand alone), take the mean of the non-null values within
  each PR, then average those per-PR means. Runs with a null score/cost are
  skipped; the result is `null` when no run has a value. This keeps a PR that
  was re-reviewed many times from dominating the average.
- **`cost_trend`** = `mean(all run costs) − mean(costs excluding the 10 most
  recent by ran_at)`; `null` when there are ≤10 runs. Positive = getting more
  expensive (rendered red on the Stats tab), negative = cheaper (green).
- **Weekly series** (`score_trend`, `findings_by_severity`) span the last 6 ISO
  weeks, oldest → newest; a week with no data is 0, not omitted.
- **`most_used_skills`** lists the agent's *enabled* skills in link order, each
  with a placeholder share value of 100 (real per-skill usage is a later
  lesson; the shape is stable now).
- **`run_history`** = the 5 most recent done runs, newest first. `has_trace` is
  currently always false (no run traces are seeded); the Stats tab disables
  "View trace" and shows "No trace" when it is false.
- Counting never triggers an LLM call — it is a read-time aggregation of
  already-persisted `agent_runs` / `findings` rows only.

## Findings by severity — cross-package contract

See `client/specs/README.md` and `server/specs/README.md` for the UI and
API/DB sides respectively. The cross-package contract that must not drift:

- The wire shape is `FindingsBySeverity = { CRITICAL: number; WARNING:
  number; SUGGESTION: number }`, defined once in
  `{server,client}/src/vendor/shared/contracts/platform.ts` (kept
  byte-identical by hand — no re-vendor tooling exists in this checkout;
  `diff` the two files after any edit).
- `PrMeta.findings_by_severity` is `.nullish()`: **absent** when the PR has
  no review yet, **present and all-zero** when a review exists but found
  nothing, **present with real counts** otherwise. Never conflate "no review"
  with "reviewed, nothing found" — they're different states.
- Counting is always a plain `COUNT`/`filter` grouping of already-persisted
  `findings.severity` — no new LLM call, ever, at read time or on filter
  toggle.

## Cost (`PrMeta.cost_usd`) — cross-package contract

- Server: sum of `agent_runs.cost_usd` across every row with
  `status = 'done'` for the PR, all-time (not scoped to one review or one
  "Run Review" click's batch). Runs with unknown cost are skipped, never
  treated as $0. `cost_usd` is `undefined` (omitted) when the PR has zero
  runs at all, `null` when it has runs but none successful/costed, and a
  number otherwise.
- Client: `RunCostBadge` renders `—` for `null`, nothing for `undefined`
  (no runs → no badge at all is a deliberate UI acceptance criterion, not a
  missing-data placeholder).

## Accept / Dismiss — cross-package contract

- Server: `POST /findings/:id/accept` and `POST /findings/:id/dismiss`
  (`server/src/modules/reviews/routes.ts`) are mutually exclusive — setting
  one always clears the other's timestamp (`findings.acceptedAt` /
  `findings.dismissedAt`). Re-sending the same action on an
  already-accepted/dismissed finding is a harmless idempotent no-op.
- Client: the current-state button (whichever matches `accepted_at`/
  `dismissed_at`) is `disabled` (a real HTML attribute, not just styled) and
  shows a blue border; the other button stays enabled so the state can be
  switched. See `client/specs/README.md` for the full visual-state table.

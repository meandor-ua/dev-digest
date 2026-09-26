# Insights — client / PR review page

Findings and gotchas specific to the PR-detail page: Overview / Findings /
Timeline tabs, review runs, verdict/score, the run trace drawer, and their
SSE/polling wiring. General client conventions live in the package's
`insights/INSIGHTS.md`.

## Codebase Patterns

- **2026-09-18** — A dead `PrRowView` interface in `client/src/lib/types.ts`
  (unused, never constructed anywhere) had a `findings: { CRITICAL; WARNING;
  SUGGESTION }` field years before the findings-by-severity feature existed
  — confirming it was pre-seeded scaffolding for exactly this feature, and a
  reliable source for the wire shape to reuse. Worth checking `lib/types.ts`
  for unused view-model interfaces before designing a new field's shape from
  scratch. Evidence: `client/src/lib/types.ts:37-48`.
- **2026-09-18** — `RunHistory.tsx` / `ReviewRunAccordion.tsx` deliberately
  count blockers as **CRITICAL and non-dismissed, recomputed live** from the
  matched `ReviewRecord.findings`, not the denormalized `run.blockers` column.
  `run.blockers` is frozen at run completion *and* gated by that agent's own
  `ciFailOn` threshold, so it drifts from the accordion the moment a finding is
  dismissed, and can disagree with it outright for a non-CRITICAL gate. The
  frozen column survives only as the fallback for rows with no matching review
  (failed/cancelled/running). One `liveBlockers()` value feeds **both** the
  outcome colour and the printed "· N blockers" text so a row can never
  contradict itself. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:34`.
- **2026-09-18** — Score rings use ONE rule everywhere: `CircularScore`'s own
  thresholds (≥75 green, ≥50 amber, else red), and a score of 0 renders NO
  ring (PR list shows "—"). This deliberately reverses the older "ring follows
  the verdict / outcome badge" design (`colorOverride`), per the user: a
  high-score PR that still has a blocker now shows a green ring beside a red
  "Request changes" label — expected, not a bug. Don't reintroduce
  `colorOverride` at these call sites. Evidence:
  `client/src/vendor/ui/primitives/CircularScore.tsx:19`,
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:104`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx:58`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:202`.
- **2026-09-18** — Review-runs rows are addressed by `reviewRunRowKey`
  (`run_id ?? review.id`), and `?agent=` may therefore hold a REVIEW id for a
  run-less review (the seeded one). A `?severity=` without `?agent=` resolves
  to the newest `kind === "review"` row once rows load. (`ReviewRecord.run_id`
  is nullable — paths that bailed on `if (runId)` silently skipped URL writes
  on the demo PR.) Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:34`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:189`.
- **2026-09-18** — Hiding a container hides everything slotted into it:
  `VerdictBanner`'s `footer` (the PR BRIEF's cost/tokens) lives in the score
  column, so "score 0 → no ring" silently dropped the cost too (quick-blog #34:
  list COST $0.020, brief none). The column now renders on `score || footer`
  and only the ring/label are gated on the score. When gating a region, check
  what callers inject into it. Score 0 is otherwise shown as: list "—", no ring
  anywhere, Review-runs header plain "0" (kept by user decision). Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx:58`.

## What Doesn't Work

- **2026-09-18** — `vendor/ui/primitives/Button.tsx`'s `active` prop is
  completely dead for `kind="secondary"`/`"ghost"` — only `kind="tertiary"`'s
  entry in the `kinds` style map actually reads it
  (`client/src/vendor/ui/primitives/Button.tsx:51-55`). `FindingCard.tsx` passed
  `active={accepted}`/`active={dismissed}` to `secondary`/`ghost` buttons for
  a long time with zero visual effect. Fix at the call site with a `style`
  override (Button spreads `style` last, so it always wins) rather than
  relying on `active` for these two kinds.
- **2026-09-18** — `PrMeta.id` is `z.string().nullish()`
  (`src/vendor/shared/contracts/platform.ts:167`), and `PRRow.test.tsx`'s
  shared `pr()` fixture once omitted it (now fixed). That mattered more than it
  looked: the new Actions cell is guarded on `pr.id`, so every existing test
  in the file kept passing while the cell rendered **nothing** — the
  `RunReviewDropdown` was never mounted, so the predicted "missing
  `useRunReview`/`useAgents` mocks will throw" breakage never surfaced and
  would have shipped an untested column. When adding a conditionally-rendered
  cell, add the field it is guarded on to the shared fixture first, then
  confirm the new assertions actually fail without the change. Evidence:
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx:50`.
- **2026-09-18** — The PR list's column order lives in THREE places that
  have no compile-time link: `COLUMN_KEYS` (header labels), `GRID` (the
  CSS grid tracks), and `PRRow.tsx`'s hand-ordered JSX cells. Nothing fails
  loudly if they drift — the table just renders each cell under the wrong
  header at the wrong width. Guarded now by two cheap tests (a `:nth-child`
  position assertion per `data-testid` cell, and `GRID.split(/\s+/).length
  === COLUMN_KEYS.length`), plus `:nth-child` assertions in e2e flow 02.
  Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:27`.
- **2026-09-18** — "Always red" verdicts are not a colour-binding bug:
  `reviews.verdict` is the model's
  SELF-REPORTED verdict, written before citation-grounding drops findings it
  can't anchor to the diff. So a real run can persist
  `verdict: "request_changes"` with **0 surviving findings and score 100**
  (its summary still describing the CRITICAL it no longer has), while the
  Timeline — which derives its outcome from actual findings — correctly says
  "approved". Never render `review.verdict` directly: derive it with
  `effectiveVerdict()` (active CRITICAL → request_changes, other active →
  comment, none → approve), the same rule as the Timeline's `outcomeOf`.
  Verdict colours come only from `VerdictBanner/constants.ts`'s
  `VERDICT_META` (a divergent local map was removed). Evidence: `client/src/lib/findings.ts:19-29`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:117-118`.
- **2026-09-18** — For a quiet table-row action with a hover highlight, use
  the shared `Button`'s `kind="ghost"` rather than a hand-rolled `<button>`:
  it is already transparent + muted with a `var(--border)` outline at rest and
  switches to `var(--bg-hover)` + `var(--text-primary)` on hover (via its own
  `onMouseEnter` state, since `:hover` can't live in a style object). The PR
  list's Actions column first shipped an icon-only custom trigger to save
  width; the design wants the labelled "Run Review ⌄", which fits a 140px
  track. Evidence: `client/src/vendor/ui/primitives/Button.tsx:56,63`,
  `client/src/app/repos/[repoId]/pulls/constants.ts:29`.
- **2026-09-18** — The PR-detail URL's `agent`/`severity` pair has exactly
  ONE writer: `FindingsTab`'s `writeUrl`, which records what it last wrote in
  `urlRef`. Anything that needs to know "does the URL currently hold another
  run's severity?" (e.g. merely expanding an accordion) must read `urlRef`, not
  infer it from `target`/`appliedByRunId` — the severity PILLS write the URL
  without touching either (they must not: bumping `appliedByRunId` remounts
  the panel). And a pill change is reported via `onSeverityFilterChange` only
  on USER action, never on mount, or a deep-linked panel would re-write its own
  URL on arrival. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:103-113`.
- **2026-09-18** — "Review runs" stayed stale after an agent finished (only
  the Timeline updated) because the reviews refetch hung off RunStatus's SSE
  `onDone`, and RunStatus is only MOUNTED while the 4s active-runs poll is
  non-empty (`FindingsTab.tsx:199,222`): the poll usually empties first,
  RunStatus unmounts, and `onDone` never fires. Never hang a refetch off a
  component whose own lifetime is controlled by the same data you're waiting
  on — key it off the data instead: `useRefreshWhenRunsSettle` diffs the
  active-run ids and invalidates reviews / pr-runs / pull / pulls when any
  leaves the set (it ignores `undefined` loading states). Safe because the
  server persists the review BEFORE marking the run done. Evidence:
  `client/src/lib/hooks/reviews.ts:53`,
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:59`.
- **2026-09-18** — Trace drawer "0 lines" trap: a `running` prop captured at
  mount + `retry: false` on a trace endpoint that 404s until written = a
  permanently empty log pane. The server's active-run set (`liveRunIds`), not
  the SSE socket, is the authority on "still running"; once not running, the
  persisted log must win over an empty SSE buffer, and the trace query polls
  until the row exists. Evidence:
  `client/src/components/run-trace-drawer/RunTraceDrawer.tsx:66`,
  `client/src/lib/hooks/trace.ts:20`.
- **2026-09-18** — A mutation that triggers background work must invalidate
  (or watch) the query its OWN page renders from. `useRunReview` only
  invalidates `["reviews", prId]`, so the PR list's `["pulls"]` row stayed
  frozen and "Run Review" read as a dead button (the handler was bound fine).
  `PRRow` now polls `usePrActiveRuns` only after a run starts and
  `useRefreshWhenRunsSettle` refreshes `["pulls"]`. Evidence:
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:37`.
- **2026-09-18** — SSE streams to the API (`:3001`, plain HTTP/1.1) count
  against Chrome's 6-connections-per-host limit, shared by ALL tabs. The
  Findings tab opened one EventSource per live run and the Run Trace drawer
  opened its own for the same run, so with ≥6 streams (two "Run all" batches,
  or another tab) the drawer's stream sat queued: empty log, "dead" filter,
  and a reopen "fixed" it only because a run had finished. `useRunEvents` now
  shares one ref-counted EventSource per run (deferred close survives
  StrictMode remounts). Verified in a real browser with 6 live runs.
  Evidence: `client/src/lib/hooks/reviews.ts:236` (`acquireRunStream`).
- **2026-09-18** — `["pr-active-runs", prId]` is shared by the PR list row and
  the PR page, and its poll only runs while the data is non-empty. Under the
  global `staleTime: 30_000` a cached `[]` meant a run started from the list
  (or another tab) was never fetched: the row's "Running…" chip stuck and
  nothing refreshed. Now `staleTime: 0` on that query + PRRow invalidates it
  on start. Evidence: `client/src/lib/hooks/reviews.ts:36` (`usePrActiveRuns`),
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:157`,
  `.../pulls/_components/PRRow/PRRow.run.test.tsx`.
- **2026-09-18** — The PR list's SCORE / FINDINGS / COST are derived on the
  server from the PR's reviews and runs, but `useDeleteRun`, `useDeleteReview`
  and `useFindingAction` only invalidated `["reviews"]` / `["pr-runs"]`, so
  after deleting every run the list kept the old score (global
  `staleTime: 30_000`, no focus refetch) until a reload. They now also
  invalidate `["pulls"]` + `["pull", prId]` (`invalidatePrSummary`). Evidence:
  `client/src/lib/hooks/reviews.ts:78`.

## Open Questions

- **2026-09-18** — Should live run events be multiplexed into one SSE stream
  per PR (server change) or should the API be served over HTTP/2, to remove
  the 6-connection ceiling for good? Evidence:
  `client/src/lib/hooks/reviews.ts:236`.

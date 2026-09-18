# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Recurring Errors & Fixes

- **2026-09-17** — `drizzle-kit generate` fails in this dev environment with
  an esbuild/Rosetta architecture mismatch (`@esbuild/darwin-arm64` present,
  platform needs `@esbuild/darwin-x64`, or vice versa). Workaround: hand-author
  the migration SQL plus a `meta/NNNN_snapshot.json` (copy the prior
  snapshot, patch only the changed table's `columns`, bump `id`/set `prevId`
  to the previous snapshot's `id`) and a matching `meta/_journal.json` entry.
  Verified correct by diffing against a later commit's real `drizzle-kit`
  output for the identical column (`0010_add_agent_run_cost.sql` matched
  `93119a5`'s `0010_polite_sasquatch.sql` byte-for-byte) and by the
  Docker-gated integration tests passing against the real migrated schema.
  General playbook for this class of issue (recognize it, don't "fix" the
  global toolchain, scoped workarounds per command):
  `.claude/skills/esbuild-arch-mismatch/SKILL.md:1`. Evidence:
  `server/src/db/migrations/0010_add_agent_run_cost.sql:1`.

## Tool & Library Notes

- **2026-09-17** — A Fastify route with no declared `schema.response` and a
  bare object return correctly drops an `undefined`-valued key from the JSON
  wire response (confirmed empirically, not just assumed) — this is the
  mechanism behind "field omitted vs. field null" distinctions, e.g.
  `PrMeta.cost_usd` is absent for a PR with zero runs but `null` for a run
  that exists with unknown cost. Evidence:
  `server/src/modules/pulls/routes.ts:213` (the row-mapping ternary),
  asserted via `'cost_usd' in prBeforeRun === false` at
  `server/test/reviews.it.test.ts:168`.
- **2026-09-17** — `MockLLMProvider.complete`/`.completeStructured`
  (`src/adapters/mocks.ts:78-89`) already return a fixed `costUsd: 0.001` —
  no mock changes are needed to write cost-related test assertions.

## Codebase Patterns

- **2026-09-18** — `server/src/modules/pulls/status.ts:23` already exported a
  pure, unit-tested `rollupSeverities(rows)` helper, unused anywhere in the
  codebase, well before the findings-by-severity feature existed — clearly
  pre-seeded scaffolding for it. Worth grepping a module's existing helpers
  for unused-but-tested functions before writing new aggregation logic from
  scratch.
- **2026-09-18** — `findings.reviewId` references `reviews.id`, **not**
  `reviews.runId` — two different columns on the same `reviews` row, easy to
  conflate since "review" and "run" are near-synonyms elsewhere in this
  codebase (e.g. `ReviewRecord.run_id`). Any query joining `findings` to a
  specific review (not a specific agent run) must resolve the review row's
  own `id` first — the existing `latestReviewByPr` map (built for `score`)
  had to be extended to also carry it. Evidence:
  `server/src/db/schema/reviews.ts:10` (`reviews.id`) vs `:19`
  (`reviews.runId`) vs `:30-32` (`findings.reviewId` references `reviews.id`),
  `server/src/modules/pulls/routes.ts:119-130` (`latestReviewByPr`).
- **2026-09-17** — `ReviewService.runReview()` creates every `agent_runs` row
  for a multi-agent "Review all" click up front, in ONE synchronous loop,
  before any LLM call starts (`service.ts:114`, "Create the agent_run rows up
  front..."). True batch-mates therefore share a `ran_at` within
  milliseconds, not seconds — a time-window heuristic reconstructing "which
  runs belong to the same click" (no persisted batch id exists) should stay
  tight (single-digit seconds), or it risks merging two separate, later
  clicks into one inflated total.

## What Doesn't Work

- **2026-09-17** — Auditing every `outcome.<field>` read site is required
  whenever `ReviewOutcome`'s shape changes. `run-executor.ts` silently
  dropped `outcome.costUsd` for a long stretch via an incomplete
  `const { tokensIn, tokensOut, grounding } = outcome` destructure — the
  field was fully computed upstream (reviewer-core, LLM adapters) the whole
  time, just never read at the one call site that mattered.
  **Superseded 2026-09-18**: this is fixed as of this session —
  `run-executor.ts:214` now destructures `costUsd` too and threads it
  through to `cost_usd` in the persisted row (`run-executor.ts:270`). Not
  this session's fix (pre-existing on entry), but confirming the old entry
  no longer describes the current code.
- **2026-09-18** — This dev machine has a real `GITHUB_TOKEN`/secret
  configured, so `container.github()` succeeds and hits the **real** GitHub
  API even under `NODE_ENV=test` (confirmed: `getAuthenticatedUser()`
  returned a real account). A test asserting "GitHub unavailable" behavior
  must not rely on the ambient absence of a token — it's not guaranteed
  across environments/machines. Force it deterministically instead: inject a
  `GitHubClient` override whose relevant method rejects (via `buildApp`'s
  `overrides.github`), which exercises the same catch path as a genuinely
  missing/invalid token. Evidence: `server/test/workspace.it.test.ts:42-46`.
- **2026-09-18** — Running the full `.it.test.ts` suite (24 files, each
  spinning up its own testcontainers Postgres, vitest's default parallelism)
  produced one flaky failure
  (`test/reviews.it.test.ts:208`'s trace assertion reading `undefined.model`)
  that did not reproduce when that file was run in isolation, or on a
  second full-suite run. Likely resource contention under parallel
  Docker/Postgres load, not a real regression — re-run before concluding a
  change broke something, if the same file passes alone.
- **2026-09-17** — The seeded demo PR (`acme/payments-api` #482) can NEVER
  produce findings, regardless of which agent reviews it or how many times.
  `server/src/db/seed.ts:120` inserts `pr_files` rows with no `patch`, and
  `server/src/modules/reviews/diff-loader.ts:37` (`if (!f.patch) continue;`)
  skips any file with no patch — so every review sees a genuinely empty
  diff. Not a regression from any lesson's work; it's a property of the
  starter seed. The only way around it is importing a real PR from an
  actual GitHub repo (a `GITHUB_TOKEN` is already supported via
  `~/.devdigest/secrets.json`) — not done as of this entry.
- **2026-09-18** — `repos.last_polled_at` was only ever bumped
  **asynchronously**, inside `RepoRepository.updateClonePath()` once the
  enqueued clone job completed. The client invalidates its `["repos"]` cache
  on the refresh mutation's `onSuccess`, i.e. the instant the HTTP request
  resolves — so the refetch always read the pre-refresh value and any
  "last synced" UI looked stuck. Fix is a `touchLastPolled()` call
  **synchronously inside `RepoService.refresh()`**, in addition to (never
  instead of) the post-clone bump. Tempting wrong fix: calling
  `POST /repos/:id/poll` from the refresh flow — it requires a configured
  GitHub token (`container.github()` throws `ConfigError` without one,
  breaking the "no API keys required to boot" guarantee) **and** it rewrites
  `pull_requests.updated_at`, i.e. the PR list's own Updated column.
  Evidence: `server/src/modules/repos/service.ts:119`,
  `server/src/modules/repos/repository.ts:79`, asserted at
  `server/test/integration.it.test.ts` ("bumps last_polled_at SYNCHRONOUSLY").
- **2026-09-18** — `pull_requests.status` is GitHub's MERGE state
  (open/merged/closed), NOT a review status. The review status
  (needs_review / reviewed / stale) exists only as a derivation,
  `deriveReviewStatus()` (`server/src/modules/pulls/status.ts:40`). `GET
  /repos/:id/pulls` derived it, but `GET /pulls/:id` returned the raw column in
  BOTH its GitHub-refresh and offline branches — so an open, reviewed PR read
  "Reviewed" in the list and "Needs review" on its own page (the client maps
  raw "open" to the needs-review colour). Any endpoint returning a PR status
  must go through `deriveReviewStatus`; the detail route now does in both
  branches, and its GitHub branch also persists the fresh head_sha / status /
  updated_at so a later list read derives from identical data. Evidence:
  `server/src/modules/pulls/routes.ts:293,316`; guarded by
  `server/test/pulls-detail-status.it.test.ts`.

- **2026-09-18** — `completeAgentRun` before `saveRunTrace` published a
  "done" run (gone from `/runs/active`) whose trace did not exist yet, so
  `GET /runs/:id/trace` 404'd. Save the trace first (failure swallowed), then
  mark done. Evidence: `server/src/modules/reviews/run-executor.ts:282`;
  pinned by `server/test/reviews.it.test.ts` ("already has its trace").
- **2026-09-18** — Empty-diff trap: `seed.ts` stored PR #482's `pr_files`
  with no `patch`, `acme/payments-api` has no clone (fictional), and
  `diff-loader.ts:37` skips patchless files — so the demo PR reviewed an empty
  diff, paid for "nothing to review", recorded `done` and overwrote the seeded
  request_changes/61 with an empty approve. Pre-work that yields nothing to
  review must `failAll`, not proceed. A patchless `pr_files` row also renders a
  zero-line file card (`client/.../diff-viewer/helpers.ts:13`), so "diff tab
  looks empty" and "review found nothing" share a root cause. Evidence:
  `server/src/modules/reviews/run-executor.ts:107`,
  `server/src/db/seed-patches.ts`.
- **2026-09-18** — (Supersedes the evidence lines of the two entries above.)
  Exact lines: trace-before-done `server/src/modules/reviews/run-executor.ts:289`;
  empty-diff guard `run-executor.ts:109`; demo patches
  `server/src/db/seed-patches.ts:9`; idempotent backfill
  `server/src/db/seed.ts:176`; patchless skip
  `server/src/modules/reviews/diff-loader.ts:37`.
- **2026-09-18** — "No reviewable diff" on a REAL GitHub PR (quick-blog #12,
  71 files) was not the demo-data trap: the PR list imports PRs and even
  backfills their size from `getPullRequest`, but never stores `pr_files`
  (`server/src/modules/pulls/routes.ts:95`) — only opening the PR's page does
  (`routes.ts:246`). And the clone can't help: it's shallow `main` only, and
  `GitClient.fetchPullHead` exists but nothing calls it, so `git diff
  base...<PR head>` fails. So "Run Review" from the list on a never-opened PR
  had zero patches. `loadDiff` now fetches + stores the files from GitHub as a
  last resort (`server/src/modules/reviews/diff-loader.ts:36`). Also: the detail
  route's delete-then-insert of `pr_files` was two statements — a review
  loading its diff between them saw zero files; it is now one transaction
  (`server/src/modules/_shared/pr-files.ts:17`).
- **2026-09-18** — An empty diff is not always a data problem: quick-blog #36
  is open with 2 commits but GitHub reports `changed_files: 0` (its changes
  already landed on `main` via #33). One generic "check the GitHub token"
  message sent the user hunting for a non-problem. `loadDiff` now returns an
  `emptyReason` naming the actual cause (GitHub unreachable / PR changes no
  files / files but no text patches / patches unparseable) and the run fails
  with it. Check GitHub's own `changed_files` before debugging the pipeline.
  Evidence: `server/src/modules/reviews/diff-loader.ts:18`.

## Session Notes

### 2026-09-18
- Executor now saves the run trace before marking the run done, and fails a
  run closed ("No reviewable diff") instead of reviewing an empty diff — no
  LLM call, no review row, PR score untouched.
- Seed gives PR #482 real patches (hunks contain the lines the seeded findings
  cite) and backfills them on an existing DB; new `test/seed.it.test.ts` + 3
  new cases in `test/reviews.it.test.ts`.
- quick-blog #12: "Run Review" from the list on a never-opened PR had no
  stored patches → `loadDiff` now fetches + stores the PR's files from GitHub;
  the detail route's `pr_files` replace is one transaction.
- quick-blog #36: GitHub reports 0 changed files → the run now fails with that
  exact reason (`emptyReason`) instead of a misleading token hint.

## Open Questions

- **2026-09-18** — Deleting every run of a PR removes its reviews (score goes
  back to none) but leaves `pull_requests.last_reviewed_sha` set, so the list
  STATUS still derives "reviewed". Should `deleteAgentRun` / `deleteReview`
  clear it when the PR's last review goes? Evidence:
  `server/src/modules/reviews/repository/run.repo.ts:88`,
  `server/src/modules/pulls/routes.ts:205`.

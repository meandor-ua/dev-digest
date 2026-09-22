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
- **2026-09-21** — Integration tests fail in `beforeAll` with "Could not find a
  working container runtime strategy" right after OrbStack starts: testcontainers
  probes `/var/run/docker.sock`, which OrbStack links only later. Run them with
  `DOCKER_HOST=unix:///Users/<you>/.orbstack/run/docker.sock pnpm exec vitest run .it.test`.
  Evidence: `server/test/helpers/pg.ts` (testcontainers `startPg`).
- **2026-09-21** — Drizzle `.update(t).set({})` with an all-`undefined` patch
  throws (empty `SET`) and surfaces as a 500 on `PUT` with `{}`; short-circuit an
  empty patch as a no-op returning the existing row. Evidence:
  `server/src/modules/skills/repository.ts:185`.
- **2026-09-22** — Supersedes the 2026-09-17 esbuild entry's implication that
  `drizzle-kit generate` always needs the hand-write workaround: on this
  machine/session it ran clean (`0012_skill_context_and_version_message.sql`
  generated normally, no arch mismatch). The mismatch is host-state-dependent
  (Rosetta/arch of the installed `@esbuild/*` binary), not a permanent
  property of this repo — always try `drizzle-kit generate` first and only
  fall back to hand-authoring on the actual error.
- **2026-09-22** — A patch object with an extra field that ISN'T a table
  column (e.g. a version-snapshot `message` alongside a `skills` patch) needs
  the "is this patch empty" check narrowed to only the real columns, or a
  message-only call falls through to the same `.set({})` empty-SET crash as
  above. Fix: destructure the non-column field out before the
  `Object.values(...).every(v => v === undefined)` check. Evidence:
  `server/src/modules/skills/repository.ts:183-186`.

## Tool & Library Notes

- **2026-09-22** — A request that fails a route's Zod `schema` (body/params/
  querystring, e.g. `.max(100)` on an array) answers **422**, not Fastify's
  default 400 — the app's error handler remaps validation failures, same code
  as a thrown `ValidationError`. Assert `422` in `*.it.test.ts`. Evidence:
  `src/app.ts:115-119`, `src/platform/errors.ts:27`.

- **2026-09-21** — `dependency-cruiser` (a `server/` devDep, `package.json:25`,
  also the engine behind `adapters/depgraph`) has two traps when writing
  layer-boundary rules: (1) a backreference to a `from` capture group inside a
  `to` path must be **`$1`**, not `\1` — `\1` does not interpolate, so a
  "no cross-module internals" rule written with `(?!\1/)` silently matched
  *same-module* imports and produced 22 false positives; (2)
  `tsPreCompilationDeps: true` is **required**, or `import type` edges are
  invisible and any rule about type-only leakage (e.g. Drizzle row types)
  reports nothing and looks green. Run it without `pnpm exec`:
  `PATH=/usr/local/bin:$PATH node ./node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --config <cfg> --output-type err`.
  A verified onion-boundary baseline for the current tree is 24 errors /
  0 warnings over 151 modules. Evidence:
  `.claude/skills/onion-architecture/enforcement.md:1`.

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
- **2026-09-21** — SSRF guards can't string-match IPv4-mapped IPv6: `new URL()`
  normalises `https://[::ffff:127.0.0.1]/` to host `[::ffff:7f00:1]`, so a
  `startsWith('::ffff:')` + dotted-quad check lets loopback through. Parse IPv6
  to bytes and judge embedded IPv4 (mapped, NAT64, 6to4) by the IPv4 rules.
  Evidence: `server/src/adapters/remote-text/index.ts:46` (`parseV6`), `:98`
  (`isPublicAddress`); regressions in `server/test/remote-text.test.ts`.
- **2026-09-21** — Node `https.request({ timeout })` is a socket-*idle* timeout,
  not a deadline — a server that drips one byte at a time never trips it. Use one
  deadline timer across hops + body read that destroys the req/res. And the
  `lookup` option (where the rebinding-safe address check lives) is never called
  for IP-literal hosts — validate those before connecting. Evidence:
  `server/src/adapters/remote-text/index.ts:109` (`assertAllowedUrl`), `:127`
  (`guardedLookup`), `:169`/`:186` (`request`/`readBody`).

## Codebase Patterns

- **2026-09-22** — `pnpm db:seed` upserts demo skills and agents by name and
  inserts links with `onConflictDoNothing`. Re-running it after testing the
  Skills delete button on the live DB restores the deleted demo skills and
  links. Rows that still exist are left untouched: no re-enable, no body
  overwrite. Evidence: `server/src/db/seed.ts:315`.
- **2026-09-22** — An Infrastructure adapter is allowed to depend on ANOTHER
  adapter, injected via its own constructor — not just `Db`. `GitProjectDocsAdapter`
  (walks a repo clone for markdown project docs) takes a `GitClient` in its
  constructor rather than reaching for `container.git` itself; the composition
  root wires `new GitProjectDocsAdapter(this.git)` in the container getter,
  same as every other lazily-built adapter. This is the onion-architecture
  skill's "R7 — every external system sits behind a port" applied one layer
  deeper: the port's own implementation can compose a second port instead of
  talking to fs/DB directly. Evidence: `server/src/adapters/project-docs/index.ts:29`,
  `server/src/platform/container.ts` (`get projectDocs()`).
- **2026-09-21** — Agent stats (`GET /agents/stats`, `GET /agents/:id/stats`)
  aggregate over the agent's `status='done'` runs whose PR is in the given repo,
  and `avg_score`/`avg_cost_usd` are **per-PR-then-mean** (mean within a PR
  first, then across PRs) so a heavily re-reviewed PR can't dominate. The pure,
  unit-tested math lives in `server/src/modules/agents/stats.ts` (DB reads stay
  in `repository.ts`); the rules are mirrored in `specs/README.md` "Agent
  stats". Evidence: `server/src/modules/agents/stats.ts:14`.
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

- **2026-09-22** — `SkillsService` is the first service that follows onion R6:
  it takes a `SkillsServiceDeps` object of ports (`SkillsStore`, `RepoLookup`,
  `ProjectDocsAdapter`, `RemoteTextFetcher`) by constructor, not the
  `Container`, and `SkillsRepository implements SkillsStore` returns DTOs only.
  `routes.ts` does the wiring from `app.container`. Unit tests pass plain
  fakes, with no `as Container` casts. Copy this shape when fixing V5 in the other
  modules. Evidence: `server/src/modules/skills/ports.ts`,
  `server/src/modules/skills/routes.ts:70`.
- **2026-09-22** — `*.test.ts` vs `*.it.test.ts` is decided by DB/Docker use,
  not by "any I/O". `test/project-docs.test.ts` writes a `mkdtemp` directory and
  stays a unit test, because it needs no Postgres or testcontainers.
  Evidence: `server/test/project-docs.test.ts:36`.

## What Doesn't Work

- **2026-09-22** — Don't wrap imported (non-`manual`) skills with
  `wrapUntrusted` in the prompt. `INJECTION_GUARD` tells the model to ignore
  every instruction inside `<untrusted>`, so this silently disables every
  imported skill. Label them instead (`skillBlock` → `### Skill: <name> (imported url)`).
  The safeguard for imported skills is vetting: they are saved disabled until
  someone reads and enables them. Evidence: `server/src/modules/reviews/helpers.ts:102`,
  `reviewer-core/src/prompt.ts:16`.
- **2026-09-21** — Seeding extra `reviews` rows with the default
  `created_at = now()` silently hijacks PR #482: "latest review" is chosen by
  `created_at DESC` (`src/modules/pulls/routes.ts:128`,
  `src/modules/reviews/repository/review.repo.ts:66`), so any review inserted
  after the canonical seeded one replaces its score/findings on the PR list and
  PR detail. The server tests stay green, but e2e flows 04/08/11 fail. Backdate
  demo reviews to their run's `ran_at` (`createdAt: ranAt`). Evidence:
  `src/db/seed.ts` `insertRun` reviews insert.
- **2026-09-17** — Auditing every `outcome.<field>` read site is required
  whenever `ReviewOutcome`'s shape changes. `run-executor.ts` silently
  dropped `outcome.costUsd` for a long stretch via an incomplete
  `const { tokensIn, tokensOut, grounding } = outcome` destructure — the
  field was fully computed upstream (reviewer-core, LLM adapters) the whole
  time, just never read at the one call site that mattered. (Fixed since:
  `run-executor.ts:237` destructures `costUsd`, persisted at `:280`.)
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
  Evidence: `server/src/modules/repos/service.ts:121`,
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
  `server/src/modules/pulls/routes.ts:283,306`; guarded by
  `server/test/pulls-detail-status.it.test.ts`.

- **2026-09-18** — `completeAgentRun` before `saveRunTrace` published a
  "done" run (gone from `/runs/active`) whose trace did not exist yet, so
  `GET /runs/:id/trace` 404'd. Save the trace first (failure swallowed), then
  mark done. Evidence: `server/src/modules/reviews/run-executor.ts:303-304`;
  pinned by `server/test/reviews.it.test.ts` ("already has its trace").
- **2026-09-18** — Empty-diff trap (fixed — the seed now stores real patches):
  `seed.ts` stored PR #482's `pr_files` with no `patch`, `acme/payments-api`
  has no clone (fictional), and `diff-loader.ts:82` skips patchless files — so the demo PR reviewed an empty
  diff, paid for "nothing to review", recorded `done` and overwrote the seeded
  request_changes/61 with an empty approve. Pre-work that yields nothing to
  review must `failAll`, not proceed. A patchless `pr_files` row also renders a
  zero-line file card (`client/.../diff-viewer/helpers.ts:13`), so "diff tab
  looks empty" and "review found nothing" share a root cause. Evidence:
  empty-diff guard `server/src/modules/reviews/run-executor.ts:112`, demo
  patches `server/src/db/seed-patches.ts:9`, idempotent backfill
  `server/src/db/seed.ts:176`.
- **2026-09-18** — "No reviewable diff" on a REAL GitHub PR (quick-blog #12,
  71 files) was not the demo-data trap: the PR list imports PRs and even
  backfills their size from `getPullRequest`, but never stores `pr_files`
  (`server/src/modules/pulls/routes.ts:95`) — only opening the PR's page does
  (`routes.ts:246`). And the clone can't help: it's shallow `main` only, and
  `GitClient.fetchPullHead` exists but nothing calls it, so `git diff
  base...<PR head>` fails. So "Run Review" from the list on a never-opened PR
  had zero patches. `loadDiff` now fetches + stores the files from GitHub as a
  last resort (`server/src/modules/reviews/diff-loader.ts:25`). Also: the detail
  route's delete-then-insert of `pr_files` was two statements — a review
  loading its diff between them saw zero files; it is now one transaction
  (`server/src/modules/_shared/pr-files.ts:18`).
- **2026-09-18** — An empty diff is not always a data problem: quick-blog #36
  is open with 2 commits but GitHub reports `changed_files: 0` (its changes
  already landed on `main` via #33). One generic "check the GitHub token"
  message sent the user hunting for a non-problem. `loadDiff` now returns an
  `emptyReason` naming the actual cause (GitHub unreachable / PR changes no
  files / files but no text patches / patches unparseable) and the run fails
  with it. Check GitHub's own `changed_files` before debugging the pipeline.
  Evidence: `server/src/modules/reviews/diff-loader.ts:18`.
- **2026-09-21** — Seeding a non-`manual` skill with the column default
  `enabled: true` bypasses the vetting rule `SkillsService.create` enforces
  (imported ⇒ disabled): the run executor injected the seeded "imported" skill
  into every Test Quality Reviewer review with no "needs vetting" badge. The seed
  must apply the same rule. Evidence: `server/src/db/seed.ts:311`,
  `server/test/seed.it.test.ts` ("the imported one lands unvetted").

- **2026-09-22** — `SkillsService.importFromUrl` (`POST /skills/import`) is
  dead-ish code from the current UI's perspective: the "From URL" tab's
  Import button never calls it — it only calls `previewImportFromUrl`
  (`POST /skills/import/preview`) for the fetch step, then confirms through
  the same generic `POST /skills` every other creation path uses. It was
  still updated (create raw body as v1, `update()` with the
  frontmatter-stripped body as v2) for API-contract parity with the real
  (client-driven) flow, not because the UI exercises it. Check what a
  service method's actual caller is before assuming route + service method
  = the live code path. Evidence: `server/src/modules/skills/service.ts`
  (`importFromUrl`), `client/src/lib/hooks/skills.ts` (`usePreviewSkillUrl`
  is the only `/skills/import*` hook the client defines).
- **2026-09-22** — There's no DB column for a skill's import source URL, and
  none was added. `buildImportedMarkdown` (`server/src/modules/skills/helpers.ts`)
  instead stamps `external_skill_imported_from: <url>` into the fetched
  Markdown's own YAML frontmatter (creating the block if absent, updating
  the key in place on re-fetch) before the augmented text is ever assigned
  to `body`/`skills.body` — so provenance rides along in the one text field
  that's already persisted, instead of needing a migration, and survives
  even if the user later edits the description. `previewImportFromUrl` and
  `importFromUrl` both go through this one function now (replacing the bare
  `deriveSkillName` call), so preview and direct-import stay in sync.
  Evidence: `server/src/modules/skills/helpers.ts` (`buildImportedMarkdown`),
  `server/src/modules/skills/service.ts` (`importFromUrl`,
  `previewImportFromUrl`).
- **2026-09-22** — Don't compute a skill's next version as `existing.version + 1`
  outside a transaction and then insert the snapshot with `onConflictDoNothing()`:
  two concurrent PUTs both pick N+1, the second snapshot is silently swallowed,
  and `skill_versions` stops matching `skills.body`. Read the row with
  `.for('update')` inside `db.transaction`, and let a version-PK conflict throw.
  Covered by the "concurrent body edits" case in `test/skills.it.test.ts`.
  Evidence: `server/src/modules/skills/repository.ts:174`.

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
### 2026-09-21
- Finished the Skills feature (L02): SSRF-safe `POST /skills/import` behind a
  `RemoteTextFetcher` adapter, imported skills always saved disabled until vetted,
  input limits, N+1-free `GET /skills` stats, prompt-injection integration test
  (`server/test/reviews.it.test.ts`, "injects only enabled, vetted skills").
- Row→DTO mappers moved to `server/src/modules/skills/helpers.ts`, so
  `skills/service.ts` no longer imports Drizzle row types (root
  `insights/INSIGHTS.md`'s R5 entry updated to match).
- Not done: the plan's manual control experiments (real LLM run with/without the
  Test Quality skills) — needs the app running with an API key.

## Open Questions

- **2026-09-18** — Deleting every run of a PR removes its reviews (score goes
  back to none) but leaves `pull_requests.last_reviewed_sha` set, so the list
  STATUS still derives "reviewed". Should `deleteAgentRun` / `deleteReview`
  clear it when the PR's last review goes? Evidence:
  `server/src/modules/reviews/repository/run.repo.ts:88`,
  `server/src/modules/pulls/routes.ts:205`.

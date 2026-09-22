# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Codebase Patterns

- **2026-09-21** — Multi-tab editors that must not lose unsaved edits on a tab
  switch keep the stateful tab **mounted but hidden** (`display: none`) while
  the other tabs render conditionally — `AgentEditor` does this for `ConfigTab`
  (which holds the whole form's local state), so switching to Skills/Stats and
  back preserves in-progress edits. Evidence:
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`.
- **2026-09-17** — `client/src/components/<name>/` (cross-route shared
  components not tied to one page, e.g. `diff-viewer/`, `page-shell/`,
  `app-shell/`, `run-cost-badge/`) use kebab-case directory names — unlike
  route-local `_components/<Name>/` under `app/`, which use PascalCase.
  Evidence: `client/src/components/run-cost-badge/RunCostBadge.tsx:1`.
- **2026-09-18** — A dead `PrRowView` interface in `client/src/lib/types.ts`
  (unused, never constructed anywhere) had a `findings: { CRITICAL; WARNING;
  SUGGESTION }` field years before the findings-by-severity feature existed
  — confirming it was pre-seeded scaffolding for exactly this feature, and a
  reliable source for the wire shape to reuse. Worth checking `lib/types.ts`
  for unused view-model interfaces before designing a new field's shape from
  scratch. Evidence: `client/src/lib/types.ts:37-48`.
- **2026-09-18** — No Tooltip/Popover/portal component existed anywhere in
  `client/src` before the findings-by-severity popover
  (`components/findings-by-severity/SeverityFindingsPopover.tsx`) — the PR
  list's `tableCard` has `overflow: hidden` (`pulls/styles.ts`), which would
  clip a naive `position: absolute` popover the way `vendor/ui/kit/Dropdown.tsx`
  does it. `createPortal(node, document.body)` + `position: fixed` from
  `getBoundingClientRect()` avoids the clipping, but then click-outside
  detection needs refs to BOTH the trigger and the portaled panel (they're no
  longer DOM-nested) — a single `ref.contains()` check, as `Dropdown.tsx`
  uses, silently breaks once a portal is involved.
  **Extended 2026-09-18** — `vendor/ui/kit/Dropdown.tsx` now has the same
  fix, because the PR list's Actions column mounts a dropdown inside that
  same `overflow: hidden` `tableCard`. The failure mode is worth naming
  precisely: with the menu portaled, `mousedown` on a menu ITEM is "outside"
  the trigger ref, so the handler closes the menu and React unmounts the
  item **before** its own `click` ever fires — the item silently never runs,
  and nothing errors. Fix is a second `menuRef` checked alongside the
  trigger ref, exactly as `SeverityFindingsPopover`'s `panelRef` does. The
  regression test has to fire `mouseDown` then `click` in that order; a bare
  `fireEvent.click` passes even with the bug. Also note the portaled menu
  must be `position: fixed` from the trigger's `getBoundingClientRect()` —
  it has no offset parent any more, so the in-place `position: absolute` +
  `top: calc(100% + 6px)` styling silently lands at the top of the page.
  Evidence: `client/src/vendor/ui/kit/Dropdown.tsx:78-100`,
  `client/src/vendor/ui/kit/Dropdown.test.tsx:87-90`.

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

- **2026-09-20** — `client/next-env.d.ts` is Next-generated and its
  `routes.d.ts` reference flips between `./.next/...` and `./.next-e2e/...`
  depending on which run last touched it (`scripts/e2e.sh` sets
  `NEXT_DIST_DIR=.next-e2e`), so a tracked copy shows a spurious diff after
  every dev/e2e run. It is now untracked + gitignored (Next's recommendation).
  Harmless for tooling — `tsconfig.json` includes both `.next/types` and
  `.next-e2e/types`, eslint ignores it — but on a fresh clone the file doesn't
  exist until the first `next dev`/`build`, so a typecheck before that may lack
  the route types. Never `git add` it. Evidence: `client/next.config.mjs:12`,
  `scripts/e2e.sh:46`, root `.gitignore:13`, `client/tsconfig.json:33`.

- **2026-09-20** — Detecting server vs client components by reading the first
  few lines is unreliable: in
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` the `"use client"`
  directive sits at **line 6**, after a 5-line header comment, so a `head -3`
  check calls it a server component. Grep the whole file. (For the record
  there are exactly three real server components — `app/layout.tsx`,
  `app/agents/page.tsx`, `app/settings/[section]/page.tsx` — and none of them
  fetch.) Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:6`.

- **2026-09-20** — "How many component folders lack `styles.ts`?" has no
  single answer, for two reasons. (1) There are **two** directory conventions —
  route-local `_components/<PascalName>/<PascalName>.tsx` and cross-route
  `src/components/<kebab-name>/<PascalName>.tsx` — and a loop testing
  `[ -f "$d/$(basename $d).tsx" ]` finds only the first. (2) A sibling
  `styles.ts` is not the only sanctioned styling: sub-components may import
  their parent's `styles.ts` (`from "../styles"`), diff-viewer members share
  `cs` from `diff-viewer/comments.ts`, and pure-composition components (only
  `@devdigest/ui` + children, e.g. `DiffTab`, placeholder tabs) need none —
  sanctioned in `frontend-architecture` (SKILL.md "Styling"). Re-measure with
  both conventions and report "no sibling `styles.ts`" separately from
  "genuinely inline-styled"; counts drift with every feature. Evidence:
  `client/src/components/diff-viewer/comments.ts:108` (`export const cs`),
  `client/src/components/run-trace-drawer/_components/TraceSection/TraceSection.tsx:6`.
- **2026-09-21** — jsdom's `File` has no `arrayBuffer()`/`text()`, so code that
  reads uploads can't be tested with `new File(...)`. Type the input as
  `Pick<File, "name" | "size" | "arrayBuffer">` and pass plain objects in tests.
  Evidence: `client/src/app/skills/_components/CreateSkillModal/file-extractor.ts:27`.
- **2026-09-21** — ZIPs made by macOS Finder set general-purpose bit 3, so the
  *local* headers carry 0 sizes — a local-header walker silently finds nothing.
  Parse via EOCD + central directory, and cap the inflated size while streaming
  (the declared size can lie — zip bomb). Evidence: same file `:72`
  (`extractFromZip`), `:127` (`inflateCapped`).

## What Doesn't Work

- **2026-09-22** — Never import a runtime VALUE from `@devdigest/shared` in
  client code (e.g. `import { SkillType } … SkillType.options`) — only
  `import type`. The vendored `src/vendor/shared/index.ts` re-exports with
  server-style `.js` paths (`./contracts/findings.js`); Next's bundler can't
  resolve those to `.ts`, so the page 500s with `Module not found: Can't
  resolve './contracts/findings.js'`. Vitest resolves them fine, so typecheck,
  lint and every unit test stay green — only the running app (or `next build`)
  shows it. Type-only imports are erased, which is why no other client file
  hit this. Derive lists from a client-side exhaustive map instead
  (`SKILL_TYPES = Object.keys(SKILL_TYPE_COLOR)`). After touching imports, load
  the page in `pnpm dev`, not just `pnpm test`. Evidence:
  `src/lib/skill-type.ts`, `src/vendor/shared/index.ts`.
- **2026-09-22** — The entry above is now lint-enforced:
  `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` on
  `@devdigest/shared` (`eslint.config.mjs`, `src/**` minus `src/vendor/**`)
  fails `pnpm lint` on any value import, including a mixed
  `import { X, type Y }`. The PR-time backstop for every other bundler-only
  error is CI's `next build` in `.github/workflows/e2e-web.yml`.

- **2026-09-22** — Two colour gotchas that fail silently (no type/lint/test
  error, the colour just doesn't render): (1) `var(--warning)` is not a token
  — the palette is `--ok` / `--warn` / `--crit` / `--info` (+ `-bg`), see
  `src/vendor/ui/styles.css`; (2) `color + "1a"` hex-alpha only works on a hex
  literal, and every colour map here holds `var(--…)` strings, so it yields
  `var(--accent)1a` (invalid CSS, no background). Use `tint(color, pct)` from
  `src/lib/color.ts` (`color-mix`). Both had shipped in Skills/Agents cards.
  Evidence: `src/lib/color.ts:6`, `src/app/skills/_components/SkillCard/styles.ts`.

- **2026-09-22** — `vendor/ui/charts/Donut`'s legend defaults to a currency
  string (`valuePrefix = "$"`, rendering `$52.00`) unless the caller passes
  `formatValue`. A percentage-shares donut (or any non-money donut) that
  forgets this prop silently shows a `$` value instead of erroring — this is
  exactly the bug a Skills-Lab design mockup shipped with (`$52.00` where a
  `%` share was intended). The fix is always at the call site
  (`formatValue={(v) => \`${v}%\`}`), never in `Donut` itself. The Skill
  Stats tab already passes it correctly:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/StatsTab.tsx`
  (`formatValue={(v) => \`${v}%\`}`) + `client/src/lib/category-chart.ts`
  (`categoryDonutSegments` — largest-remainder rounding so shares always sum
  to 100). Evidence: `client/src/vendor/ui/charts/Donut.tsx:15,52`.
- **2026-09-21** — `git mv`-ing a component directory does NOT rewrite the
  `vi.mock("../../…")` relative paths inside its co-located test. They silently
  stop matching the (now differently-nested) module, so the REAL hook runs
  instead of the mock — surfacing as "No QueryClient set" deep in the render.
  Fix the mock-path depth by hand after any move; typecheck won't catch it
  (mock specifiers are plain strings). Evidence:
  `client/src/components/run-trace-drawer/RunTraceDrawer.test.tsx:23`.
- **2026-09-21** — `vendor/ui/charts/BarRow` renders its `suffix` prop in the
  right-hand value column and NOTHING from `value` — `value`/`max` only size the
  bar. To show a number next to the bar you must pass it as `suffix` (e.g.
  `suffix={`${pct}%`}`), not rely on `value`. Evidence:
  `client/src/vendor/ui/charts/BarRow.tsx:43`.
- **2026-09-21** — `vendor/ui/icons.tsx` is a hand-curated lucide-react subset
  (no `GripVertical`, etc.), and it's a hand-synced vendor file. Don't extend
  the registry for one glyph — reuse an existing name (`Menu` works as a
  drag-handle affordance). Evidence: `client/src/vendor/ui/icons.tsx:4`.
- **2026-09-21** — Co-located component tests import i18n JSON from the client
  ROOT `messages/` (one level ABOVE `src/`), while `lib`/`components` live under
  `src/`. So a test nested at
  `app/agents/[id]/_components/AgentEditor/_components/<Tab>/` needs eight `../`
  to reach `messages/…` but only seven to reach `src/lib`/`src/components` — an
  easy off-by-one that fails as a Vite "Failed to resolve import". Evidence:
  `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.test.tsx:5`.
- **2026-09-20** — A blanket ESLint ban on deep relative imports
  (`no-restricted-imports` patterns `../../*`, `../../../*`) cannot be
  satisfied by the `@/` alias alone: `@/*` maps to `./src/*`
  (`client/tsconfig.json`), but the i18n message files live **outside** `src`
  at `client/messages/en/*.json`, so imports like
  `../../../messages/en/prReview.json` have no aliased form. Add a second
  path (`@messages/*` → `./messages/*`) or exempt that group before turning
  such a rule on. Many deep relatives exist today — count with
  `grep -rlE "from ['\"](\.\./){2,}" src` before scoping the change. Evidence:
  `client/src/components/run-review-dropdown/RunReviewDropdown.test.tsx:4`,
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:11-12` (alias and
  deep relative in the same file).

- **2026-09-18** — `vendor/ui/primitives/Button.tsx`'s `active` prop is
  completely dead for `kind="secondary"`/`"ghost"` — only `kind="tertiary"`'s
  entry in the `kinds` style map actually reads it
  (`client/src/vendor/ui/primitives/Button.tsx:51-55`). `FindingCard.tsx` passed
  `active={accepted}`/`active={dismissed}` to `secondary`/`ghost` buttons for
  a long time with zero visual effect. Fix at the call site with a `style`
  override (Button spreads `style` last, so it always wins) rather than
  relying on `active` for these two kinds.
- **2026-09-18** — Installing new devDependencies in `client/` via `pnpm add`
  can hit `ERR_PNPM_IGNORED_BUILDS` for a transitive native binary
  (`unrs-resolver`, pulled in by `eslint-config-next`) — pnpm's
  build-approval gate blocking its postinstall script. The package still
  installs and the tool (`eslint`) still works; this is a warning-level
  gate, not a failure — verify with `ls node_modules/.bin/<tool>` before
  assuming the install failed. Same underlying mechanism as the
  esbuild-arch-mismatch class of issue; see
  `reviewer-core/INSIGHTS.md`/`.claude/skills/esbuild-arch-mismatch/SKILL.md`. Evidence: the build
  allowlist `client/pnpm-workspace.yaml:4` (`unrs-resolver: false`).
- **2026-09-17** — A naive `abs.toFixed(6)` for rounding a USD-cost string
  mis-rounds real binary-float inputs at exact `x5` boundaries (e.g.
  `0.0000135` is actually stored as `...499999999995`, so `toFixed(6)` rounds
  DOWN instead of up). Fix: round via a scaled integer
  (`Math.round(abs * 1e6)`) instead of `toFixed`. Even that needs an explicit
  `>= 1e6` carry check — a value just under 1 (e.g. `0.9999999`) can round up
  to exactly `1e6` and silently render as `"$0.100"` instead of `"$1.00"`,
  because `padStart(6, "0")` can't shrink an already-7-digit string. Caught
  by an independent code review, not by the original test suite (which only
  covered values ≤ 0.013). See `client/src/lib/cost.ts:21-26`.
- **2026-09-18** — In Zod 3 (3.25.76 here), `z.boolean().optional().default(false)`
  produces an inferred type where the key is **required**, not optional:
  `z.infer` is the OUTPUT type, and `ZodDefault` strips `undefined`. So adding
  such a field to a shared contract (e.g. `RunSummary.has_trace` in
  `src/vendor/shared/contracts/trace.ts`) still breaks `pnpm typecheck` on every
  existing object-literal test fixture — exactly what `.default()` was reached
  for to avoid. Verified empirically by compiling a one-line probe inside the
  real `tsconfig.json`: `Property 'b' is missing ... but required in type
  '{ a: string; b: boolean; }'`. Use plain `.optional()` when the goal is "old
  fixtures keep compiling"; reserve `.default()` for when you genuinely want a
  required output value. Evidence:
  `client/src/vendor/shared/contracts/trace.ts:119`.

- **2026-09-18** — Toggling border longhands (`borderColor`, `borderWidth`…)
  on a vendored `Button` — whose base style sets the `border` shorthand — or
  mixing `borderColor` with `borderLeftColor` triggers React's "conflicting
  property" dev warning on every toggle. Fixed here: (1) `FindingCard/styles.ts` `card()` sets per-side
  `borderTop/Right/BottomColor` instead of `borderColor` — `borderColor` is
  itself a shorthand, so toggling it on focus beside `borderLeftColor`
  warned. (2) `pressedBorder` uses `outline` instead of border longhands, so
  it never conflicts with `Button.tsx`'s `border` shorthand — no shared
  component change needed. For a conditional highlight on a vendored
  primitive, reach for `outline`/`boxShadow`, not border properties.
  Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:9-15`
  (`card()`) and `:72-75` (`pressedBorder`).

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
- **2026-09-18** — `vi.mock()` keys on the RESOLVED module, not the literal
  specifier: `vi.mock("../../../../../../lib/hooks/reviews", …)` in
  `PRRow.test.tsx:23` also mocks the `@/lib/hooks/reviews` import that the
  (differently-located) `RunReviewDropdown` uses, because the tsconfig alias
  resolves both to the same file. So one factory must export every hook BOTH
  call sites need (`usePrReviews` **and** `useRunReview`) — a factory that
  covers only its own component's hooks leaves the other one `undefined` at
  call time, with a "not a function" throw far from the mock.
- **2026-09-18** — The PR list's column order lives in THREE places that
  have no compile-time link: `COLUMN_KEYS` (header labels), `GRID` (the
  CSS grid tracks), and `PRRow.tsx`'s hand-ordered JSX cells. Nothing fails
  loudly if they drift — the table just renders each cell under the wrong
  header at the wrong width. Guarded now by two cheap tests (a `:nth-child`
  position assertion per `data-testid` cell, and `GRID.split(/\s+/).length
  === COLUMN_KEYS.length`), plus `:nth-child` assertions in e2e flow 02.
  Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:27`.
- **2026-09-18** — `next-intl` accepts an **empty-string** message value
  (`list.columns.actions: ""`) — it throws only on a genuinely missing key.
  That is the clean way to give a table a header-less column without
  special-casing the header `map`. Evidence:
  `client/messages/en/prReview.json:103` (`list.columns.actions`).
- **2026-09-18** — The "Last synced" label is **unreachable on seeded data**:
  `repos.last_polled_at` has no DB default (`server/src/db/schema/repos.ts:17`)
  and `seed.ts` never sets it, so it is `null` until someone actually clicks
  Refresh. Any e2e flow asserting that text would have to trigger a real
  refresh — which enqueues a live `git clone` and breaks the read-only
  contract every flow here relies on. Covered by `FilterBar.test.tsx`
  instead; noted in flow `09-pr-list-actions.flow.json`'s description.
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
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:99-102`.
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
- **2026-09-21** — A form that stays mounted across tabs (SkillEditor keeps
  ConfigTab mounted to keep unsaved edits) and resets only on `skill.id` goes
  stale after a restore or a list toggle — Save then overwrote the restore with
  the old body. Rebase per field (take the server value for fields the user hasn't
  touched) and send only changed fields. Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/draft.ts:24,33`.
- **2026-09-21** — next-intl: markup passed as a `t()` argument renders as literal
  `<code>` text — use `t.rich`. Missing keys fail only at runtime on the one
  screen that renders them; restructuring `skills.json` by overwrite dropped
  keys still in use (`preview.untrustedNotice`, `detail.loadError`). Merge
  message files, and `client/src/app/skills/i18n-keys.test.ts` now checks every
  static `t("…")` key. Evidence: `.../PreviewTab/PreviewTab.tsx:28`.
- **2026-09-21** — `vi.mock` factories are hoisted: referencing a top-level
  `const fn = vi.fn()` throws "Cannot access … before initialization" — use
  `vi.hoisted`. A `vi.mock` path with one `../` too few doesn't error, it just
  doesn't apply, and the real hook runs. Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/StatsTab.test.tsx:8`.

## Session Notes

### 2026-09-18
- Implemented the L01 follow-up: list Run Review feedback (toast + per-row "Running…"
  chip + in-place refresh), Run Trace drawer log/trace fixes, the LLM-free PR
  BRIEF card (`ReviewBriefCard`) on the Overview tab, `verdictFromCounts`,
  `lib/tokens.ts`.
- Follow-up fixes found by the user: severity chips/pills not writing
  `?severity=` + URL severity not applied; drawer filter dead on first open
  (SSE connection limit); stuck list chip (shared cache `staleTime`); list
  score surviving run deletion; score rings back to score thresholds.
- Not done / known gaps: ≥6 simultaneous live runs still starve the Findings
  tab's own streams and polling; an already-open PR page doesn't notice a run
  started in another tab until reload.

## Open Questions

- **2026-09-18** — Should live run events be multiplexed into one SSE stream
  per PR (server change) or should the API be served over HTTP/2, to remove
  the 6-connection ceiling for good? Evidence:
  `client/src/lib/hooks/reviews.ts:236`.

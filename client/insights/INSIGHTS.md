# Insights — client

Non-obvious findings and gotchas that apply broadly across `client/`. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Feature-specific findings live in sibling files instead:
`insights/pr-review.md` (PR page — findings, review runs, verdict/score,
SSE/polling) and `insights/skills-lab.md` (Skills editor — Config/Context/
Preview/Stats tabs, skill import).

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
- **2026-09-18** — Installing new devDependencies in `client/` via `pnpm add`
  can hit `ERR_PNPM_IGNORED_BUILDS` for a transitive native binary
  (`unrs-resolver`, pulled in by `eslint-config-next`) — pnpm's
  build-approval gate blocking its postinstall script. The package still
  installs and the tool (`eslint`) still works; this is a warning-level
  gate, not a failure — verify with `ls node_modules/.bin/<tool>` before
  assuming the install failed. Same underlying mechanism as the
  esbuild-arch-mismatch class of issue; see
  `reviewer-core/insights/INSIGHTS.md`/`.claude/skills/esbuild-arch-mismatch/SKILL.md`. Evidence: the build
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
- **2026-09-18** — `vi.mock()` keys on the RESOLVED module, not the literal
  specifier: `vi.mock("../../../../../../lib/hooks/reviews", …)` in
  `PRRow.test.tsx:23` also mocks the `@/lib/hooks/reviews` import that the
  (differently-located) `RunReviewDropdown` uses, because the tsconfig alias
  resolves both to the same file. So one factory must export every hook BOTH
  call sites need (`usePrReviews` **and** `useRunReview`) — a factory that
  covers only its own component's hooks leaves the other one `undefined` at
  call time, with a "not a function" throw far from the mock.
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

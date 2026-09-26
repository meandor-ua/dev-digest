# Insights — client

Non-obvious findings and gotchas that apply broadly across `client/`. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Feature-specific findings live in sibling files instead:
`insights/pr-review.md` (PR page — findings, review runs, verdict/score,
SSE/polling) and `insights/skills-lab.md` (Skills editor — Config/Context/
Preview/Stats tabs, skill import).

## Codebase Patterns

- **2026-09-26** — Every failed mutation is already toasted by the global
  `MutationCache.onError` (`client/src/lib/providers.tsx:41-43`); a caller's
  own `onError: (err) => toast.error(err.message || fallback)` repeats the
  same text. The toast store now drops an exact (kind + message) repeat that
  is still on screen (`client/src/lib/toast.tsx:63`, `toast.test.tsx`), so
  such callers show one toast. In new code, don't add a local error toast at
  all unless it says something the API message doesn't (e.g. SkillsTab's
  "Couldn’t save skills. Reverted.").
- **2026-09-25** — The vendored `Badge` (`@devdigest/ui`) has no `title` prop
  — wrap it in a plain `<span title="...">` instead of passing `title`
  through, or TS rejects the extra prop. No dedicated "orange/disabled" color
  token exists either; reuse `var(--warn)` / `var(--warn-bg)` (the WARNING
  severity color) for any other "globally disabled but still relevant"
  badge. Evidence: `client/src/vendor/ui/primitives/Badge.tsx`,
  `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`.
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
  Evidence: `client/src/vendor/ui/kit/Dropdown.tsx:127-143`,
  `client/src/vendor/ui/kit/Dropdown.test.tsx:100-123`.
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

- **2026-09-26** — A create-skill form must hide/disable its "Enabled" control
  whenever the skill will be saved with `source != "manual"` — the server
  enforces vetting unconditionally (`SkillsService.create`,
  `server/src/modules/skills/service.ts`: `source === 'manual' ? input.enabled
  : false`), so a user-facing toggle for a non-manual create path is dead UI:
  the value is silently discarded on save, with no error. Found in the
  Conventions "Create skill from conventions" modal, which always submits
  `source: "extracted"` but still rendered an editable Enabled toggle. Fixed
  by replacing the toggle with a static notice (matching the pattern the main
  Skills `CreateSkillModal` already uses for imported content). Evidence:
  `client/src/app/repos/[repoId]/conventions/_components/CreateSkillModal/CreateSkillModal.tsx`,
  `server/src/modules/skills/service.ts:54-56`,
  `server/specs/README.md:114` ("Vetting: non-manual skills always disabled on creation").
- **2026-09-24** — `queryClient.removeQueries({ queryKey })` does NOT make a
  still-mounted `useQuery` observer for that key refetch or error — it just
  wipes the cache entry, so the component keeps rendering its last-known
  `data` forever with `isLoading`/`isError` both `false`. `useDeleteAgent`
  used `removeQueries(["agent", id])` on delete; deleting the agent currently
  open in its own editor (`/agents/[id]`) left the page showing a fully
  populated "dead" form for a row that no longer exists server-side, with the
  rail (`AgentsColumn`) correctly refetching `["agents"]` and dropping the
  tile — no error ever surfaced. Confirmed via network trace: DELETE →
  GET `/agents` (refetch, 200) → **no** GET `/agents/:id` at all. Fix pattern
  (already used by `SkillsColumn`/`useDeleteSkill`, just not mirrored for
  agents): don't rely on cache invalidation to detect "I'm viewing something
  that got deleted" — move delete ownership out of the leaf card
  (`AgentCard`/`SkillCard` take `onDelete`/`deleting` props, not their own
  mutation) up to the column/list, `mutate` with an `onSuccess` that
  explicitly checks `deletedId === activeId` and `router.push` away (e.g. to
  `/agents`). Evidence:
  `client/src/lib/hooks/agents.ts` (`useDeleteAgent`),
  `client/src/app/agents/[id]/_components/AgentsColumn/AgentsColumn.tsx`,
  `client/src/app/skills/_components/SkillsColumn/SkillsColumn.tsx:29`.
- **2026-09-22** — A capture-phase `scroll` listener on `window` that closes
  a Dropdown fires for every scroll, including a scroll inside the menu and
  for in-place menus. Inside an `overflow: auto` container (the agent Skills
  tab), a long "Attach skill" list grows the scroll area, so reaching the
  lower items closed the menu. Fix: close only when `portal` is set, ignore
  scrolls whose target is inside `menuRef`, and cap the menu with `maxHeight`
  + `overflowY: auto`. Use `portal` inside scrolling panes. Evidence:
  `client/src/vendor/ui/kit/Dropdown.tsx:115`,
  `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:115`.
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

- **2026-09-22** — For a full-set-replace autosave mutation (the agent Skills
  tab), an unconditional `setQueryData(key, data)` in `onSuccess`, or a rollback
  in `onError`, clobbers a newer in-flight optimistic edit. The next save is
  then built from that stale cache and silently undoes the edit. Give the
  mutation a `mutationKey`, and only write or roll back when
  `qc.isMutating({ mutationKey }) === 1`: TanStack runs these callbacks while
  the mutation still counts as pending, so 1 means "only me". Evidence:
  `client/src/lib/hooks/agents.ts:153`, test `client/src/lib/hooks/agents.test.tsx`.
- **2026-09-24** — `/skills/[id]` and `/agents/[id]` are separate route
  segments from `/skills` and `/agents`, so clicking a list tile navigates to
  a **different `page.tsx` tree** — the whole `SkillsColumn`/`AgentsColumn`
  remounts (fresh component instance), which silently resets the list `div`'s
  scroll to the top and drops the browser focus the click had put on the
  tile, even though the same list re-renders with the newly active row. Most
  visible when the clicked tile is far down the list: it opens correctly in
  the 3rd-column editor, but the rail jumps back to the top and focus is
  lost. Fix: a `ref` on the scrollable list `div` plus a `useEffect` keyed on
  `activeId` that finds the active card via `data-testid` and calls
  `scrollIntoView({ block: "nearest" })` + `focus({ preventScroll: true })`
  after the remount settles — restoring what the browser's default focus/
  scroll-anchoring would have preserved on a same-tree re-render. Needed
  `AgentCard` to gain `data-testid`/`role="button"`/`tabIndex={0}` to match
  `SkillCard`, since it wasn't focusable before. jsdom has no
  `scrollIntoView`, so tests need the call optional-chained
  (`el?.scrollIntoView?.(...)`). Evidence:
  `client/src/app/skills/_components/SkillsColumn/SkillsColumn.tsx:47-57`,
  `client/src/app/agents/[id]/_components/AgentsColumn/AgentsColumn.tsx:31-41`.
  **Corrected same day** — `scrollIntoView` still produces a visible jump
  (the user's actual complaint), and is unnecessary: the clicked tile is
  already exactly where the user left it, so there's nothing to scroll
  *to*. Replaced with straight scroll-offset preservation: a module-level
  `let savedScrollTop = 0` (survives the remount because it lives outside
  the component closure, unlike `useState`/`useRef`), updated on the list's
  `onScroll`, and written back to `listRef.current.scrollTop` in a
  `useLayoutEffect(() => {...}, [])` so it applies before paint (no flash of
  scroll-to-top). Focus restore is unaffected — `focus({ preventScroll:
  true })` never scrolls.

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

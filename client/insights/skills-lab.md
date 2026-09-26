# Insights — client / Skills Lab

Findings and gotchas specific to the Skills editor (Config / Context /
Preview / Stats tabs) and skill import. General client conventions live in
the package's `insights/INSIGHTS.md`.

## Codebase Patterns

- **2026-09-26** — The Agent editor deliberately keeps **5** tabs (Config,
  Skills, Evals, Stats, CI), not the course's nominal 2 (Config, Skills) —
  Evals/Stats/CI were already built by an earlier lesson and stripping them
  down would be a regression, not a fix. Accepted as a documented grading
  deviation rather than removing working functionality. Evidence:
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (tab
  list).

- **2026-09-24** — `/skills` is the standalone browse state: it renders a searchable tile grid and must not auto-redirect to the first skill. Only selecting a tile navigates to `/skills/:id`, whose route adds the editor rail and detail pane; keep create/import actions in the grid so they retain their selected modal tab. Evidence: `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx:47,77-81,108`.
- **2026-09-21** — jsdom's `File` has no `arrayBuffer()`/`text()`, so code that
  reads uploads can't be tested with `new File(...)`. Type the input as
  `Pick<File, "name" | "size" | "arrayBuffer">` and pass plain objects in tests.
  Evidence: `client/src/app/skills/_components/CreateSkillModal/file-extractor.ts:27`.
- **2026-09-21** — ZIPs made by macOS Finder set general-purpose bit 3, so the
  *local* headers carry 0 sizes — a local-header walker silently finds nothing.
  Parse via EOCD + central directory, and cap the inflated size while streaming
  (the declared size can lie — zip bomb). Evidence: same file `:72`
  (`extractFromZip`), `:127` (`inflateCapped`).
- **2026-09-22** — File import pulls out the skill's core with
  `parseSkillMarkdown`: frontmatter `name`/`description` fill the form, and
  the frontmatter block is removed from the body. In a zip, `SKILL.md` is
  preselected. The parser reads only flat `key: value` pairs and `>`/`|`
  blocks, not full YAML, so nothing in an imported file can expand or execute.
  The URL import path (server `deriveSkillName`) does not parse frontmatter
  yet. Evidence: `client/src/app/skills/_components/CreateSkillModal/skill-markdown.ts:56`.
- **2026-09-22** — Supersedes the entry above about the URL import path not
  parsing frontmatter: it now does, server-side, via
  `buildImportedMarkdown` (`server/src/modules/skills/helpers.ts`), which
  `previewImportFromUrl`/`importFromUrl` both call. `SkillImportPreview`
  gained a `description` field (both vendored `knowledge.ts` copies) so the
  client can prefer it the same way file import already prefers
  `parseSkillMarkdown`'s parsed description — fallback text only when the
  frontmatter has none. Unlike file import, the URL path does NOT strip
  frontmatter out of the body; it's kept inline (with a stamped
  `external_skill_imported_from: <url>` key) so the source URL survives in
  `skills.body` from the first save even after the description is edited.
  The "Add Skill" dropdown (`SkillsColumn.tsx`) can now reach this tab —
  before, it only offered scratch/file even though the URL tab already
  existed in `CreateSkillModal`. Evidence:
  `client/src/app/skills/_components/CreateSkillModal/CreateSkillModal.tsx:150`,
  `server/src/modules/skills/helpers.ts` (`buildImportedMarkdown`).
- **2026-09-22** — Both import paths (file and URL) now save the raw import
  as version 1, then immediately chain a second save with the YAML
  frontmatter cut, as version 2 — done entirely client-side in
  `CreateSkillModal.tsx`'s `handleSubmit` (`createMutation` with the raw
  body, then `updateMutation` with `stripFrontmatter(rawBody)` in its
  `onSuccess`), reusing `useUpdateSkill` the same way `SkillsColumn.tsx`
  does. A `rawBody` state, set once at import time and never touched by
  further edits to the working `body`, is what makes v1 an untouched
  archival copy even if the user edits the form before confirming. The
  second save is skipped (`needsStrip` false) only when stripping would be a
  no-op — true for a header-less file, but for URL import
  `buildImportedMarkdown` (server) always injects a provenance frontmatter
  block, so a URL import always produces v2. Evidence:
  `client/src/app/skills/_components/CreateSkillModal/CreateSkillModal.tsx`
  (`handleSubmit`, `needsStrip`), `stripFrontmatter` exported from
  `skill-markdown.ts`.
- **2026-09-22** — The raw-v1/stripped-v2 frontmatter strategy also applies
  to "Create from scratch": pasting/typing a body with a YAML header there
  auto-fills empty Name/Description live (guarded by `!name.trim()` /
  `!description.trim()`, so an already-filled field is never overwritten),
  but — unlike file/URL import — the header is never cut from the visible
  Body textarea; the cut happens only at Create Skill submit time. This
  means `handleSubmit`'s v1/v2 split has two independent triggers: `origin
  === "imported"` (compares the frozen `rawBody` against the edited working
  `body`) vs. the scratch case (runs `stripFrontmatter` on `body` itself at
  submit time) — same v1-raw/v2-stripped outcome, different origin and
  different point at which the header actually gets cut. Evidence:
  `client/src/app/skills/_components/CreateSkillModal/CreateSkillModal.tsx`
  (`handleBodyChange`, `handleSubmit`'s `v1Body`/`v2Body`).
- **2026-09-22** — The skill draft (unsaved form state + rebase) lives in
  `useSkillDraft`, called by `SkillEditor`, not inside ConfigTab. That way
  Preview renders the unsaved body and its Restore button drops the edits. A
  ConfigTab test must render through a harness that calls the hook. Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/draft.ts:33`.
- **2026-09-22** — The Skill body highlights headings without an editor
  library. An `aria-hidden` `<pre>` sits under a textarea with transparent
  text (`caretColor` keeps the caret visible). Both must share font, padding,
  line-height and `whiteSpace: pre`. The textarea never scrolls vertically
  (`rows={lineCount}`), so only `scrollLeft` needs syncing, through a
  transform. Evidence: `.../ConfigTab/ConfigTab.tsx` (`highlightRef`) and
  `.../ConfigTab/styles.ts` (`highlightLayer`).
- **2026-09-22** — Versions → Diff compares a version with version n-1 (what
  that save changed), not with the current body. Comparing with the current
  body showed every change since that version, and gave the Current row
  nothing to diff. Evidence: `.../VersionsTab/VersionsTab.tsx` (`prev`).

- **2026-09-22** — Kept-mounted editor forms use the generic
  `useDraft(id, server, FIELDS)` from `client/src/lib/draft.ts` (three-way
  rebase plus a `draftPatch` of only the changed fields). Both the skill
  editor's `draft.ts` and the agent `ConfigTab` are thin wrappers over it. The
  skill page also wraps the column and editor in `UnsavedChangesProvider`
  (`client/src/lib/unsaved-changes.tsx`): the editor reports
  `useReportUnsaved(dirty)`, and `SkillsColumn` calls `confirmDiscard()` before
  `router.push`. Imported-skill provenance in `CreateSkillModal` is an `origin`
  state set by the import paths, never derived from the open tab. Evidence:
  `client/src/lib/draft.ts`, `client/src/app/skills/_components/CreateSkillModal/CreateSkillModal.tsx:55`.
- **2026-09-26** — `ConventionCard` is a 2-column CSS grid: row 1 = rule +
  edit/delete icons, and the Accept/Reject button stack sits in column 2
  starting at grid row 2 so its top aligns with the evidence block. Its
  `gridRow` end line is computed from whether the rationale row renders
  (`5` vs `4`) — adding/removing a column-1 row means updating
  `lastRowLine`, or the stack spans a phantom row / overlaps. Evidence:
  `client/src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.tsx:57`.

- **2026-09-26** — The standalone `/skills` page's `SkillCard` already
  distinguishes an unvetted skill (`skill.source !== "manual" && !skill.enabled`)
  from a deliberately-disabled one with a separate orange "needs vetting"
  badge (`SkillCard.tsx:33`), but the Agent editor's `SkillsTab`
  (`client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`)
  only ever showed the generic "Disabled" badge for both cases — added the
  same `needsVetting` check to both `LinkedSkillRow` and `UnlinkedSkillRow`,
  with the "Needs vetting" badge (still `var(--warn)`/`var(--warn-bg)`, same
  orange as "Disabled") taking priority so a row shows one or the other, never
  both. Any future per-skill status badge added to one of these two views
  should be checked against the other for the same gap.

## What Doesn't Work

- **2026-09-26** — A DIFFERENT "stuck forever" bug than the `CreateSkillModal`
  one below: the Conventions page's "Re-scan" button (`page.tsx`'s
  `extract.mutate()`) had no client-side timeout, and `ConventionsService.extract`'s
  single LLM call (`server/src/modules/conventions/service.ts`) goes through
  `OpenRouterProvider.completeStructured` whose underlying OpenAI-SDK client is
  built with `timeout: 90_000, maxRetries: 2`
  (`server/src/platform/container.ts`'s `buildLlm`) — so a slow/failing call can
  legitimately take up to ~4.5 minutes before ever settling. Isolated this by
  calling each phase of `extract()` directly against the real dev DB with a
  mocked LLM (SAMPLE/PROPOSE/VERIFY code resolves in <20ms) vs. the real
  OpenRouter call with the full system prompt + strict JSON schema (measured
  67s for one successful call). The button wasn't actually hung — it was
  waiting on a real, unbounded network call with zero progress feedback, which
  reads as broken. Fix: added a generic `timeoutMs` (AbortController-based) to
  `client/src/lib/api.ts`'s `apiFetch`/`api.post`, gave `useExtractConventions`
  a 90s bound (`client/src/lib/hooks/conventions.ts`), and added a "can take up
  to a minute" subtitle hint while `extract.isPending` (`page.tsx`). Evidence:
  `client/src/lib/hooks/conventions.ts` (`EXTRACT_TIMEOUT_MS`),
  `server/src/platform/container.ts` (`buildLlm`),
  `reviewer-core/src/llm/openrouter.ts:54` (`timeoutMs ?? 90_000`).
- **2026-09-26** — Don't call `useMutation()`'s `.mutate(vars, { onSuccess, onError })`
  from inside a mount-only `useEffect` (even one guarded by a `fetchedRef` so
  it only fires once) — under Next's `reactStrictMode: true`
  (`client/next.config.mjs`), React double-invokes effects on mount
  (mount → cleanup → mount), and the cleanup pass unsubscribes the
  TanStack Query `MutationObserver` from its underlying `Mutation`
  (`onUnsubscribe` → `removeObserver`, with no `onSubscribe` override to
  re-attach on the remount). When the request later resolves, `#notify()`'s
  `if (this.#mutateOptions && this.hasListeners())` gate is false, so the
  `onSuccess`/`onError` callbacks never fire and `isPending` never flips —
  even though the request itself succeeds (200 in the Network tab). The
  "Create skill from conventions" modal got stuck on its loading skeleton
  forever in dev because of exactly this. Fix: call `mutateAsync()` and
  consume the returned promise directly (`.then()/.catch()/.finally()`) —
  that promise comes from `Mutation.execute()` and doesn't depend on observer
  subscription — and track loading with local `useState`, not
  `mutation.isPending`. Evidence:
  `client/src/app/repos/[repoId]/conventions/_components/CreateSkillModal/CreateSkillModal.tsx:48-65`;
  root cause in
  `node_modules/.pnpm/@tanstack+query-core@5.101.0/node_modules/@tanstack/query-core/src/mutationObserver.ts`
  (`onUnsubscribe`, `#notify`).
- **2026-09-26** — `messages/en/skills.json` already has a top-level `"preview"`
  key (the SkillEditor's Preview tab: title/subtitle/restore/dangerousNotice).
  Adding a second top-level `"preview"` object anywhere else in the same file
  doesn't error — JSON just keeps the LAST occurrence, silently discarding the
  first, and every `t("preview.…")` call resolves against whichever one lost.
  A component reading the shadowed keys gets `IntlError: MISSING_MESSAGE` at
  runtime with no build-time signal. Grep the target namespace file for the
  exact key you're about to add (`grep -n '"preview"' messages/en/skills.json`)
  before picking a name (a since-removed list-preview drawer had to use
  `"listPreview"` for exactly this reason). Evidence:
  `client/messages/en/skills.json:54` (the one top-level `"preview"`).
- **2026-09-22** — ReactMarkdown lists render without bullets here: the app's
  CSS reset strips `list-style`, so `<ul>` needs an explicit
  `listStyle: "disc"` (and `<ol>` needs `"decimal"`). Evidence:
  `.../PreviewTab/styles.ts` (`mdUl`/`mdOl`).
- **2026-09-22** — Don't run `npx prettier` in `client/`. Prettier isn't a
  project dependency, and its default 80-column width re-wraps whole files
  written at ~110 columns, which buries the real diff. Evidence: `client/package.json`.

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

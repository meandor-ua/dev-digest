# Insights — client / Skills Lab

Findings and gotchas specific to the Skills editor (Config / Context /
Preview / Stats tabs) and skill import. General client conventions live in
the package's `insights/INSIGHTS.md`.

## Codebase Patterns

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
  yet. Evidence: `client/src/app/skills/_components/CreateSkillModal/skill-markdown.ts:47`.
- **2026-09-22** — The skill draft (unsaved form state + rebase) lives in
  `useSkillDraft`, called by `SkillEditor`, not inside ConfigTab. That way
  Preview renders the unsaved body and its Restore button drops the edits. A
  ConfigTab test must render through a harness that calls the hook. Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/draft.ts:56`.
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

## What Doesn't Work

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

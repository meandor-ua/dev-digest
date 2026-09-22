# specs — client

Specs / acceptance criteria for the `client` package.

## Severity pills (Review-runs accordion) — `FindingsPanel`

- Rendered directly under `VerdictBanner`, above the existing
  "hide low confidence" toggle.
- One pill per severity **with count > 0 only** — a severity with zero
  findings gets no pill at all.
- Text is literally `N CRITICAL`, `N WARNING`, `N SUGGESTION` (count before
  the label, uppercase), pills joined by `·` — this does NOT reuse
  `SeverityBadge`'s default icon→label→count order or its `compact` mode
  (which drops the label), since neither produces the required order.
- Counts **include** dismissed findings (see root `docs/README.md` for why).
- Click a pill → filters the finding-cards below to only that severity.
  Click the same pill again, or press Escape → clears back to the full list.
- The pill's own count must always equal the number of finding-cards
  actually rendered below it, at the current "hide low confidence" setting —
  both are derived from the same `afterConfidence` array.
- Clicking a pill resets keyboard focus (`j`/`k`) to index 0, so `a`/`d`
  shortcuts never silently act on nothing after a filter shrinks the list.

## Skills editor — tabs

`app/skills/[id]/_components/SkillEditor/` — six text-only tabs (Config ·
Context · Preview · Evals · Stats · Versions). Header
(`app/skills/[id]/page.tsx`): type-tinted icon box, mono skill name, type
badge, `GitCommit vN` badge, and a disabled "Run on evals" button (tooltip
"Not available yet") — no Delete button; Delete lives in Config's danger zone
instead.

- **Config** — "Configuration" + `vN` badge, Enabled toggle top-right; stacked
  Name* / Description (keeps the directive hint caption — teacher AC) / Type
  (plain type names, from `SKILL_TYPES`) / Skill body* fields. The
  editor header shows `<slugified-name>.md`, an "Unsaved" chip while dirty,
  and `N tokens` (`estimateTokens`, `src/lib/tokens.ts`). An optional "Change
  note" field appears only while the **body** differs from the server and is
  sent as `message` on save — server-side, a message only takes effect when
  `body` actually changed (a message-only patch is a no-op, matching `PUT`'s
  "empty patch" contract in `server/specs/README.md`). A danger-zone row at
  the bottom holds Delete (`useDeleteSkill` + `confirm()`).
- **Context** — attach project docs (`specs/`, `docs/`, `INSIGHTS.md`) from
  the active repo (`useActiveRepo()`; no repo → "Select a repo" state). Rows:
  drag handle (`@dnd-kit`, same pattern as the Agent editor's Skills tab;
  disabled while a filter is active), checkbox, filename + dir, a
  specs/docs/insights category badge, and an eye button opening a modal with
  the doc's text. An attached path the repo no longer lists keeps its row
  (checked, so it can be unchecked) with a muted "not in this repo" label, no
  category and no eye button — never a guessed category. Toggling a checkbox
  or dragging a row autosaves optimistically via `useSetSkillContext`
  (rollback + toast on error, same pattern as `useSetAgentSkills`). A
  "Serializes as" block at the bottom groups the attached paths by category —
  what actually gets injected under `## Project context` at review time, so
  missing paths are left out. See `server/specs/README.md`'s "Project context"
  section for why only paths (never content) are stored.
- **Preview** — "Preview" + "Rendered as the reviewing agent receives it." +
  one card of the skill body rendered as markdown. No token badge, info box,
  or `## Skills / rules` section header — those belong to Config's editor
  chrome, not this "what the model actually sees" preview.
- **Evals** — `EmptyState`, "Eval cases aren't available yet" (no lesson
  numbers — Evals stays a placeholder; Context does not).
- **Stats** — KPI tiles `N agents` (ICU plural unit), `N%` pull frequency,
  `N%` accept rate with a `CircularScore` gauge in the tile's top-right
  (`MetricCard`'s additive `aside` slot), and findings (30d). Section titles
  are uppercase with Cpu / Tag icons; each agent row ends in "Open" and links
  to `/agents/:id?tab=skills`. The findings-by-category donut legend shows
  each category's integer **percentage share, always summing to 100%**
  (`categoryDonutSegments`, largest-remainder rounding) — never a `$` prefix,
  which is `Donut`'s currency-shaped default and would be wrong here
  (`StatsTab.test.tsx` asserts both: no `$` in the legend, and the shown
  percentages sum to 100).
- **Versions** — "Version history" + "N versions" chip + subtitle. Every row
  starts collapsed. Each row: `vN` badge, then the version's `message`
  (fallback: "Saved body") above a `YYYY-MM-DD` date (UTC, so it's
  deterministic regardless of the viewer's timezone). The current version gets
  a green "Current" pill and no actions; other rows get "Diff" (toggles the
  existing line-diff view) and "Restore" (defaults the restore's own message
  server-side to `"Restored from v{n}"` when none is given).

Type colours come from one owner, `src/lib/skill-type.ts` (`SKILL_TYPE_COLOR`,
also used by the Agent editor's Skills tab); translucent fills go through
`tint()` (`src/lib/color.ts`, `color-mix`) because every colour here is a
`var(--…)` token and a hex-alpha suffix (`color + "1a"`) is invalid CSS on
one.

`SkillCard` (skills list): type-tinted icon box, a
source icon + i18n'd label (`listItem.source.*`, not a hardcoded map), and a
stats line (below a divider) where `accept_rate_pct` shows **`—`** when the
field is absent or `null` (no findings yet) — never a fabricated `100%`. The
Stats tab's accept-rate tile does the same and drops its gauge.

`CreateSkillModal`'s URL tab is fetch → preview → confirm: "Fetch" calls
`POST /skills/import/preview` and prefills the SAME name/description/type/
body fields the file-import tab uses (editable before saving); "Import
skill" then saves through the normal `POST /skills` create path (`source:
"imported_url"`, `enabled: false`) — it no longer calls `POST /skills/import`
directly, closing the gap where a URL import skipped preview/confirm
entirely.

## Read-only popover — `components/findings-by-severity/`

- Three placements, one component: PR list row (counts = the PR's **latest
  review only**, all runs); PR Detail Timeline tile (counts = **that one
  run only**); PR Detail Review-run accordion **header** (counts = that
  run's **active** findings, rendered `compact` so it carries no visible
  severity-name text).
- Popover title is exactly `N FINDINGS IN THIS RUN`.
- Each listed finding shows: severity icon, title, category, `file:line`,
  confidence %, short description — **no buttons**, ever. This is a preview
  surface; it never gates or triggers Accept/Dismiss.
- Counts **exclude** dismissed findings; accepted findings still count.
- Hover opens; a short close-delay bridges leaving the trigger and entering
  the portaled panel. Pressing Escape, or clicking outside (trigger AND
  panel), closes/clears it. **Hover behaviour is identical at all three
  placements** — same popover, same `N FINDINGS IN THIS RUN` title, same
  read-only cards.
- **Click semantics are deliberately per-placement** (not one global rule —
  the popover is never "a filter on another list"; it either pins itself or
  hands the click to the page):
  | Placement | Props | On click |
  |---|---|---|
  | PR list row | `onSeverityClick` | fires it (cross-page `router.push` to `?tab=findings&severity=…`); does **not** pin/narrow — the page is being left |
  | Timeline tile | `onSeverityClick` | fires it (`onGoToReview(runId, sev)` → scroll to that run's accordion + filter it); does **not** pin/narrow |
  | Accordion header | `onSeverityClick` + `pinOnClick` | fires it (parent syncs `?agent=&severity=`) **and** still pins + narrows its own popover — the only "both fire" site, because it's already at the Review-runs section |
  | anywhere else | neither | unchanged pin + narrow (the safe default for any future caller) |
- All-zero counts render a single muted `—` (`data-testid="findings-badge-empty"`),
  with no popover wiring at all.
- **Not in scope of the above:** `FindingsPanel`'s `SeverityFilterPills`
  (see the section above) is a *different* widget with its own
  click-to-filter/click-again-to-clear contract, which is unchanged: no
  hover popup, same rendering, same counting. Deep links reach it only via
  `FindingsPanel`'s `initialSeverity`/`focusNonce`, which drive the very same
  `setSeverityFilter` the pills already own.
- **URL sync for the pills (2026-09-18):** a *user* change of that filter —
  pill click, re-click to clear, or Escape — is mirrored into the address
  bar: `?agent=<run_id>&severity=<SEV>` while a pill is active, `severity`
  removed once it's cleared. Mount/remount (e.g. arriving via a deep link)
  never writes the URL. Runs with no `run_id` (the seeded demo review) have
  no `agent` to pair it with, so their pills leave the URL untouched.

## Accept / Dismiss visual states — `FindingCard`

| State | Accept button | Dismiss button | Title | Top-right tag |
|---|---|---|---|---|
| Untouched | enabled | enabled | normal | none |
| Accepted | **disabled**, blue border | enabled | strikethrough | green, checkmark |
| Dismissed | enabled | **disabled**, blue border | normal | gray, X |

- "Disabled" is the real HTML `disabled` attribute — the matching button is
  unclickable/unfocusable, not just styled. The other button stays live so
  the state can be switched.
- A `pending` in-flight mutation disables **both** buttons regardless of
  accepted/dismissed state.
- Card background dims (`opacity: 0.6`) whenever accepted OR dismissed.

## Top-right avatar

- Shows the connected GitHub account's real photo when `GET /workspace`
  returns a `github_user`. Falls back to a neutral `"?"` initial (not a fake
  identity) when no GitHub token is configured, and falls back the same way
  if the image URL 404s/fails to load.
- `Avatar`'s `imageUrl` prop is additive/optional — every other existing
  caller (e.g. PR author avatars in `PRRow.tsx`) renders unchanged.

## Agents editor — the five tabs (`/agents/[id]`)

- The editor's left rail (`AgentsColumn`) lists every agent as an `AgentCard`
  and carries an "Add Agent" menu that opens `CreateAgentModal` (the old
  no-op "Create from scratch → router.push('/agents')" is gone). Selecting a
  card keeps the current `?tab=` when it navigates.
- `AgentCard` renders a stats line — `{runs} runs · {score}% · {avg} avg` —
  **only when repo-scoped `stats` are provided** (`useAgentCardStats(repoId)`,
  where `repoId` comes from `useActiveRepo()`). The score is coloured with the
  CircularScore thresholds (≥75 ok / ≥50 warn / else crit), cost via
  `formatCost`; a `null` score/cost renders `—`, and `0 runs` shows for an
  agent with no runs. Cards on `/agents` and in the editor rail share this.
- Tabs are `Config · Skills · Evals · Stats · CI` (`?tab=` deep-links each).
  `ConfigTab` stays mounted (hidden) while another tab is active so unsaved
  edits survive a tab switch. Evals and CI are deterministic placeholders.
- **ConfigTab Cancel:** the Cancel button appears only while the form is dirty
  (any field diverges from the loaded agent), reverts every field to that
  baseline on click with no server call, and disappears again once clean.
- **SkillsTab:** drag-to-reorder (`@dnd-kit`) + a per-skill enabled checkbox
  and type badge; the header shows `{enabled} of {total} enabled`. Reordering
  and toggling autosave optimistically via `useSetAgentSkills` (rollback +
  error toast on failure). Dragging is disabled while a filter is active (the
  visible list is a subset, so a drop index would be ambiguous) — the reorder
  hint swaps for "Clear the filter to reorder skills."
  Pressing **Escape** in the filter input clears a non-empty filter (and
  re-enables dragging); with an already-empty filter the key is not swallowed,
  so other Escape handlers still fire.
- **StatsTab:** repo-scoped to `useActiveRepo()`. Shows "Select a repo…" with
  no active repo, "No data yet" when the agent has no runs in the repo, else
  KPI tiles (Total runs / Avg cost / Avg duration / Avg score with a score
  sparkline), a signed+coloured cost trend (increase red, decrease green),
  Most-used skills bars, a stacked findings-by-severity chart (recharts),
  a findings-by-category donut (each category's **share of all findings** as
  whole percents that always total exactly 100%, via largest-remainder
  rounding in `StatsTab/helpers.ts` `toPercentages`), and a run-history table. "View trace" opens
  the shared `components/run-trace-drawer` and is disabled ("No trace") while
  `has_trace` is false.
- **StatsTab run history** columns are When · PR · Tokens · Cost · Findings ·
  Source · Trace. The PR cell links to `/repos/{activeRepoId}/pulls/{number}`
  (the stats are already repo-scoped, so the active repo is the right one);
  Source renders `agent_runs.source` as a badge, amber for `ci` and muted for
  `local`. Findings-by-severity shows the no-data state when all six weeks are
  zero, and **Most-pulled memory is a deliberate placeholder** — memory pulls
  are not recorded per run yet, so it always renders its own no-data line.
- `AgentCard`'s "N skills" is the **enabled** link count, so it agrees with the
  Skills tab header; `useSetAgentSkills` therefore invalidates
  `["agent-card-stats"]` and `["agent-stats"]` as well as its own query.

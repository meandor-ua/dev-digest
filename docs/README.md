# docs — DevDigest

Deep-dives that span more than one package (design rationale, decisions).
Existing: [`agent-prompts/`](./agent-prompts/README.md).

## Findings by severity (L01 homework)

The "findings by severity" feature turned out to need **three separate
surfaces**, each owned by a different pair of packages, because the grading
rubric it was built against described three distinct interactions:

1. **Severity pills + filter inside the Review-runs accordion** — pure
   `client` work (`FindingsPanel`). Counts are a plain client-side group-by
   over findings the page already has loaded; no `server` involvement.
2. **Read-only hover popover on the PR list + Agent-runs Timeline** — a
   `client` component (`components/findings-by-severity/`) backed by a new
   `server` aggregate: `PrMeta.findings_by_severity`, computed in
   `server/src/modules/pulls/routes.ts` scoped to each PR's **latest
   review only** (mirroring how `score`/`cost_usd` are already scoped).
3. **Accept/Dismiss visual states** — a `client`-only restyle of buttons
   whose underlying persistence (`server`'s `/findings/:id/(accept|dismiss)`)
   already existed and needed no changes.

The two client surfaces deliberately use **different dismissed-findings
rules**: the accordion pills (1) count dismissed findings too, because the
finding cards below them aren't hidden when dismissed — the pill must match
what's actually rendered. The popover (2) excludes dismissed findings,
because it's a preview of *active* work, not a mirror of one specific list.
See `client/specs/README.md` and `server/specs/README.md` for the exact
per-surface contracts.

## Cost badge: all-time sum, not "latest batch"

`PrMeta.cost_usd` changed from "sum of every run in the latest Run
Review/Review-all batch" to "sum of every successful run ever recorded for
the PR" (`server/src/modules/pulls/routes.ts`). This was a deliberate
behavior change, not a bug fix — the previous batch-window reconstruction
(a 5-second `ranAt` proximity heuristic, since no batch id is persisted) is
gone entirely. See `server/specs/README.md` for the exact contract.

## Top-right avatar

The account avatar (`client/src/vendor/ui/shell/Topbar.tsx`) now shows the
real connected GitHub account's photo instead of a hardcoded literal `"you"`.
This spans both packages: `server` gained `GitHubClient.getAuthenticatedUser()`
(`server/src/adapters/github/octokit.ts`) surfaced through the
previously-unused `GET /workspace` endpoint; `client` gained image support on
the shared `Avatar` primitive and a `useWorkspace()` hook. Single-local-user
app (no per-request auth), so this is a simple singleton, not per-PR
authorship.

## Skills Context tab: doc paths, not doc content

A skill's attached project-context docs (`skill_context_docs`) store the
repo-relative **path** of each `specs/`/`docs/`/`insights/` file, never a
copy of its text. Two reasons this is deliberate, not an oversight:

1. **Freshness.** The doc is re-read from the repo's local clone at review
   time (`server/src/modules/reviews/run-executor.ts`, via the
   `ProjectDocsAdapter` port). A skill configured months ago against a doc
   that has since been edited (or renamed, or deleted) automatically picks up
   the latest version — or is silently skipped if it's gone — instead of
   quietly injecting stale text into every future review.
2. **No duplicated storage / no drift.** The repo clone is already the
   source of truth (it's what gets diffed for the review itself); storing a
   second copy of doc content in Postgres would mean two places that could
   disagree, with no mechanism to reconcile them.

The cost of this choice: a doc that isn't in the repo clone (never cloned,
or since renamed/deleted) can't be previewed or injected. The clone's content
is repo-controlled, so each doc is capped at 64 KB. Anything larger is refused
by the preview and skipped (and logged) at review time, instead of blowing the
model's context window. The review-time
reader skips it without failing the run; the Context tab keeps the row as
"not in this repo" so it can be unchecked; the eye preview
(`GET /skills/context/doc`) answers 422 for a path the clone doesn't list. See
`server/specs/README.md`'s "Project context" section for the adapter and
injection contract, and `client/specs/README.md`'s "Skills editor — tabs"
for the Context tab UI.

## Agents editor: five tabs + repo-scoped stats

The Agents editor (`client/src/app/agents/[id]/`) grew from a single Config
form into a five-tab studio (Config · Skills · Evals · Stats · CI) with a
richer left rail. Two rationales worth keeping:

- **Why per-PR-then-mean, and why repo-scoped.** An agent's `avg_score` /
  `avg_cost_usd` (Agents-column cards and the Stats tab) average *per PR first,
  then across PRs*, over only the DONE runs whose PR is in the active repo. A
  PR that gets re-reviewed a dozen times would otherwise dominate a naive mean;
  scoping to the active repo (`useActiveRepo()`, since the agents route has no
  `:repoId`) keeps "how good is this agent *here*" honest. The exact rules live
  once in `server/src/modules/agents/stats.ts` and are mirrored in
  `specs/README.md` "Agent stats".
- **Why linking is binary, not `agent_skills.enabled`.** The Skills tab shows
  every workspace skill — linked ones on top (drag-to-reorder), unlinked ones
  below (checkbox-only, not draggable) — so there's no need to "detach without
  losing position": a skill is either linked (a row exists) or it isn't, and
  `order` alone carries the drag position. A short-lived `enabled` column on
  `agent_skills` (migration `0011_add_agent_skill_enabled.sql`) explored a
  separate per-link toggle but was dropped again
  (`0013_drop_agent_skill_enabled.sql`) before shipping, since the **skill's
  own** `skills.enabled` (global vetted state) already gates prompt assembly
  and usage stats — a globally-disabled skill can stay linked (keeps its
  order, is still draggable) and is flagged with an orange "Disabled" label in
  the Skills tab. `POST /agents/:id/skills` replaces the whole linked set in
  one optimistic call from an ordered `skill_ids` list, and guards workspace
  ownership so an agent can't link another workspace's skill.

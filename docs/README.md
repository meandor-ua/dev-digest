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
- **Why `agent_skills.enabled`.** The Skills tab needs to attach/detach a
  skill without losing its position in the assembled-prompt order, so linking
  and enabling are separate: a new `enabled` column (migration
  `0011_add_agent_skill_enabled.sql`) carries the toggle while `order` carries
  the drag position. `POST /agents/:id/skills` replaces the whole set in one
  optimistic call and guards workspace ownership so an agent can't link another
  workspace's skill.

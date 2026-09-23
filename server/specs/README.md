# specs — server

Specs / acceptance criteria for the `server` package.

## `GET /repos/:id/pulls` — `findings_by_severity`

- Computed from `findings` joined to `reviews` on `reviews.id =
  findings.reviewId`, filtered to `isNull(findings.dismissedAt)`, restricted
  to each PR's latest `kind = 'review'` row (same scope as `score`).
- Response field is `.nullish()`:
  - **Absent** — the PR has no `kind = 'review'` review yet.
  - **Present, all-zero** (`{CRITICAL: 0, WARNING: 0, SUGGESTION: 0}`) — a
    review exists but every finding was dismissed, or it found nothing.
  - **Present, real counts** — otherwise.
- A `kind = 'summary'` review must never shadow a `kind = 'review'` one, even
  if it's newer — findings/score always come from the review-kind row.
- No new LLM call at read time, ever — pure `COUNT`/`filter` over persisted
  rows.
- Covered by `test/pulls-findings.it.test.ts`.

## `GET /repos/:id/pulls` — `cost_usd`

- Sum of `agent_runs.cost_usd` where `status = 'done'`, across **every**
  run ever recorded for the PR (no batch/date window).
- Runs with `cost_usd IS NULL` are skipped, never summed as `$0`.
- `cost_usd` is `undefined` (key omitted from the JSON) when the PR has zero
  `agent_runs` rows at all; `null` when it has rows but none successful/have
  known cost; a number otherwise.
- Covered by `test/reviews.it.test.ts` (multi-batch sum, all-failed → null,
  mixed success/failure → only the successful run's cost counts).

## `GET /agents/stats` · `GET /agents/:id/stats` — agent aggregates

- Both are repo-scoped via a required `repo_id` query param and aggregate over
  the agent's `status = 'done'` runs whose PR is in that repo (the population
  contract in the root `specs/README.md` "Agent stats"). The pure math lives in
  `src/modules/agents/stats.ts`; the DB reads in
  `src/modules/agents/repository.ts`.
- `GET /agents/stats` returns one `AgentCardStats` row per agent in the
  workspace (`skills_count`, `runs`, per-PR-then-mean `avg_score` /
  `avg_cost_usd`, the last two `null` when there are no scored/costed runs).
  `skills_count` counts only links whose **skill** is enabled (a skill's own
  `enabled` flag, not a per-link one — see below), so disabling a skill
  lowers every agent card's number it's linked to.
- `GET /agents/:id/stats` returns the full `AgentRepoStats` (KPIs, `cost_trend`,
  6-week `score_trend` / `findings_by_severity`, `most_used_skills`,
  category donut, and the 5-row `run_history`).
- Read-time only — no LLM call, ever. Covered by `test/agents-stats.test.ts`
  (pure helpers) and `test/agents-stats.it.test.ts` (endpoints + DB).

## `GET` / `POST /agents/:id/skills` — skill links (binary, order-only)

- Linking is binary — a row in `agent_skills` means "linked", full stop.
  There is no per-link `enabled`. The only "enabled" that matters is the
  **skill's own** `skills.enabled` (global vetted state), which gates prompt
  assembly (`run-executor.ts`) and usage-stat counting — a globally-disabled
  skill can still be linked, keeps its order, and is shown as "Disabled" in
  the Skills tab, but contributes no context to reviews and no usage stats.
- `GET` returns the linked skills ordered by `order`, enriched with each
  skill's `name`/`type` (`AgentSkillItem[]`).
- `POST` replaces the whole linked set in one call from `{ skill_ids: [...] }`
  (or `{ skill_id, order }` to link/reorder a single skill), array order
  becoming the new `order`. Skills not in the caller's workspace are rejected
  (ownership guard) so an agent can never link a foreign workspace's skill.
- A duplicate id in `skill_ids` is rejected with **422** before anything is
  written. The delete + re-insert of the set runs in **one transaction**, so a
  failed insert can never leave the agent with its links already deleted.
- Covered by `test/agents-stats.it.test.ts` and the seed assertions in
  `test/seed.it.test.ts`.

## `GET /workspace` — `github_user`
- `{ login, avatar_url } | null` — `null` whenever `container.github()` or
  the subsequent `getAuthenticatedUser()` call fails for any reason (no
  token configured, revoked token, network error), never a thrown 500.
- Covered by `test/workspace.it.test.ts`.

## `/skills` endpoints — SSRF-safe import + vetting

### Overview
Skills are reusable review rubrics/rules that agents can link to. They support
CRUD operations and optional import from remote URLs with strict SSRF guards.

### Security: `POST /skills/import` — SSRF prevention

Importing from user-provided URLs requires multiple layers of validation:

- **HTTPS-only:** `http://` rejected outright.
- **No credentials:** URLs with username/password rejected.
- **Port validation:** only default HTTPS (443) allowed; non-standard ports rejected.
- **Public addresses only, checked at connect time:** the socket's `lookup`
  hook resolves the host and refuses unless *every* address is public, so the
  address that was checked is the address that is dialled (no DNS-rebinding
  window). IP-literal hosts skip `lookup` and are checked up front. Blocked:
  RFC 1918, loopback, CGNAT, link-local/metadata (169.254/16), benchmarking,
  multicast/reserved; IPv6 `::/96`, ULA, link/site-local, multicast, Teredo,
  documentation — and IPv4 embedded in IPv4-mapped (incl. the hex form
  `::ffff:7f00:1` that `new URL()` normalises `[::ffff:127.0.0.1]` to), NAT64
  and 6to4 addresses is judged by the IPv4 rules (`isPublicAddress`,
  `src/adapters/remote-text/index.ts`).
- **Redirect handling:** never auto-followed; up to 3 redirects, each
  re-validated against the same rules (no following to private addresses).
- **Response limits:** 2xx status, `text/*` content-type, max 256 KiB body,
  no binary content (rejects NUL bytes).
- **Timeout:** one 5-second deadline across all hops and the body read
  (not just a socket-idle timeout).

Violations throw `ValidationError` (422) for URL/address issues or
`ExternalServiceError` (502) for network/HTTP failures. Error messages never
echo response bodies.

**Rate-limited:** `POST /skills/import` is capped at 10 requests per minute
per client (the `@fastify/rate-limit` default key is the IP); disabled under test.

### Vetting: non-manual skills always disabled on creation

Any skill with `source != 'manual'` (e.g., `imported_url`, `extracted`,
`community`) is **always** stored with `enabled: false` regardless of the
`enabled` input parameter. This ensures imported skills must be manually
reviewed (edited, linked to agents, tested) before they can influence reviews.
Manual skills respect the `enabled` flag as provided; imported skills can only
be enabled later via `PUT /skills/:id`.

Provenance is **one-way**: `PUT /skills/:id` with `source: "manual"` on a
skill whose current `source` is anything else returns **422**
(`SkillsService.update`). An imported skill can be vetted (enabled), but it can
never be relabelled as hand-written, which would hide its untrusted origin (the
"needs vetting" badge and the untrusted notice both key off `source`). The
client derives `source` from where the form's content came from, never from
the open tab (see `client/specs/README.md`'s `CreateSkillModal` note).

### Input limits
- `name`: 1–200 characters. This also applies to the optional `name` on
  `POST /skills/import`, so an empty string is a 422, not an unnamed skill.
- `description`: 0–1000 characters
- `body`: 0–100,000 characters
- `repo_id` query params (`/skills/:id/context`, `/skills/context/doc`) must
  be UUIDs. A malformed id is a clean 422 at the edge, not a Postgres `22P02` → 500.
- `POST /skills/:id/restore` `version`: a JSON integer ≥ 1 (not coerced).

Violations of these limits return `422 Unprocessable Entity` (Zod validation).

### Versioning is serialised per skill
Create, update and restore each run in one transaction. Update and restore
first lock the skill row (`SELECT … FOR UPDATE`), then compute `version + 1`,
so concurrent body edits get consecutive versions and every one gets its own
snapshot. There is deliberately no `ON CONFLICT DO NOTHING` on
`skill_versions`: a version-PK conflict is a bug and must fail loudly, never
silently drop a snapshot. The newest `skill_versions` row always matches
`skills.body`.

### Endpoint list
- `GET /skills` — list all skills in the workspace (with optional stats)
- `POST /skills` — create a manual skill
- `GET /skills/:id` — fetch one skill
- `PUT /skills/:id` — update metadata or body (bumps version if body changes);
  accepts an optional `message` — the version snapshot's change note, only
  used when `body` actually changes
- `DELETE /skills/:id` — delete a skill and cascade skill-agent links
- `GET /skills/:id/stats` — skill usage stats (agent count, pull frequency, accept rate);
  `accept_rate_pct` (here and on `GET /skills` items) is `null` when the
  skill's linked agents have no findings yet — no signal, never a fabricated 100
- `GET /skills/:id/versions` — version history (immutable snapshots), each
  carrying a nullable `message`
- `POST /skills/:id/restore` — restore a past version snapshot; accepts an
  optional `message`, defaulting to `"Restored from v{n}"`
- `POST /skills/import` — import from a remote HTTPS URL (with vetting)
- `POST /skills/import/preview` — fetch + derive `{ name, body }` from a URL
  **without inserting a skill**; same SSRF guards and rate limit as
  `/skills/import`. Backs the Create-skill modal's URL tab: fetch → preview →
  confirm (confirm goes through `POST /skills`, same as the file-import path),
  closing the earlier gap where a URL import skipped straight to creation.
- `GET /skills/:id/context?repo_id=` — a skill's attached project-context docs
  (`{ available, attached }`); `available` is that repo's browsable doc list
  (see below), `attached` is this skill's ordered path list
- `PUT /skills/:id/context` `{ paths: string[] }` — replaces the attached set;
  array order becomes the persisted `order`, duplicate paths collapse to their
  first position. At most 100 paths of ≤500 chars each (`SKILL_CONTEXT_MAX_DOCS`
  / `SKILL_CONTEXT_PATH_MAX` in `modules/skills/constants.ts`), else 422
- `GET /skills/context/doc?repo_id=&path=` — one doc's raw text (the Context
  tab's eye-preview); `path` must be one `list()` currently returns for that
  repo, or `ValidationError` (422)

Covered by `test/skills.it.test.ts`, `test/remote-text.test.ts`, and
`test/project-docs.test.ts`.

### Project context (Context tab) — paths, not content

A skill's `skill_context_docs` rows (`skill_id, path, order`) store the
**path only**, never the file's content. `server/src/adapters/project-docs`
(`GitProjectDocsAdapter`, behind the module-owned `ProjectDocsAdapter` port in
`src/modules/skills/ports.ts`) walks a repo's local clone for `*.md` files
under `specs/`, `docs/`, `insights/` dirs (our own convention nests these under
`insights/INSIGHTS.md` plus split-out `insights/<topic>.md` files), plus any
standalone `INSIGHTS.md` at any depth (root or per-package, for repos that
still use the flat-file convention), categorizing each as `specs` | `docs` |
`insights`;
`node_modules` and dotdirs (`.git`, …) are skipped, and the walk is capped
(depth 10 / 300 docs) as a backstop; entries are name-sorted so the list
order is stable across filesystems. `read()` re-validates the requested path
against a fresh `list()` before reading — a path not currently listed is
rejected, closing path traversal. Each doc is also capped at **64 KB**
(`MAX_DOC_BYTES`, checked with `stat` before reading): `read()` answers 422
for an oversized doc, and `readMany()` skips it.

At review time (`run-executor.ts`), for each of an agent's **linked and
enabled** skills, `SkillsRepository.listContextPaths` is read (deduped, skill
link order then doc order) and the whole set is read with ONE
`readMany(repo, paths)` call — one clone walk per review, not one per doc;
a path that no longer resolves (renamed/deleted since
the skill attached it) or is over the 64 KB cap is skipped rather than failing
the run, and the run log names every skipped path (`Context: skipped N doc(s)
(missing or over size cap): …`). The
resulting doc text is passed as `specs` to `reviewer-core`'s existing
`## Project context` prompt slot (`reviewer-core/src/prompt.ts`) — unchanged,
since that slot already existed for a later course lesson and was simply
unused by the starter. See root `docs/README.md` for the "paths not content"
rationale.

## `POST /findings/:id/(accept|dismiss)`

Pre-existing, unchanged by this work — documented here because it's a
dependency of the client's Accept/Dismiss visual spec
(`client/specs/README.md`). Setting one action clears the other's timestamp;
covered by `test/reviews.it.test.ts`'s "finding actions: accept, dismiss".

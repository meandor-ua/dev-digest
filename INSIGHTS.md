# Insights — DevDigest

Non-obvious findings and gotchas that span more than one package. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Package-local findings go in `<package>/INSIGHTS.md` instead.

## Tool & Library Notes

- **2026-09-21** — `pnpm typecheck|test|lint` can abort with
  `ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR ... Permission denied` (global
  pnpm 12 tries to reinstall `node_modules/.pnpm` before running the script).
  Call the binaries directly: `./node_modules/.bin/tsc --noEmit [-p
  tsconfig.json]`, `./node_modules/.bin/vitest run`,
  `./node_modules/.bin/eslint .`. Related: files written by a different OS
  user (`sov`, dirs `drwxr-xr-x`) were unwritable by the session user, and
  even `Edit` failed with EACCES. Check `ls -la` ownership first; fix with
  `sudo chown -R <user>:admin <repo>`. Evidence: `client/package.json` /
  `server/package.json` `scripts`.
- **2026-09-18** — On this machine, the global `npm` at `/usr/local/bin/npm`
  is an ancient v5.3.0 that crashes on `npm install`/`npm run` with `node`
  managed via nvm at a much newer version (v26.9.0): `TypeError: cb.apply is
  not a function` inside `graceful-fs/polyfills.js`. Fix: use the
  nvm-bundled npm directly (`~/.nvm/versions/node/<version>/bin/npm`, v11+),
  or use `pnpm` for any package whose lockfile is `pnpm-lock.yaml`
  (`client/`, `server/`) — plain `npm install` in a pnpm-managed directory
  also fails separately (`Cannot read properties of null (reading
  'matches')`, unrelated project-config warnings about `node-linker` etc.).
  Not a project bug — an environment quirk to route around, every time. Bites the
  npm-managed `e2e/` package, run as `cd e2e && npm test` (`scripts/e2e.sh:18`).

- **2026-09-20** — Agent-guide files are `AGENTS.md` (tool-neutral); each
  directory also has a `CLAUDE.md` **symlink** to it (`ln -s AGENTS.md
  CLAUDE.md`, relative) because Claude Code reads only the `CLAUDE.md` name,
  and only per directory — a root-only link would not cover
  `client/`/`server/`/`reviewer-core/`/`e2e/`. Edit `AGENTS.md`, never replace
  the symlink with a copy. On Windows symlinks need `core.symlinks=true` +
  developer mode, else they check out as a text file; fallback is a one-line
  `CLAUDE.md` containing `@AGENTS.md`. `server/clones/**` holds third-party
  repos with their own `CLAUDE.md` (gitignored) — don't rename those.
  Evidence: `ls -la CLAUDE.md */CLAUDE.md` (each `-> AGENTS.md`); no prose
  documents it, so check the links rather than a line.

- **2026-09-20** — The `skip-worktree` rationale for inlining vitest in CI was
  dead and had been copy-pasted into four files (`TESTING.md`,
  `server-unit.yml`, `server-integration.yml`, `e2e-web.yml`): all claimed
  `server/package.json` is `skip-worktree`, but `git ls-files -v | grep '^S'`
  is empty — no file in the repo carries the flag. The inlined
  `pnpm exec vitest run …` is still right, for the simpler reason that
  `server/package.json` has no `test:unit`/`test:integration` scripts.
  Rationale corrected in place this session. Evidence: `TESTING.md:83-87`.

## Codebase Patterns

- **2026-09-22** — `reviewer-core`'s `skills`/`memory`/`specs`/`callers` prompt
  slots (`reviewer-core/CLAUDE.md`: "exist for later course lessons and are
  simply omitted by the starter") work end-to-end exactly as documented the
  first time a caller actually populates one — no `reviewer-core` change was
  needed to wire the Skills Context feature's doc text into `## Project
  context`; the server just had to pass `specs: string[]` into
  `reviewPullRequest(...)`, matching the pre-existing pattern for `skills`
  (`run-executor.ts:198-221`). Confirms these slots are genuinely
  build-ready, not just typed placeholders — worth checking before assuming a
  new "inject X into the prompt" feature needs a `reviewer-core` change.
  Evidence: `reviewer-core/src/prompt.ts:56-60,105-108,125`,
  `server/src/modules/reviews/run-executor.ts` (`buildContextDocs`).

- **2026-09-20** — Locally-authored skills in `.claude/skills/<name>/` use
  frontmatter of **exactly two keys** — `name` (kebab-case, identical to the
  directory) and `description` — with no `version`, `allowed-tools`, or
  `metadata`. A skill's version therefore lives in the SKILL.md body and its
  README, never in frontmatter. Body idiom: rationale paragraph → topical
  `##` sections → tables and fenced templates → a closing `| Don't | Do |`
  table, prose wrapped ~76 cols. Anthropic's own cap is 500 body lines with
  references exactly one level deep from SKILL.md. Evidence:
  `.claude/skills/plan-adversarial-review/SKILL.md:1-4`,
  `.claude/skills/frontend-architecture/SKILL.md:1-6`.

- **2026-09-16** — `docs/README.md` and `specs/README.md` stub files use the
  header convention `# <thing> — <package>` (e.g. `# docs — DevDigest`,
  `# specs — client`) — follow it when adding new doc/spec stubs so headers
  stay consistent across packages. Evidence: `docs/README.md:1`,
  `client/specs/README.md:1`.
- **2026-09-17** — This course repo's lab exercises are built by having the
  teacher develop the FULL feature, then squash-revert `main` back to a
  "starter" state before each lesson. When a feature/column looks entirely
  absent, run `git log --all --oneline -- <path>` before assuming it was
  never built — it may have existed and been deliberately stripped for the
  exercise (e.g. `agent_runs.cost_usd` existed at `0000_init`, was dropped by
  migration `0009`, added back by this session's L01 task 3). Evidence:
  `server/src/db/schema/runs.ts:23`.

- **2026-09-20** — `docker-compose.yml` exists twice (repo root and
  `server/`), identical below their header comments, and **both pin
  `name: devdigest`** — so they
  address the same compose project, container and volume. Running
  `docker compose up -d` from either directory is equivalent; the duplication
  looks like a container-name collision but is not one. Separately,
  `scripts/e2e.sh` does NOT use compose at all — it runs a throwaway Postgres
  on :5433 via `docker run --rm`, so the e2e stack never touches the dev
  volume. Evidence: `docker-compose.yml:7`, `scripts/e2e.sh:91`; check with
  `diff <(sed 1,6d docker-compose.yml) <(sed 1,4d server/docker-compose.yml)`.

- **2026-09-21** — A skill `description` has **two different limits, and
  Claude Code's is not the 1024 one** (`onion-architecture` once drifted to
  1068 chars; trimmed to 978 by cutting only non-triggering prose, keeping the
  `Use when …` clauses and stack tokens). Claude Code truncates `description` +
  `when_to_use` **combined** at **1536 characters**, and does so *silently in
  the skill listing* — the skill still loads, it just loses the trailing text,
  which is exactly where the `Use when …` trigger phrases live. The **1024**
  cap is the claude.ai / Agent Skills packaging validator, and that one is a
  hard reject. Budget to 1024 for portability, but **measure bytes, not
  characters**: this repo's em-dash house style costs 3 bytes per dash, so
  `frontend-architecture` is 944 chars / **946 bytes** and
  `plan-adversarial-review` is 850 / **856**. A description written to "1020
  characters" can land over the byte cap. Keep the description ASCII to make
  the two numbers equal. No tooling checks either limit — `claude plugin
  validate` is syntax-only and `/skill-doctor` reports usage — so the audit
  one-liner must also print `len(d.encode())` and `d.isascii()`. Evidence:
  `.claude/skills/pr-self-review/SKILL.md:3` (853 chars / 853 bytes, ASCII,
  written to this rule).

## What Doesn't Work

- **2026-09-22** — Don't accept a plan implementation because its spec/README
  update says it's done: the implementing session wrote `client/specs/README.md`
  from the *plan* ("stacked Name / Description / Type" Config, Stats redesign)
  while the code kept the old 2-column form and left the Stats tab untouched —
  all gates were green because the old tests still matched the old UI. On
  review, walk each plan bullet against the diff (`git diff --stat` shows an
  untouched file instantly), not against the spec text. Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/StatsTab.tsx`
  (absent from the implementation's diff).

- **2026-09-17** — Don't trust `git log --all` authorship as "the teacher's
  reference solution" without checking the actual committer. This repo's
  history includes commits from OTHER STUDENTS merged into shared
  integration branches (e.g. `93119a5`, authored by a different person than
  the course's own account) before the "revert: restore main to the starter
  state" commit stripped it all back out. A student's commit is exactly as
  fallible as any other implementation attempt — verify claims about "the
  right way to build X" against the actual lesson slides/checklist, not just
  whichever commit `git log` happens to surface first. Evidence: the
  repo's own starter/lesson contract at `README.md:78` (features
  intentionally stripped, one added back per lesson) and the strip commit
  `c6af1e4` ("revert: restore main to the starter state").
- **2026-09-17** — Adding a new skill under `.claude/skills/<name>/SKILL.md`
  does not get it discovered unless it's also added as a row in
  `.claude/skills/README.md`'s Catalog table — nothing enforces this
  automatically. Two locally-authored skills (`engineering-insights`,
  `esbuild-arch-mismatch`) were committed without a catalog row and stayed
  invisible until manually caught; vendored skills are also tracked in
  `skills-lock.json`, but locally-authored ones have no such backstop, so the
  catalog row is their only discoverability path. `.claude/skills/README.md`
  now documents the "catalog row in the same commit as SKILL.md" rule.
  Evidence: `.claude/skills/README.md:25-26` (the two catalog rows),
  `.claude/skills/README.md:69-72` (the rule itself).
- **2026-09-18** — Running `./scripts/e2e.sh` while `pnpm dev` is up used to
  break the DEV app with "Cannot reach the DevDigest engine at
  http://localhost:3101" (e.g. Agents → "Could not load agents"). Cause: both
  `next dev` servers shared `client/.next`, and `NEXT_PUBLIC_API_BASE` is
  INLINED into compiled chunks — the hermetic stack's chunks (API :3101) were
  then served by the dev server (API :3001), and :3101 vanished at teardown.
  The API and DB were healthy the whole time (`curl :3001/agents` → 200), so a
  backend check alone misleads; load the page in a real browser to see which
  base URL it calls. Fix: `distDir` is env-driven and the e2e stack uses
  `.next-e2e`. Evidence: `client/next.config.mjs:12`, `scripts/e2e.sh:46`.
- **2026-09-18** — A second Next build dir (`.next-e2e`, see the entry above)
  must be excluded everywhere `.next` is: ESLint otherwise lints the compiled
  output and fails on its `require()` calls (`client/eslint.config.mjs:10`).
  `next dev` also auto-adds `.next-e2e/types/**/*.ts` to `tsconfig.json`'s
  `include` — and REFORMATS the whole file while doing so; committing the
  include line up front (`client/tsconfig.json:33`) means Next finds nothing
  to add and leaves the file alone.

- **2026-09-18** — Name collision: `@devdigest/shared` already exports a
  `PrBrief` contract (`client/src/vendor/shared/contracts/brief.ts:116`) for
  the L05 LLM-generated brief.
  The Overview card is a different, LLM-free, props-only thing and is
  deliberately named `ReviewBriefCard`.
- **2026-09-18** — `docker exec devdigest-postgres psql -U devdigest -d
  devdigest -c '\dt'` lists the app's tables (`agent_runs`, `agents`, …) — the
  container IS the app's DB (`DATABASE_URL=…@localhost:5432/devdigest`). An
  earlier "no relations" reading was never reproduced; don't repeat it. Still prefer the API for app-level
  facts (derived fields like PR score exist only there), but `docker exec` is
  a valid way to inspect raw tables. Evidence: `server/.env:2`.
- **2026-09-18** — Don't trust agent-guide rules as ground truth — count
  before you repeat them. Root and `client/CLAUDE.md` both said "relative
  imports carry `.js` … server, client, reviewer-core all do this", but the
  client does NOT (20 of 432 relative imports; Next's bundler resolves
  extensionless), and the server exempts its `src/db/schema*` barrel. "Every
  component gets a co-located test" was also false (17 of 30 route components
  had none). A one-line `grep -c` per claim settles it; rules now corrected.
  Evidence: `client/CLAUDE.md:26`, `CLAUDE.md:66`, `server/src/db/schema.ts:15`.

- **2026-09-20** — Naive repo-wide `find`/`grep` counts are wrong twice over.
  (a) `server/clones/**` is a gitignored clone of THIS repo, so counting
  `server/` without excluding it double-counts (a 2026-09-20 audit reported
  35 + 17 server tests when the real split was 16 + 11, all in `server/test/`).
  (b) `src/vendor/**` holds 70 of client's `.ts`/`.tsx` files, so
  vendor-inclusive stats overstate local convention. Re-measure rather than
  quoting counts — they drift with every feature. Vendor is do-not-touch, so it is never
  evidence of how code here is written. Always exclude both. Evidence:
  `find server -name '*.test.ts' -not -path '*/clones/*' -not -path '*/node_modules/*'`.

- **2026-09-20** — The two `vendor/shared` copies have no source package or
  re-vendor tooling, and they have **drifted**; the drift is currently
  **inert**. `server/src/vendor/shared` is ahead of the client copy in
  `adapters.ts`, `contracts/eval-ci.ts`, `contracts/trace.ts` (comment-only)
  and `contracts/productionize.ts` (`contracts/knowledge.ts` was re-synced by
  the 2026-09-21 Skills work — edit both copies identically and `diff` them). It doesn't bite today because the client
  imports none of the server-only symbols (`AgentManifest`, `AgentVersion`,
  `CommitFilesPayload`, `getAuthenticatedUser`, `sessionId`) and does **zero
  runtime Zod parsing** of shared schemas — `.parse`/`.safeParse` appear
  nowhere outside `vendor/`, so the contracts are used purely as `z.infer`
  types and `pnpm typecheck` passes clean. The latent trap:
  `PluginAgent.provider` and `ConformanceInput.provider` are
  `['openai','anthropic']` on the client vs `[…,'openrouter']` on the server,
  so the first client code to touch either symbol gets an inexplicable type
  error on `"openrouter"` — even though `Provider` in `knowledge.ts` still has
  all three on both sides. Nothing in CI checks parity. Evidence:
  `diff -r server/src/vendor/shared client/src/vendor/shared`.

- **2026-09-21** — Don't implement the vendor-parity rule as a whole-tree
  `diff -rq server/src/vendor client/src/vendor` gate: it fires on every run,
  so any automated check built on it is a permanent false blocker. Two
  independent reasons. (1) `client/src/vendor/ui` has no server counterpart at
  all, so the trees can never match. (2) The shared subtrees are **already
  divergent** — `diff -rq server/src/vendor/shared client/src/vendor/shared`
  lists them (`shared/adapters.ts` plus several `shared/contracts/*.ts`), the server
  copy being a superset that carries server-only surface (`CommitFilesPayload`,
  `commitFiles`, `findOpenPr`, `getAuthenticatedUser`, `sync`, `diffNameOnly`,
  the `'openrouter'` provider id). The invariant that *is* enforceable is per-file and diff-scoped: if a
  change-set touches one package's `vendor/` path, the mirrored path under the
  other package must be in the same change-set. Pre-existing drift is at most a
  `should-fix` labelled pre-existing, never a blocker on whoever merely touched
  the file. Evidence: `.claude/skills/pr-self-review/routing.md:42-56`.

- **2026-09-21** — A delegated subagent **inherits the parent session's plan
  mode**. An `Agent` spawned to implement an approved plan while plan mode was
  still active refused to write any repo file and produced a second plan file
  instead, reporting success — the parent then has to re-delegate from scratch.
  Call `ExitPlanMode` and get approval *before* delegating implementation work,
  and treat "agent finished but `git status` is clean" as the tell. Evidence:
  this session's two `pr-self-review` delegations, the first producing only
  `~/.claude/plans/…-agent-<id>.md`.

- **2026-09-21** — Applying `onion-architecture`'s R6 ("services depend on
  ports, received by constructor — never the `Container`") literally as a
  `pr-self-review` blocker on a brand-new module is a false-positive trap: R6
  is not the exception in this codebase, it's the rule — `AgentsService`,
  `ReviewsService`, `RepoService` and `RepoIntelService` *all* take
  `constructor(private container: Container)` today (documented as baseline
  violation V5 in `onion-architecture/SKILL.md`'s own appendix), and the
  skill's `enforcement.md` explicitly defers wiring any lint gate for it to a
  future PR. A new module (e.g. `SkillsService`) copying that exact
  established pattern isn't introducing a novel deviation, it's matching
  every sibling service that exists — treat it as `should-fix` (note the rule,
  cite the future migration), not `blocker`, or every `pr-self-review` run on
  server code produces an unfair wall of R6 findings. R5 (Drizzle row types
  leaking into `service.ts`) is a sharper case: it's also worth checking
  whether a *local, same-feature* exemplar already shows the clean pattern
  (here, `agents/helpers.ts:12` keeps `AgentRow` out of `agents/service.ts`
  entirely) before deciding severity — if one exists and the new file skipped
  it, that's stronger grounds for should-fix than "the rule says so" (this
  one was then fixed: mappers moved to `skills/helpers.ts`). Evidence:
  `server/src/modules/skills/service.ts` (constructor) vs
  `server/src/modules/agents/service.ts` (no `Container`-narrowing either, but
  no raw row-type import) and `server/src/modules/agents/helpers.ts:3,12`;
  `.claude/skills/onion-architecture/SKILL.md:244-248` (V2/V5 baseline),
  `.claude/skills/onion-architecture/enforcement.md:8-9` (enforcement
  explicitly deferred).

## Session Notes

### 2026-09-21
- Added the `pr-self-review` skill (`.claude/skills/pr-self-review/`: SKILL.md
  167 lines + `routing.md` + `severity.md`), scope `Local`. It is a
  *dispatcher*, not another reviewer: resolves the change-set (branch vs
  `main` merge-base, unioned with uncommitted work), runs the touched
  packages' own gates first, fans out one subagent per bucket loading the
  matching existing skills, merges to one verdict. Catalog row and the
  `AGENTS.md` do-not-touch `Local` list updated together, as the README
  requires.
- Deliberately **skill-only** — no `.claude/settings.json` hook, no
  `pre-push`. A skill cannot block a process; SKILL.md says so explicitly
  rather than implying enforcement. `verdict.json` shape is kept stable so a
  later hook can read it without changing the skill.
- The severity rubric had to live in the new skill, not in the reviewer
  skills it calls: those are vendored and hash-pinned in `skills-lock.json`,
  so a shared "what counts as blocking" definition has nowhere else to go.
- Implementation was delegated to Sonnet 5; review of its output caught the
  whole-tree vendor-diff false blocker and a tier inconsistency between
  `routing.md` and `severity.md` (both fixed in-session).

### 2026-09-18
- Cross-package L01 follow-up implemented (client + server +
  e2e: new `e2e/specs/11-pr-brief.flow.json`, `05-pr-diff` asserts a real code
  line). Skills used: `engineering-insights` only — `react-best-practices`,
  `react-testing-library`, `fastify-best-practices` were planned but not
  loaded.
- Insight hygiene gap this session: later entries were appended by shell
  without re-invoking the skill, landed at file end (under "What Doesn't
  Work" regardless of kind) and some lacked file:line — fixed additively by
  the superseding notes in each file.
- Agent-instruction audit: root `CLAUDE.md` gained Tech stack / Commands /
  Naming conventions / "Engineering insights (always)" sections; duplicated
  rules removed from root, `reviewer-core/` and `e2e/` CLAUDE.md; false or stale
  claims fixed (`.js` imports, per-component tests, `NEXT_PUBLIC_API_BASE`
  "needed", a `.cursor` symlink that doesn't exist, `reviewer-core/prompt.ts`
  paths, the "raw verdict reaches the UI" note). Left alone (do-not-touch):
  `skills-lock.json` still pins `architecture-patterns` and
  `github-workflow-automation`, whose folders no longer exist.

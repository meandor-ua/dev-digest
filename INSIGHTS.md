# Insights — DevDigest

Non-obvious findings and gotchas that span more than one package. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Package-local findings go in `<package>/INSIGHTS.md` instead.

## Tool & Library Notes

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
  Evidence: `AGENTS.md:119`, `.gitignore:21`.

## Codebase Patterns

- **2026-09-16** — `docs/README.md` and `specs/README.md` stub files use the
  header convention `# <thing> — <package>` (e.g. `# docs — DevDigest`,
  `# specs — client`) — follow it when adding new doc/spec stubs so headers
  stay consistent across packages. Evidence: `docs/README.md:1`,
  `client/specs/README.md:1`.
- **2026-09-17** — `*/src/vendor/shared/contracts/*.ts` (server + client
  copies) have no discoverable local source package or re-vendor tooling in
  this checkout, despite root `CLAUDE.md` describing them as "synced copies —
  edit the source package and re-vendor." In practice both copies must be
  hand-edited identically; verified via `diff` they were kept byte-identical
  (modulo comments) across a real feature. Evidence:
  `server/src/vendor/shared/contracts/trace.ts:1`,
  `server/src/vendor/shared/contracts/platform.ts:1` vs the identical
  `client/` copies (confirmed byte-identical again in this session's own
  `platform.ts` edits — see `client/INSIGHTS.md`/`server/INSIGHTS.md`).
- **2026-09-17** — This course repo's lab exercises are built by having the
  teacher develop the FULL feature, then squash-revert `main` back to a
  "starter" state before each lesson. When a feature/column looks entirely
  absent, run `git log --all --oneline -- <path>` before assuming it was
  never built — it may have existed and been deliberately stripped for the
  exercise (e.g. `agent_runs.cost_usd` existed at `0000_init`, was dropped by
  migration `0009`, added back by this session's L01 task 3). Evidence:
  `server/src/db/schema/runs.ts:23`.

## What Doesn't Work

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
  Evidence: `.claude/skills/README.md:19-20` (the two catalog rows),
  `.claude/skills/README.md:47` (the rule itself).
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

- **2026-09-18** — Don't trust `docker exec devdigest-postgres psql … '\dt'`
  to show this app's data: in this checkout it reported no relations while the
  API on :3001 served full data from `DATABASE_URL` on localhost:5432. Verify
  DB facts via the API (`curl localhost:3001/…`) or `pnpm db:*` from
  `server/`. Evidence: `server/.env:2` (`DATABASE_URL`). (Later corrected —
  see the CORRECTION entry below.)
- **2026-09-18** — Name collision: `@devdigest/shared` already exports a
  `PrBrief` contract (`client/src/vendor/shared/contracts/brief.ts:116`) for
  the L05 LLM-generated brief.
  The Overview card is a different, LLM-free, props-only thing and is
  deliberately named `ReviewBriefCard`.
- **2026-09-18** — CORRECTION to the `docker exec … psql` entry above: re-run
  later the same day, `docker exec devdigest-postgres psql -U devdigest -d
  devdigest -c '\dt'` DID list the app's tables (`agent_runs`, `agents`, …),
  matching `DATABASE_URL=…@localhost:5432/devdigest` (`server/.env:2`). The
  earlier "no relations" reading came from a prior session and was never
  reproduced; the container is the app's DB. Still prefer the API for app-level
  facts (derived fields like PR score exist only there), but `docker exec` is
  a valid way to inspect raw tables. Evidence: `server/.env:2`.
- **2026-09-18** — Exact evidence for the `PrBrief` entry above:
  `client/src/vendor/shared/contracts/brief.ts:116`.
- **2026-09-18** — Don't trust agent-guide rules as ground truth — count
  before you repeat them. Root and `client/CLAUDE.md` both said "relative
  imports carry `.js` … server, client, reviewer-core all do this", but the
  client does NOT (20 of 432 relative imports; Next's bundler resolves
  extensionless), and the server exempts its `src/db/schema*` barrel. "Every
  component gets a co-located test" was also false (17 of 30 route components
  had none). A one-line `grep -c` per claim settles it; rules now corrected.
  Evidence: `client/CLAUDE.md:26`, `CLAUDE.md:66`, `server/src/db/schema.ts:15`.

## Session Notes

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

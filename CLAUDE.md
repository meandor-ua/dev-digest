# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: current state works end to end;
each course lesson adds one feature back (see `README.md`).

## Before answering

Search FIRST — curated, may already answer it — then read code:

- Root-level or cross-package question → root `docs/`, `specs/`, `INSIGHTS.md`.
- Package-specific question → that package's `docs/`, `specs/`, `INSIGHTS.md`.
- Unsure which, or it could be either → check both root and the package's.

## Monorepo structure

Not a real workspace (see Conventions) — four independent packages, each with
its own `package.json`/lockfile/toolchain:

- `client/` (`@devdigest/web`) — the studio: Next.js 15 UI. Import repos,
  browse PRs, run and read AI reviews, author agents.
- `server/` (`@devdigest/api`) — the engine: Fastify 5 + Postgres API. Imports
  repos/PRs, indexes a repo, runs the reviewer, persists everything.
- `reviewer-core/` (`@devdigest/reviewer-core`) — the review engine: a pure
  diff → prompt → LLM → grounded-findings library. No DB/GitHub/filesystem;
  consumed by `server` via a tsconfig path alias, not a build.
- `e2e/` (`@devdigest/e2e`) — deterministic browser end-to-end flows against
  the seeded demo data, via `agent-browser` (no Playwright, no LLM).

## Tech stack

All packages: TypeScript (ESM), eslint; vitest for tests (e2e has its own `tsx` runner).

| Package | Language / framework | Key libraries |
|---|---|---|
| `client/` | TypeScript, Next.js 15 (App Router), React 19 | TanStack Query, `next-intl`, `recharts`, `mermaid`, `react-markdown`; vendored `@devdigest/ui` + `@devdigest/shared` (Zod) |
| `server/` | TypeScript, Fastify 5, Postgres 16 + pgvector (Docker) | Drizzle ORM, `postgres`, `fastify-type-provider-zod`, `fastify-sse-v2`, `@fastify/helmet` / `rate-limit` / `cors`; testcontainers for integration tests |
| `reviewer-core/` | TypeScript library (no runtime of its own) | Zod contracts; one injected `LLMProvider` — no DB/GitHub/filesystem |
| `e2e/` | TypeScript runner (`tsx`) | Vercel `agent-browser` (Rust + CDP) — JSON flows, no Playwright, no LLM |

Package managers: `pnpm` for `client/` and `server/`, `npm` for
`reviewer-core/` and `e2e/`.

## Commands

Run the project:

```sh
./scripts/dev.sh              # Postgres (docker compose) + migrate + seed + API :3001 + web :3000
# or by hand:
docker compose up -d
cd server && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev   # API :3001
cd client && pnpm install && pnpm dev                                       # web :3000
```

Check (tests / typecheck / lint), per package:

| Package | Test | Typecheck | Lint |
|---|---|---|---|
| `client/` | `pnpm test` | `pnpm typecheck` | `pnpm lint` |
| `server/` | `pnpm test` (unit + `*.it.test.ts`, needs Docker; unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`) | `pnpm typecheck` | `pnpm lint` |
| `reviewer-core/` | `npm test` | `npm run typecheck` | `npm run lint` |
| `e2e/` | `./scripts/e2e.sh` from the root (hermetic stack) | `npm run typecheck` | `npm run lint` |

## Naming conventions

- Relative imports: `server/`, `reviewer-core/`, `e2e/` write the `.js`
  extension on `.ts` sources (only exception: the `server/src/db/schema*`
  barrel); `client/` imports are extensionless (Next bundler). Match the file
  you're editing.
- client: route-local components in `_components/<Name>/` (PascalCase dir,
  `<Name>.tsx` + `index.ts`, plus `styles.ts` exporting `s` and a co-located
  `<Name>.test.tsx` for new components); cross-route shared components in
  `src/components/<name>/` (kebab-case dir); data hooks `useXxx` in
  `src/lib/hooks/*`.
- server: one folder per module in `src/modules/<name>/` — always
  `routes.ts`, plus `service.ts` / `repository.ts` when the module has
  business logic / DB access, `constants.ts` / `helpers.ts` for the rest;
  DB-backed tests MUST be `*.it.test.ts`, unit tests `*.test.ts`.
- e2e: flows are `specs/NN-name.flow.json`, numbered in run order.
- Docs: `docs/README.md` / `specs/README.md` start with `# <thing> — <package>`;
  insights live in `INSIGHTS.md` (root = repo-wide, `<package>/INSIGHTS.md` =
  package-local).

## Engineering insights (always)

Invoke the `engineering-insights` skill **without being asked** at the end of
every task that fixed a bug, made a non-obvious decision, or hit a gotcha —
before reporting the task done — and again on "wrap up". It writes to the
touched package's `INSIGHTS.md` (root only for repo-wide facts); every entry
carries a date and a `file:line`.

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own `package.json`/lockfile;
  cross-package code (`@devdigest/shared`, `@devdigest/ui`) is shared via
  tsconfig path aliases into `src/vendor/*`, not a published package.

## Do-not-touch

- `server/src/vendor/**`, `client/src/vendor/**` — meant to be synced copies
  of a source package, but no such source package or re-vendor tooling
  exists in this checkout: hand-edit both copies identically and `diff` them
  to confirm they still match.
- `server/src/db/migrations/`, `server/src/db/schema/*` — never hand-edit an
  applied migration; add new tables via a new domain file, don't restructure.
- `skills-lock.json` and the VENDORED skill folders under `.claude/skills/`
  (hash-pinned Claude Code dev tooling, unrelated to the product's own future
  "Skills" feature). Skills with scope `Local` in `.claude/skills/README.md`
  (`engineering-insights`, `esbuild-arch-mismatch`, `plan-adversarial-review`)
  and that README itself are authored here and may be edited.
- Per-package dependency lockfiles — never hand-edit, only regenerate via
  that package's own package manager: `client/pnpm-lock.yaml`,
  `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
  `e2e/package-lock.json`.

## Use when

- Architecture, API map, env vars, CI, troubleshooting → read `README.md`
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`
  · `client/CLAUDE.md` · `reviewer-core/CLAUDE.md` · `e2e/CLAUDE.md`
- Root-level deep-dives / specs / running notes → `docs/` · `specs/` ·
  `INSIGHTS.md`
- Built-in agent prompt templates → `docs/agent-prompts/`

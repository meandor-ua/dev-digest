# server (@devdigest/api)

## Before answering — and before editing

Search `server/docs/`, `server/specs/`, `server/insights/` first.
Before your first edit or command in this package (including when a task
crosses in from another package), read `server/insights/INSIGHTS.md` and any
matching `server/insights/<topic>.md`, and grep `server/insights/` for any tool
you're about to run that isn't listed under Commands — see the root
`AGENTS.md` insights gate.

## Tech stack

Fastify 5 (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`,
`fastify-sse-v2` for streaming run traces), Drizzle ORM, `postgres`,
pgvector. Zod contracts from `src/vendor/shared` (`@devdigest/shared`)
double as route schemas via `fastify-type-provider-zod`. No API keys
required to boot — every secret is optional and settable at runtime.

## Commands

- Run: `pnpm dev` (`:3001`).
- Migrate/seed: `pnpm db:migrate`, `pnpm db:seed`.
- New migration: `pnpm db:generate` (drizzle-kit), then **read the generated
  SQL before running it** — it has emitted statements in an order that can't
  apply (a PK on a column added later) and `NOT NULL` adds with no backfill.
  Known generate quirks are in `insights/INSIGHTS.md` (grep `drizzle-kit`).
- Test: `pnpm test` — unit (`vitest run --exclude '**/*.it.test.ts'`, no
  Docker) + integration (`vitest run .it.test`, real Postgres via
  testcontainers, self-skips without Docker). `pnpm test` runs both.
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint` (eslint).

## Naming conventions

- Relative imports carry the `.js` extension even though the source is `.ts`
  (only exception: the `src/db/schema*` barrel).
- A DB-backed test (imports `test/helpers/pg.ts`) **must** use the
  `*.it.test.ts` suffix or the unit/integration split breaks.
- Modules are registered statically, one import + one `app.register` each,
  in `src/modules/index.ts` — no filesystem autoload.

## Do-not-touch

- `src/db/migrations/`, `src/db/schema/*` — never hand-edit an applied
  migration; add new tables via a new domain file, don't restructure.
- `pnpm-lock.yaml` — never hand-edit, only regenerate via `pnpm install`.
- `src/vendor/**` — see root `AGENTS.md`'s do-not-touch (synced-copy convention).

## Conventions (not obvious from code)

- Adapters (llm, github, git, astgrep, secrets, tokenizer, …) sit behind the
  DI container (`platform/container.ts`) — services depend on interfaces,
  never concrete classes; tests swap in `adapters/mocks.ts`.
- Route validation is schema-first: Zod schemas from `src/vendor/shared`
  double as both request validation and response serialization
  (`fastify-type-provider-zod`) — don't hand-roll `Schema.parse(req.body)`.
- Secrets never come from `AppConfig` — they go through `SecretsProvider`
  (`~/.devdigest/secrets.json`, `process.env` fallback).
- Layer boundaries (which file may import Drizzle, where ports live, service DI)
  → use the `onion-architecture` skill.

## Use when

- Stack, request/DI flow, API map, env vars → read `README.md`
- Indexing pipeline / repo map / blast radius → `src/modules/repo-intel/README.md`
- Deep-dives / specs / running notes → `docs/` · `specs/` · `insights/`
- Cross-package rules (vendoring, migrations, ESM imports) → `../AGENTS.md`

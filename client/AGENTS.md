# client (@devdigest/web)

## Before answering

Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Tech stack

Next.js 15 (App Router), React 19, TanStack Query for all server data,
`next-intl` (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
`react-markdown`. UI primitives are vendored under `src/vendor/ui`
(`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
(`@devdigest/shared`). Talks only to the Fastify API (`server/`), never to
GitHub or Postgres directly.

## Commands

- Run: `pnpm dev` (`:3000`; API defaults to `http://localhost:3001`, override
  with `NEXT_PUBLIC_API_BASE`).
- Test: `pnpm test` (vitest + jsdom, `fetch` mocked — no API/browser needed).
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint` (eslint).

## Naming conventions

- Relative imports are extensionless (`from "./constants"`) — Next's bundler
  resolves them; unlike server/reviewer-core/e2e, don't add `.js`.
- Route-local feature logic lives in `_components/<Name>/` (PascalCase)
  colocated with its route — pages stay thin; anything shared ACROSS routes
  lives in `src/components/<name>/` (kebab-case).
- New components get a co-located `*.test.tsx` (many older route components
  still lack one — don't treat that as the pattern) and a sibling `styles.ts`
  exporting a single `s`.

## Conventions (not obvious from code)

- Types/contracts come from `@devdigest/shared` (Zod, vendored under
  `src/vendor/shared`) — never hand-duplicate them.
- All API access goes through `src/lib/api.ts`; every data hook lives in
  `src/lib/hooks/*`.
- A mutation must invalidate every query its change affects, including
  `["pulls"]` (the PR list's score / FINDINGS / COST) — the global
  `staleTime` is 30s and there is no refetch on window focus.

## Do-not-touch

- `src/vendor/**` — see root `AGENTS.md`'s do-not-touch (synced-copy convention).
- `pnpm-lock.yaml` — never hand-edit, only regenerate via `pnpm install`.

## Use when

- Route map, commands → read `README.md`
- Deep-dives → `client/docs/` · UI/flow specs → `client/specs/` · running
  notes → `client/INSIGHTS.md`
- Real-browser verification of a flow → `../e2e/README.md`
- Cross-package rules (vendoring, ESM imports) → `../AGENTS.md`

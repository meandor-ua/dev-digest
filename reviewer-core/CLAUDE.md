# reviewer-core (@devdigest/reviewer-core)

## Before answering

Search `reviewer-core/docs/`, `reviewer-core/specs/`,
`reviewer-core/INSIGHTS.md` first.

## Tech stack

Pure TypeScript library — no DB, GitHub, or filesystem access. The only side
effect is one call through an injected `LLMProvider`. Ships no compiled
JS: the server imports the TypeScript source directly via a tsconfig path
alias (`@devdigest/reviewer-core` → `../reviewer-core/src`).

## Commands

- Test: `npm test` (vitest) — hermetic units with a stubbed `LLMProvider`, no
  keys, no network.
- Typecheck: `npm run typecheck` — this also doubles as the build (no `dist`
  output is emitted).
- Lint: `npm run lint` (eslint).

## Naming conventions

- Public API is exactly what's exported from `src/index.ts` — nothing else
  is meant to be imported by consumers.
- Relative imports carry the `.js` extension even though the source is `.ts`
  (the server consumes this TS source directly).

## Conventions (not obvious from code)

- The injected `LLMProvider` is the only side effect, which is what makes the
  whole engine mock-testable.
- `skills` / `memory` / `specs` / `callers` prompt slots exist in the API for
  later course lessons and are simply omitted by the starter, not stubbed.

## Do-not-touch

- `INJECTION_GUARD` in `src/prompt.ts` — deliberate trust-boundary design
  (untrusted content is data, never instructions); don't replace with
  keyword/denylist scanning.
- `groundFindings()` must stay the single source of truth for the score —
  never trust the model's self-reported score.
- `package-lock.json` — never hand-edit, only regenerate via `npm install`.

## Use when

- Pipeline, public API → read `README.md`
- Deep-dives / specs / running notes → `docs/` · `specs/` · `INSIGHTS.md`
- How the server actually calls in → `../server/src/modules/reviews/run-executor.ts`
- Cross-package rules → `../CLAUDE.md`

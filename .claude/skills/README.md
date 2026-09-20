# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/`, shared with the team via version control.

## Catalog

Scope is the domain a skill serves — `Backend`, `Frontend`, `Full-stack`,
`Shared`, or `Local`. **`Local` is load-bearing**: it is what marks a skill as
authored here and therefore editable (everything else is vendored — see the
do-not-touch section in the root `AGENTS.md`). The `Local` set is mirrored in
`AGENTS.md`'s do-not-touch list and the two must be updated together.

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Local | Capture non-obvious findings into the right `INSIGHTS.md` during/after a session |
| [esbuild-arch-mismatch](esbuild-arch-mismatch/SKILL.md) | Local | Diagnose/work around esbuild native-binary CPU-arch mismatches in this repo |
| [plan-adversarial-review](plan-adversarial-review/SKILL.md) | Local | Independently re-verify a drafted implementation plan against live code, project docs and tests before coding |
| [frontend-architecture](frontend-architecture/SKILL.md) | Local | Decide where every frontend file belongs — tiered structure, component taxonomy, constants, utils vs helpers, UI/business-logic layering |
| [onion-architecture](onion-architecture/SKILL.md) | Local | Decide which server layer every file belongs to — inward-only dependencies, ports vs adapters, no Drizzle/rows above the repository, service DI |
| [pr-self-review](pr-self-review/SKILL.md) | Local | Pre-PR dispatcher: resolve the diff, run deterministic gates, fan out to the matching review skills per package, merge into one verdict |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

In this repo only **Skills** are present — `.claude/` contains `skills/` and
nothing else. The other three rows are context for how skills differ, not an
inventory.

## Creating New Skills

Every skill has a `SKILL.md` (required) — frontmatter of exactly `name`
(kebab-case, identical to the directory) and `description`, then the rules.
That is all most of them have: 10 of 14 are `SKILL.md`-only.

Beyond that, two patterns are in use, both fine — pick by size:

- **Companion files** — `examples.md` (good/bad code) and `references.md`
  (sources and rationale), as `frontend-architecture`, `react-best-practices`,
  `mermaid-diagram` and `security` do.
- **Flat topic files** — one `.md` per topic beside `SKILL.md`, which becomes
  a table of contents pointing at them. `next-best-practices` does this with
  19 of them.

Keep `SKILL.md` under 500 lines and keep every reference exactly one level
deep from it, so a file is never reached through another file.

A skill isn't done until it's in the **Catalog** table above — add a row
(scope `Local` for one authored in this repo, or the matching domain scope
for a vendored one) in the same commit that adds `SKILL.md`. Vendored skills
also get an entry in `skills-lock.json`; skills authored locally (like
`engineering-insights`) don't and rely on the catalog row alone for
discoverability.

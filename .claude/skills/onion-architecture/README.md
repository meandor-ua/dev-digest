# Onion Architecture — skill

**Version 1.0.0**

A Claude Code Skill that answers one question mechanically for the `server/`
package (`@devdigest/api`): **which layer does this code belong to, and what is
it allowed to import?** It covers the TypeScript (ESM) + Fastify 5 +
Postgres/pgvector + Drizzle + Zod backend — where use cases, SQL, ports,
handlers, and domain rules each live, and the single rule (dependencies point
inward only) that keeps them apart.

It is deliberately narrow. Performance is out of scope entirely, and Fastify
mechanics, Drizzle syntax, Postgres schema design, Zod authoring, and TypeScript
type-level details are delegated to the skills that already own them.

## The five questions

| Question | Short answer | Detail |
|---|---|---|
| What are the layers? | Four rings — Presentation and Infrastructure as sibling outer rings around an Application → Domain core, wired by one composition root | [SKILL.md §1, §3](SKILL.md) |
| What may each import? | Inward only; the dependency matrix is the full truth table | [SKILL.md §4](SKILL.md) |
| Where does a new module's code go? | `routes.ts` (Presentation) · `service.ts`/`ports.ts` (Application) · `domain/` (Domain) · `repository.ts`/`adapters/` (Infrastructure) | [SKILL.md §5](SKILL.md) |
| What are the non-negotiables? | Ten iron laws R1–R10 — chiefly: no Drizzle outside Infra, no rows leaving repositories, ports by constructor not `Container` | [SKILL.md §2](SKILL.md) |
| How is a handler shaped, and how is each layer tested? | parse → call → map → status; pure/fake/testcontainers/`inject` per ring | [SKILL.md §6, §7](SKILL.md) |

The rules themselves live in `SKILL.md` and are not restated here — a second
copy would be exactly the duplication the skill argues against.

## Files

| File | For | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | the agent | The rules: deferrals, the one inward-dependency rule, laws R1–R10, layer table, dependency matrix, target module structure, the parse→call→map→status workflow, per-layer testing, a verified `server/` appendix (exemplars + the V1–V10 baseline), and a Don't/Do table |
| [examples.md](examples.md) | both | Four before/after refactors: fat `routes.ts` split; leaking `AgentRow` → domain type; `Container`-injected service → port + in-memory fake; raw `db.transaction` → `UnitOfWork` port |
| [enforcement.md](enforcement.md) | both | dependency-cruiser config (already a repo dep) + an eslint-plugin-boundaries alternative, a 10-point audit checklist, and a strangler migration order |
| README.md | humans | This file |

## How to invoke

- Automatically — the skill fires on server layering questions ("which layer
  does this go in?", "should this be a port?"), new module/route/service/
  repository/adapter creation, a `routes.ts` growing SQL or business logic, a
  Drizzle row about to leave a repository, a service reaching for the whole
  `Container`, adding a new external system, and boundary reviews.
- Explicitly — `/onion-architecture`, or "use the onion-architecture skill".

The appendix in `SKILL.md` grounds every universal rule in this repo's actual
`server/` conventions (`.js` import suffix, `fastify-type-provider-zod`,
`ContainerOverrides`, `*.it.test.ts`, the module-local `RepoIntel` port), and
names the current exemplars *and* the V1–V10 violations with `file:line`
evidence — so the answers it gives here are concrete file paths, not generic
advice.

## Scope boundary

This skill is `server/`-only and answers *where an interface lives and who may
import it*. It does not teach Fastify (`fastify-best-practices`), Drizzle
(`drizzle-orm-patterns`), Postgres schema design (`postgresql-table-design`),
Zod (`zod`), TypeScript internals (`typescript-expert`), or frontend placement
(`frontend-architecture`). Enforcement wiring and the module-by-module migration
it describes are explicitly *future PRs*, not part of using the skill.

## Changelog

### 1.0.0 — initial release

- The four-ring model with Presentation and Infrastructure as siblings around an
  Application → Domain core, and the single inward-dependency rule.
- Ten iron laws (R1–R10) and the full import dependency matrix.
- Target `modules/<name>/` structure with module-owned `ports.ts`.
- The parse → call → map → status handler workflow and per-layer testing table.
- Verified `server/` appendix: exemplars plus the V1–V10 violation baseline with
  `file:line` evidence.
- dependency-cruiser + eslint-plugin-boundaries enforcement design, a 10-point
  audit, and a strangler migration order.

## References

Onion / Clean / Hexagonal canon and the TypeScript-implementation and
enforcement sources behind v1.0.0:

- **Jeffrey Palermo — The Onion Architecture, parts 1–4** ·
  <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/> ·
  <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/> ·
  <https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/> ·
  <http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/> —
  the origin of "all dependencies point toward the centre" and the core-owns-
  the-interfaces rule R1–R7 restate.
- **Herberto Graça — Onion Architecture (Software Architecture Chronicles)** ·
  <https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85>
  — how Onion relates to Ports & Adapters and Clean.
- **Chop Onions Instead of Layers (Methods & Tools)** ·
  <https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php>.
- **Robert C. Martin — The Clean Architecture** ·
  <https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>
  — the Dependency Rule this skill's matrix encodes.
- **Alistair Cockburn — Hexagonal Architecture** ·
  <https://alistair.cockburn.us/hexagonal-architecture/> — the ports/adapters
  vocabulary in R7.
- **Khalil Stemmler — Repository, DTO & Mapper; Value Objects; DDD vs Clean** ·
  <https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/> ·
  <https://khalilstemmler.com/articles/typescript-value-object/> ·
  <https://khalilstemmler.com/articles/software-design-architecture/domain-driven-design-vs-clean-architecture/>
  — the row→domain mapping (R5/R9) and value objects in TypeScript.
- **Remo Jansen — Onion architecture in Node.js with TypeScript** ·
  <https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad>.
- **Fastify + TypeScript + Drizzle starter (DDD-lite)** ·
  <https://github.com/256Taras/fastify-typescript-drizzle-starter-kit> — a
  concrete Fastify/Drizzle layout close to §5.
- **eslint-plugin-boundaries** ·
  <https://github.com/javierbrea/eslint-plugin-boundaries> — the element-types
  config in `enforcement.md`.
- **Avoid cross-module dependencies with dependency-cruiser** ·
  <https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b>
  — the forbidden-rules approach used as the primary enforcement tool (already a
  `server/` devDependency).

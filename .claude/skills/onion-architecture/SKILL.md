---
name: onion-architecture
description: Defines which layer every backend file belongs to in a TypeScript (ESM) + Fastify 5 + Postgres/pgvector + Drizzle + Zod server, and the one import rule that holds those layers apart — dependencies point inward only (Presentation and Infrastructure are sibling outer rings that depend on an Application/Domain core, never on each other). Use when creating a new server module, route, service, repository, port or adapter and deciding where its code and its interface go; when a route.ts is growing SQL or business logic; when a Drizzle row type is about to leave a repository; when a service reaches for the whole Container; when adding a new external system (LLM, GitHub, git, fs, astgrep, depgraph, tokenizer, clock); when reviewing or auditing server boundaries; or on "/onion-architecture". Does not cover Fastify route/plugin mechanics (see fastify-best-practices), Drizzle query syntax (see drizzle-orm-patterns), Postgres schema/index design (see postgresql-table-design), Zod schema authoring (see zod), or TypeScript type-level details (see typescript-expert).
---

# Onion architecture

**v1.0.0**

This skill owns exactly one question for the `server/` package (`@devdigest/api`):
**which layer does this code belong to, and what is it allowed to import?**
Everything here is about the boundaries *between* layers — where a use case,
a SQL query, a port interface, an HTTP handler, and a domain rule each live,
and the single rule that keeps them from bleeding into one another. It assumes
you already know Fastify, Drizzle, and Zod.

Layering is the cheapest architecture decision to get right and the most
expensive to retrofit: every import written across the wrong boundary is a line
that has to change when the boundary is finally enforced. The rules below are
mechanical — an agent should be able to apply them from a file path and an
import list, without taste.

## What this skill does NOT cover

Defer to the skill named; do not re-litigate these here.

| Topic | Owner |
|---|---|
| Fastify routes, plugins, hooks, lifecycle, JSON-schema validation | `fastify-best-practices` |
| Drizzle query/relation/transaction *syntax*, migrations | `drizzle-orm-patterns` |
| Postgres data types, indexing, constraints, schema design | `postgresql-table-design` |
| Zod schema authoring, `safeParse`, `z.infer`, error shaping | `zod` |
| TypeScript type-level programming, branded types, tooling | `typescript-expert` |
| Frontend (`client/`) file placement and layering | `frontend-architecture` |
| Performance — query cost, bundle size, throughput | out of scope entirely |

This section is load-bearing. When one of those topics comes up, name the
owning skill instead of answering; a second opinion on the same rule is the
duplication this skill exists to prevent. This skill answers *where the
interface lives and who may import it* — the owner skills answer *how to write
the thing behind it*.

## 1. The one rule — dependencies point inward only

Draw the server as four rings:

```
        ┌──────────────────────────────────────────┐
        │  PRESENTATION  (routes.ts, presenters)    │   ← Fastify, req/reply, DTOs
        │   ┌──────────────────────────────────┐    │
        │   │  APPLICATION  (service.ts, ports) │    │   ← use cases, port interfaces
        │   │   ┌──────────────────────────┐    │    │
        │   │   │  DOMAIN  (domain/*.ts)    │    │    │   ← pure rules, value objects
        │   │   └──────────────────────────┘    │    │
        │   └──────────────────────────────────┘    │
        │  INFRASTRUCTURE (repository.ts, adapters) │   ← Drizzle, Octokit, git, fs
        └──────────────────────────────────────────┘
     composition root (app.ts, platform/container.ts) wires it all
```

A file may import only **itself and layers closer to the centre**.
Infrastructure and Presentation are *sibling* outer rings: both depend on the
Application/Domain core, and **neither imports the other**. Infrastructure
implements interfaces (**ports**) that the inner layers own and declare.

The requested build order "Domain → Application → Infrastructure →
Presentation" is the *import-permission order from the centre outward*, not a
call chain: Infrastructure is allowed to import the core's ports/types, and
Presentation is allowed to import Application — but that is the only direction
allowed. The **composition root** is the sole exception: it may import every
layer, because its whole job is to wire concrete infrastructure into the ports
the inner layers declared.

Everything else in this skill is a corollary of this one rule.

## 2. The iron laws (R1–R10)

Each is decidable from an import statement or a file path.

- **R1 — Dependencies point inward only.** A layer imports itself and layers
  closer to the centre. Infrastructure and Presentation never import each
  other.
- **R2 — No `drizzle-orm` / `db/*` outside Infrastructure.** Drizzle,
  `../../db/schema.js` (`import * as t`), and `db/client.js` may be imported
  only by `repository*.ts`, `db/`, infra-style platform code (`platform/jobs`),
  adapters, and the composition root. Never by `service.ts`, `domain/`,
  `helpers.ts`, or `routes.ts`.
- **R3 — No `fastify` / `req` / `reply` outside Presentation.** `FastifyInstance`,
  request, and reply objects live in `routes.ts`, presentation helpers, and the
  composition root only. A service that names `req`/`reply` is misfiled.
- **R4 — Domain imports nothing but domain + type-only contracts.** `domain/*.ts`
  may import other domain files and `import type` from `@devdigest/shared`. No
  fastify, no drizzle, no adapters, no `platform/container`.
- **R5 — Repositories never return Drizzle row types.** A `typeof t.x.$inferSelect`
  (or a `db/rows.ts` alias of one) is **private to the repository**. Map it to a
  domain/application type before returning. `RepoRow`-style names never appear in
  a service's or route's signature.
- **R6 — Services depend on ports, received by constructor — never the `Container`.**
  Target signature: `new XService({ repo, github, clock, log })`. The container
  wires them; the service does not reach into it.
- **R7 — Every external system sits behind a port.** LLM, GitHub, git, fs,
  astgrep, depgraph, tokenizer, embedder, code-index, clock, secrets — each is an
  interface owned by an inner layer and implemented in `adapters/`. Inner layers
  import the interface, never the concrete class.
- **R8 — Transactions are opened by Application via a port, implemented in Infra.**
  No raw `db.transaction(...)` in a service or a `_shared` helper; the boundary is
  a `UnitOfWork` / `withTx` port whose implementation lives in Infrastructure.
- **R9 — DTO ≠ domain model ≠ persistence row.** Three shapes, three owners, and
  a mapping at each boundary: Zod DTO (Presentation) ↔ domain/application type ↔
  Drizzle row (Infrastructure). Never let one stand in for another.
- **R10 — One composition root.** Exactly one place (`app.ts` +
  `platform/container.ts`) constructs concrete adapters and wires ports. No other
  file `new`s an adapter or reads `ContainerOverrides`.

Pragmatism clause: a trivial CRUD module may collapse Domain + Application into
`service.ts` (no `domain/` folder yet). The import laws — **R2, R5, R7** above
all — are never negotiable, however small the module.

## 3. Layer definitions — what each ring is and imports

| Layer | Lives in | Job | May import | Must NOT import |
|---|---|---|---|---|
| **Domain** | `modules/<m>/domain/*.ts` | Pure rules, value objects, status/severity/cost derivation | domain, `import type` from `@devdigest/shared` | fastify, drizzle, adapters, `platform/*`, `Container` |
| **Application** | `modules/<m>/service.ts`, `modules/<m>/ports.ts` | Use cases: orchestrate ports, call domain, throw `AppError`s, own tx boundaries | domain, own ports (interfaces), `@devdigest/shared` types, `platform/errors` | drizzle, `db/*`, fastify, concrete adapters, `Container` |
| **Infrastructure** | `modules/<m>/repository*.ts`, `adapters/<family>/*` | Implement ports: Drizzle queries, HTTP/git/fs I/O, row→domain mapping | domain, application ports/types, drizzle, `db/*`, external SDKs | fastify/`req`/`reply`, Presentation |
| **Presentation** | `modules/<m>/routes.ts`, `modules/<m>/presenters.ts` | Fastify plugin: parse → call service → map to DTO → set status; SSE bridges | application services, domain *types*, `@devdigest/shared` schemas, fastify | drizzle, `db/*`, raw SQL |
| **Composition root** | `app.ts`, `platform/container.ts` | Construct adapters, wire ports, register modules, translate errors once | **every** layer | — |

Read every "Must NOT import" cell as a lint rule (see `enforcement.md`).

## 4. Dependency matrix

✓ = allowed to import.

| from \ to | domain | application | infrastructure | presentation |
|---|---|---|---|---|
| **domain** | ✓ | ✗ | ✗ | ✗ |
| **application** | ✓ | ✓ | ✗ (ports only) | ✗ |
| **infrastructure** | ✓ | ✓ (ports/types) | ✓ | ✗ |
| **presentation** | ✓ (types) | ✓ | ✗ | ✓ |
| **composition root** | ✓ | ✓ | ✓ | ✓ |

The two ✗ that people break most often: **application → infrastructure**
(a service importing `repository.ts` concretely or `drizzle-orm`) and
**presentation → infrastructure** (a route running a query). Both are R2/R6
violations; both are mechanically catchable.

## 5. Target module structure

```
src/modules/<name>/
  routes.ts          # PRESENTATION: Fastify plugin, Zod DTO schemas, mapping, status
  presenters.ts      # PRESENTATION (optional): domain → DTO mappers, SSE bridges
  service.ts         # APPLICATION: use cases, orchestrates ports, owns tx boundaries
  ports.ts           # APPLICATION-owned interfaces (repo port, facades, clock…)
  domain/            # DOMAIN: pure rules / value objects / types (no I/O)
  repository.ts      # INFRASTRUCTURE: Drizzle queries + row→domain mapping
  constants.ts       # literals (existing convention)
  helpers.ts         # pure transforms — no drizzle/schema import (existing convention)

src/adapters/<family>/   # INFRASTRUCTURE: implementations of ports (llm, github, git, …)
src/platform/            # composition root + cross-cutting infra (container, config,
                         #   errors, sse, jobs) — the only place that wires concretes
```

Guards:

- **Ports are owned by the layer that needs them.** New ports go in
  `modules/<m>/ports.ts` (application-owned), following the module-local
  `RepoIntel` port precedent (`modules/repo-intel/types.ts:137`). Ports that
  already live in `vendor/shared/adapters.ts` **stay there** (do-not-touch) and
  are treated as a shared kernel; do not move them, and do not add new ones there.
- **Never place by file *kind* alone.** "It's a service, so put the query in it"
  is the failure this structure replaces. Placement is decided by *what a file is
  allowed to import*, not by its suffix.
- **Cross-module access goes through a container-registered facade/port** (as
  `repoIntel`, `agentsRepo` do), never by deep-importing another module's
  `service.ts` / `repository.ts`.

## 6. The workflow — parse → call → map → status

A route handler is four steps and about five lines. Anything longer is leaking a
lower layer upward.

1. **Parse** the request with the module's Zod DTO schema via
   `fastify-type-provider-zod` (declared in `schema`, not hand-rolled
   `Schema.parse(req.body)`).
2. **Call** one application use case (`service.doThing(...)`), passing plain
   values — never `req`/`reply`.
3. **Map** the returned domain/application type to a response DTO (in
   `presenters.ts` if non-trivial; extract SSE/streaming bridges here too).
4. **Status**: return the DTO; let thrown `AppError` subclasses become HTTP codes
   in the single `setErrorHandler` at the composition root.

Errors: Domain and Application throw `NotFoundError` / `ValidationError` /
`AppError` (`platform/errors.ts`); only the Fastify error handler maps them to
HTTP. Never `reply.code(404)` from inside a service.

## 7. Testing per layer

| Layer | How to test |
|---|---|
| **Domain** | Pure unit tests (`*.test.ts`), no fakes, no DB. |
| **Application** | Constructor-inject in-memory fakes of the module's ports; assert orchestration. No `vi.mock` of internals, no patching private fields. |
| **Infrastructure** | `*.it.test.ts` (real Postgres via testcontainers, self-skips without Docker). |
| **Presentation** | `buildApp({ overrides })` + Fastify `inject`; swap adapters through `ContainerOverrides` (`platform/container.ts`). |

The container's `ContainerOverrides` is the sanctioned test seam. If a test has
to patch a service's private `repo` field to inject a fake, that service is
violating R6 — fix the seam (constructor port), not the test.

## 8. See also

- Before/after refactors for these rules: [examples.md](examples.md)
- ESLint / dependency-cruiser config, audit checklist, migration order:
  [enforcement.md](enforcement.md)

## Appendix — applying this to dev-digest's `server/`

Verified facts about this repo (`file:line` as of v1.0.0). The server is roughly
**50 % onion-compliant already**; this skill codifies what works and names what
doesn't. Every count **excludes `src/vendor/**`** (do-not-touch).

**Already good — cite these as exemplars:**

- **Composition root.** `app.ts:67-68` builds one `Container` and
  `app.decorate('container', ...)`; `platform/container.ts:40-54` exposes
  `ContainerOverrides` as the test seam. No `vi.mock` in tests.
- **Thin transport done right.** `modules/repos/`: 2–4-line handlers in
  `routes.ts` → `service.ts` (no drizzle imports) → `repository.ts` (the only DB
  toucher).
- **Best port discipline.** `modules/repo-intel/types.ts:137` declares the
  `RepoIntel` port inside the module.
- **Pure core.** `reviewer-core/` has no DB/GitHub/fs; its `LLMProvider` is
  injected per call — the domain/application core of the review use case, living
  as a separate package.
- **Errors translated once at the edge.** `platform/errors.ts` + the single
  `setErrorHandler` at `app.ts:116`.

**Violations this standard targets (the baseline V-list — audit against these):**

| # | Violation | Evidence |
|---|---|---|
| V1 | Modules with no service/repository — SQL + business logic in `routes.ts` | `pulls/routes.ts:3,6` (402 lines; aggregation `:95-215`), `polling/routes.ts:3-4`, `workspace/routes.ts:2-3`, `settings/routes.ts:3,10` + `settings/feature-models.ts:1,8` |
| V2 | Drizzle row types leak upward | `db/rows.ts:12-16` (`$inferSelect` aliases re-exported), `reviews/service.ts:4` (`AgentRow` in public API), `repos/repository.ts:10`, `reviews/repository.ts:19,34,38` + `reviews/repository/{review,pull}.repo.ts`, `run-executor.ts:58,153`, `diff-loader.ts:30` |
| V3 | "Pure" helper typed on the ORM schema | `repos/helpers.ts:2,44` (`import * as t`, `toRepoDto(row: typeof t.repos.$inferSelect)`) |
| V4 | Data access outside repositories | `_shared/pr-files.ts:18` (the only `db.transaction` in `src/`), `platform/jobs.ts:2-4`, `adapters/auth/local.ts:5` (adapter reads DB and imports `db/seed`) |
| V5 | Service gets the whole `Container` and builds its own repo | `repos/service.ts:36-38`, `reviews/service.ts:33-37`, `repo-intel/service.ts:104` |
| V6 | Adapters bypassing DI (no port) | `adapters/codeindex/extract`, `adapters/astgrep` imported concretely by `repo-intel/service.ts:22,28` |
| V7 | Two port-ownership regimes | contracts-layer (`vendor/shared/adapters.ts`) vs infra-owned (`adapters/depgraph/index.ts:27`, `adapters/tokenizer/index.ts:16`) |
| V8 | Transport plumbing in the route | `reviews/routes.ts:46-92` (hand-rolled SSE/RunBus bridge) + `:32` manual `RunRequest.parse(req.body)` |
| V9 | Prod barrel re-exports mocks | `adapters/index.ts:12` (`export * from './mocks.js'`) |
| V10 | No pure domain layer | `vendor/shared` is DTO/Zod only |

**Constraints (do not violate when applying this skill):**

- `src/vendor/**`, `src/db/schema/*`, applied migrations, and lockfiles are
  do-not-touch (`server/AGENTS.md`). Ports in `vendor/shared/adapters.ts`
  therefore **stay**; new ports go in module-owned `ports.ts`.
- Single-local-user identity (`server/docs/README.md:46`) — don't generalize
  tenancy.
- Relative imports carry the `.js` extension on `.ts` sources (only exception:
  the `db/schema*` barrel). DB-backed tests **must** be `*.it.test.ts`.
- The `server/README.md:31` "Request & DI flow" Mermaid diagram must stay
  consistent with any structural change, or be explicitly superseded.

## Don't / Do

| Don't | Do |
|---|---|
| Import `drizzle-orm` / `db/schema.js` in a `service.ts` or `routes.ts` | Query only in `repository*.ts`; hand the service a port |
| Return `typeof t.x.$inferSelect` (or a `db/rows.ts` alias) from a repository | Map row → domain type inside the repository (`toDomain(row)`) |
| `new XService(container)` and reach into it for repos | `new XService({ repo, github, clock })`; wire in the container |
| `db.transaction(...)` in a service or `_shared` helper | Open the tx through a `UnitOfWork` port implemented in infra |
| `RunRequest.parse(req.body)` inside a handler | Declare the Zod schema in `schema`, let the type provider validate |
| `reply.code(404)` from a service | `throw new NotFoundError(...)`; map once in `setErrorHandler` |
| `new`-up an adapter anywhere but the container, or import `./mocks.js` in prod | Construct concretes only in the composition root; keep mocks test-only |
| Deep-import `../other-module/repository.js` | Go through a container-registered facade/port |

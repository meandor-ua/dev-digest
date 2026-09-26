# Examples — onion-architecture

Before/after pairs for the rules in `SKILL.md`. Each pair changes *which layer
code lives in*, not what it computes. Imports carry the `.js` suffix, matching
`server/`'s ESM convention.

---

## 1. Fat `routes.ts` → routes + service + repository + domain (V1)

**Before** — `modules/pulls/routes.ts`: Drizzle, aggregation, and HTTP in one
402-line file (`:3,6`, aggregation `:95-215`).

```ts
// routes.ts — PRESENTATION doing Infrastructure + Domain + Application work
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const rows = await container.db
    .select().from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, req.params.id), isNull(t.pullRequests.deletedAt)))
    .orderBy(desc(t.pullRequests.number));                       // R2 violation

  // domain rollup, inline in the handler                        // R4 violation
  return rows.map((r) => {
    const status = r.merged ? 'merged' : r.closedAt ? 'closed' : 'open';
    const severity = r.critical > 0 ? 'critical' : r.warnings > 0 ? 'warn' : 'ok';
    return { id: r.id, number: r.number, status, severity };     // row leaks as DTO (R9)
  });
});
```

**After** — one job per layer.

```ts
// domain/pull-status.ts — DOMAIN: pure, testable without a DB or Fastify
export type PullStatus = 'open' | 'merged' | 'closed';
export function deriveStatus(p: { merged: boolean; closedAt: Date | null }): PullStatus {
  return p.merged ? 'merged' : p.closedAt ? 'closed' : 'open';
}
export function rollupSeverity(p: { critical: number; warnings: number }) {
  return p.critical > 0 ? 'critical' : p.warnings > 0 ? 'warn' : 'ok';
}
```

```ts
// ports.ts — APPLICATION owns the interface it needs
import type { Pull } from './domain/pull.js';
export interface PullReadPort {
  listByRepo(repoId: string): Promise<Pull[]>;
}
```

```ts
// repository.ts — INFRASTRUCTURE: the only Drizzle toucher, maps row → domain
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { Db } from '../../db/client.js';
import type { PullReadPort } from './ports.js';
import type { Pull } from './domain/pull.js';
import { deriveStatus, rollupSeverity } from './domain/pull-status.js';

export class PullRepository implements PullReadPort {
  constructor(private db: Db) {}
  async listByRepo(repoId: string): Promise<Pull[]> {
    const rows = await this.db.select().from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), isNull(t.pullRequests.deletedAt)))
      .orderBy(desc(t.pullRequests.number));
    return rows.map(toDomain);                     // row stays private to this file (R5)
  }
}
function toDomain(r: typeof t.pullRequests.$inferSelect): Pull {
  return {
    id: r.id, number: r.number,
    status: deriveStatus(r),
    severity: rollupSeverity({ critical: r.critical, warnings: r.warnings }),
  };
}
```

```ts
// service.ts — APPLICATION: the use case, port injected (R6)
import type { PullReadPort } from './ports.js';
export class PullService {
  constructor(private deps: { pulls: PullReadPort }) {}
  listForRepo(repoId: string) { return this.deps.pulls.listByRepo(repoId); }
}
```

```ts
// routes.ts — PRESENTATION: parse → call → map → status, ~5 lines
app.get('/repos/:id/pulls', { schema: { params: IdParams, response: { 200: PullListDto } } },
  async (req) => service.listForRepo(req.params.id));
```

---

## 2. Leaking `AgentRow` → domain type (V2)

**Before** — a Drizzle row is the service's public return type
(`reviews/service.ts:4`, `db/rows.ts:12`).

```ts
// service.ts
import type { AgentRow } from '../../db/rows.js';   // = typeof t.agents.$inferSelect

async resolveTargets(workspaceId: string, opts): Promise<AgentRow[]> { … }
//                                              ^^^^^^^^^^ persistence shape leaks (R5, R9)
```

**After** — the repository maps to a domain `Agent`; the row never leaves infra.

```ts
// domain/agent.ts — DOMAIN
export interface Agent {
  id: string; name: string; enabled: boolean; model: string;
}
```

```ts
// repository.ts — INFRASTRUCTURE
import type { AgentRow } from '../../db/rows.js';
import type { Agent } from './domain/agent.js';
const toAgent = (r: AgentRow): Agent => ({
  id: r.id, name: r.name, enabled: r.enabled, model: r.model,
});
async listEnabled(workspaceId: string): Promise<Agent[]> {
  return (await this.query(workspaceId)).map(toAgent);
}
```

```ts
// service.ts — APPLICATION now speaks domain, not persistence
async resolveTargets(workspaceId: string, opts): Promise<Agent[]> { … }
```

The DTO the route serializes is a *third* shape derived from `Agent` — never
`AgentRow` (R9).

---

## 3. `Container`-injected service → port-injected + in-memory fake (V5, R6)

**Before** — service grabs the whole container and builds its own repo; the only
way to test it is to patch a private field.

```ts
// service.ts
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);     // R6 violation
  }
}
```

```ts
// a test forced to reach into privates
const svc = new RepoService(container);
(svc as any).repo = fakeRepo;                          // patching private field — smell
```

**After** — narrow ports by constructor; the container wires them.

```ts
// ports.ts — APPLICATION
export interface RepoWritePort {
  add(input: NewRepo): Promise<Repo>;
  listAll(workspaceId: string): Promise<Repo[]>;
}
export interface Clock { now(): Date; }
```

```ts
// service.ts — APPLICATION: depends on interfaces only
export class RepoService {
  constructor(private deps: { repos: RepoWritePort; clock: Clock }) {}
  async add(input: NewRepo) { /* uses this.deps.repos / this.deps.clock */ }
}
```

```ts
// container.ts — COMPOSITION ROOT wires the concretes (the one place that may)
get repoService() {
  return new RepoService({ repos: new RepoRepository(this.db), clock: systemClock });
}
```

```ts
// service.test.ts — APPLICATION test: hand-written in-memory fake, no vi.mock
const repos: RepoWritePort = {
  add: async (r) => ({ id: 'r1', ...r }),
  listAll: async () => [],
};
const svc = new RepoService({ repos, clock: { now: () => new Date('2025-01-01') } });
expect(await svc.add({ url: '…' })).toMatchObject({ id: 'r1' });
```

For a Presentation-level test, keep using the sanctioned seam instead:
`buildApp({ overrides: { github: fakeGitHub } })` + Fastify `inject`.

---

## 4. Raw `db.transaction` in a helper → `UnitOfWork` port (V4, R8)

**Before** — `_shared/pr-files.ts:18` opens a transaction outside any repository,
reachable from routes and services alike.

```ts
// _shared/pr-files.ts — data access with a raw tx, no port
export async function replacePrFiles(db: Db, prId: string, files: PrFileInput[]) {
  await db.transaction(async (tx) => {                 // R8 violation
    await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    await tx.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
  });
}
```

**After** — Application declares a `UnitOfWork` port; Infrastructure implements
it; the repository owns the statements.

```ts
// ports.ts — APPLICATION
export interface PrFilesRepo {
  replaceAll(prId: string, files: PrFileInput[]): Promise<void>;
}
export interface UnitOfWork { run<T>(work: () => Promise<T>): Promise<T>; }
```

```ts
// repository.ts — INFRASTRUCTURE: statements live here
export class PrFilesRepository implements PrFilesRepo {
  constructor(private db: Db) {}
  async replaceAll(prId: string, files: PrFileInput[]) {
    await this.db.transaction(async (tx) => {          // tx opened in infra only
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (files.length) await tx.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
    });
  }
}
```

```ts
// service.ts — APPLICATION calls the port; no Drizzle in sight
async syncPrFiles(prId: string, files: PrFileInput[]) {
  await this.deps.prFiles.replaceAll(prId, files);
}
```

When a use case must span *two* repositories atomically, inject `UnitOfWork` and
wrap the calls in `uow.run(...)`; the single tx still opens in infra.

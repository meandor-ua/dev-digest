import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('seed: demo PR #482 is reviewable (Testcontainers pg)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function files() {
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    return pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
  }

  it('gives all four pr_files real patches covering the lines the seeded findings cite', async () => {
    const rows = await files();
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.patch && r.patch.length).toBeGreaterThan(0);
    const config = rows.find((r) => r.path === 'src/config.ts')!;
    const users = rows.find((r) => r.path === 'src/api/users.ts')!;
    // config.ts hunk starts at new line 9 with 3 context lines → first '+' is line 12
    expect(config.patch).toMatch(/^@@ -9,3 \+9,7 @@/);
    expect(config.patch).toContain('+  stripeSecretKey');
    // users.ts additions start at new line 45 and run through 52
    expect(users.patch).toMatch(/^@@ -43,5 \+43,11 @@/);
  });

  it('a second seed() restores blanked patches (idempotent backfill)', async () => {
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    await pg.handle.db.update(t.prFiles).set({ patch: null }).where(eq(t.prFiles.prId, pr!.id));
    await seed(pg.handle.db);
    const rows = await files();
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.patch && r.patch.length).toBeGreaterThan(0);
  });

  it('seeds demo skills, agent_skills links (mixed enabled) and agent_runs for the Stats tab', async () => {
    const { db } = pg.handle;
    const skills = await db.select().from(t.skills);
    expect(skills.length).toBeGreaterThanOrEqual(6);
    expect(new Set(skills.map((s) => s.type))).toEqual(
      new Set(['rubric', 'convention', 'security', 'custom']),
    );

    const [general] = await db.select().from(t.agents).where(eq(t.agents.name, 'General Reviewer'));
    const links = await db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, general!.id));
    expect(links).toHaveLength(3);
    expect(links.some((l) => !l.enabled)).toBe(true); // at least one disabled link

    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.agentId, general!.id));
    expect(runs.length).toBe(14); // >10 so cost/score trends render
    expect(runs.every((r) => r.status === 'done')).toBe(true);
  });

  it('seeds Test Quality Reviewer with 4 linked skills; the imported one lands unvetted', async () => {
    const { db } = pg.handle;
    const [agent] = await db.select().from(t.agents).where(eq(t.agents.name, 'Test Quality Reviewer'));
    const links = await db
      .select({ name: t.skills.name, source: t.skills.source, skillEnabled: t.skills.enabled, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agent!.id));
    expect(links).toHaveLength(4);
    for (const l of links) expect(l.skillEnabled).toBe(l.source === 'manual');
    expect(links.find((l) => l.source === 'imported_url')?.name).toBe('Test Coverage Nudge');
  });

  it('re-seeding does not duplicate agent_runs (idempotent)', async () => {
    const { db } = pg.handle;
    const before = (await db.select().from(t.agentRuns)).length;
    await seed(db);
    const after = (await db.select().from(t.agentRuns)).length;
    expect(after).toBe(before);
  });
});

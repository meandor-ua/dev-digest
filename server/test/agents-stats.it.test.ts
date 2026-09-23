import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[agents-stats] Docker not available — skipping integration tests.');
}

/**
 * Agent card + repo stats endpoints and the enabled-aware Skills set path.
 * Runs against the seeded demo data (3 agents, 6 skills, demo agent_runs).
 */
d('GET /agents/stats, GET /agents/:id/stats, POST /agents/:id/skills', () => {
  let pg: PgFixture;
  let repoId: string;
  let agents: Record<string, string>;
  let skills: Record<string, string>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
    const agentRows = await pg.handle.db.select().from(t.agents);
    agents = Object.fromEntries(agentRows.map((a) => [a.name, a.id]));
    const skillRows = await pg.handle.db.select().from(t.skills);
    skills = Object.fromEntries(skillRows.map((s) => [s.name, s.id]));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('GET /agents/stats returns one card row per agent, scoped to the repo', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/stats?repo_id=${repoId}` });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{
      agent_id: string;
      skills_count: number;
      runs: number;
      avg_score: number | null;
      avg_cost_usd: number | null;
    }>;
    expect(rows.length).toBe(Object.keys(agents).length);
    const general = rows.find((r) => r.agent_id === agents['General Reviewer'])!;
    expect(general.runs).toBe(14);
    // 3 links seeded; "Repo Naming Conventions" is an unvetted (imported,
    // globally-disabled) skill — the card counts only links whose underlying
    // skill is enabled, mirroring the Skills tab's orange "Disabled" label.
    expect(general.skills_count).toBe(2);
    expect(general.avg_score).not.toBeNull();
    expect(general.avg_cost_usd).not.toBeNull();
    await app.close();
  });

  it('GET /agents/stats requires a valid repo_id', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/stats?repo_id=not-a-uuid` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /agents/:id/stats fills every section for an agent with runs', async () => {
    const app = await makeApp();
    const id = agents['General Reviewer'];
    const res = await app.inject({ method: 'GET', url: `/agents/${id}/stats?repo_id=${repoId}` });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.agent_id).toBe(id);
    expect(s.repo_id).toBe(repoId);
    expect(s.runs).toBe(14);
    expect(s.cost_trend).not.toBeNull(); // >10 runs
    expect(s.score_trend).toHaveLength(6);
    expect(s.findings_by_severity).toHaveLength(6);
    expect(Array.isArray(s.findings_by_category)).toBe(true);
    expect(s.run_history.length).toBe(5);
    // The seed writes run_traces for the newest runs, so "View trace" is
    // reachable in the demo rather than permanently disabled.
    expect(s.run_history.every((r: { has_trace: boolean }) => r.has_trace)).toBe(true);
    expect(s.run_history.every((r: { source: string }) => r.source === 'local')).toBe(true);
    // most-used skills = linked skills whose own `enabled` flag is true, in
    // order (placeholder 100%).
    expect(s.most_used_skills.map((p: { label: string }) => p.label)).toEqual([
      'Bug & Correctness Rubric',
      'Readability Rubric',
    ]);
    await app.close();
  });

  it('a seeded run trace is served by GET /runs/:id/trace (RunTrace-shaped)', async () => {
    const app = await makeApp();
    const id = agents['General Reviewer'];
    const s = (
      await app.inject({ method: 'GET', url: `/agents/${id}/stats?repo_id=${repoId}` })
    ).json();
    const runId = s.run_history[0].run_id;
    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(res.statusCode).toBe(200);
    const trace = res.json();
    expect(trace.config.agent).toBe('General Reviewer');
    expect(trace.config.pr).toBe(482);
    expect(trace.stats.tokens_in).toBeGreaterThan(0);
    expect(trace.log.length).toBeGreaterThan(0);
    await app.close();
  });

  it('stats are repo-scoped: an unrelated repo id yields zeros', async () => {
    const app = await makeApp();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: (await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default')))[0]!.id,
        owner: 'acme',
        name: 'empty-repo',
        fullName: 'acme/empty-repo',
        defaultBranch: 'main',
      })
      .returning();
    const id = agents['General Reviewer'];
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${id}/stats?repo_id=${otherRepo!.id}`,
    });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.runs).toBe(0);
    expect(s.avg_score).toBeNull();
    expect(s.cost_trend).toBeNull();
    await app.close();
  });

  it('GET /agents/:id/stats 404s for an unknown agent', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/agents/${ghost}/stats?repo_id=${repoId}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /agents/:id/skills returns AgentSkillItem[] with name/type in order', async () => {
    const app = await makeApp();
    const id = agents['General Reviewer'];
    const res = await app.inject({ method: 'GET', url: `/agents/${id}/skills` });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ name: string; type: string; order: number }>;
    expect(items.map((i) => i.name)).toEqual([
      'Bug & Correctness Rubric',
      'Readability Rubric',
      'Repo Naming Conventions',
    ]);
    expect(items[0]!.type).toBe('rubric');
    await app.close();
  });

  it('POST /agents/:id/skills (skill_ids form) reorders, persisted on GET', async () => {
    const app = await makeApp();
    const id = agents['Performance Reviewer'];
    const payload = {
      skill_ids: [skills['Payments Domain Notes'], skills['Readability Rubric']],
    };
    const res = await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload });
    expect(res.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json() as Array<{
      name: string;
    }>;
    expect(after.map((i) => i.name)).toEqual(['Payments Domain Notes', 'Readability Rubric']);

    // The card's skills_count follows the underlying skills' own `enabled` flag.
    const cards = (
      await app.inject({ method: 'GET', url: `/agents/stats?repo_id=${repoId}` })
    ).json() as Array<{ agent_id: string; skills_count: number }>;
    expect(cards.find((c) => c.agent_id === id)!.skills_count).toBe(2);
    await app.close();
  });

  it('POST /agents/:id/skills rejects a skill from another workspace (422)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Skill',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();
    const app = await makeApp();
    const id = agents['Security Reviewer'];
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${id}/skills`,
      payload: { skill_ids: [foreignSkill!.id] },
    });
    expect(res.statusCode).toBe(422);
    // The foreign skill must NOT have been linked.
    const links = await db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, id), eq(t.agentSkills.skillId, foreignSkill!.id)));
    expect(links).toHaveLength(0);
    await app.close();
  });

  it('POST /agents/:id/skills rejects duplicate skill_ids (422)', async () => {
    const app = await makeApp();
    const id = agents['Performance Reviewer'];
    const dup = skills['Readability Rubric'];
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${id}/skills`,
      payload: { skill_ids: [dup, dup] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('setSkills rolls back: a failing insert leaves the previous links intact', async () => {
    // Straight at the repository, since the route's Zod guard rejects duplicates
    // first — this is what makes the delete + insert one transaction, not two.
    const repo = new AgentsRepository(pg.handle.db);
    const id = agents['Security Reviewer']!;
    const before = await repo.linkedSkills(id);
    expect(before.length).toBeGreaterThan(0);

    const dup = skills['Lethal Trifecta Guard']!;
    await expect(
      repo.setSkills(id, [{ skillId: dup }, { skillId: dup }]),
    ).rejects.toThrow();

    const after = await repo.linkedSkills(id);
    expect(after.map((l) => l.skill.id)).toEqual(before.map((l) => l.skill.id));
  });

  it('POST /agents/:id/skills rejects duplicate skill_ids (422) and keeps the existing links', async () => {
    const app = await makeApp();
    const id = agents['Performance Reviewer'];
    const before = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json();
    const dup = skills['Readability Rubric'];
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${id}/skills`,
      payload: { skill_ids: [dup, dup] },
    });
    expect(res.statusCode).toBe(422);
    const after = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json();
    expect(after).toEqual(before);
    await app.close();
  });
});

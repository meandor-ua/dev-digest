import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';
import type { RemoteTextFetcher } from '../src/adapters/remote-text/index.js';
import { ValidationError, ExternalServiceError } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

d('Skills CRUD, version snapshotting, restore & stats', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
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

  const createBody = {
    name: 'Test Completeness Rule',
    description: 'Ensure tests cover all error branches',
    type: 'rubric' as const,
    body: '# Rule\nCover all error branches.',
    enabled: true,
  };

  it('creates a skill with version 1 and snapshots it into skill_versions', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.name).toBe('Test Completeness Rule');

    const versionsRes = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      skill_id: skill.id,
      version: 1,
      body: '# Rule\nCover all error branches.',
    });
    await app.close();
  });

  it('updating body bumps version and appends to skill_versions (descending)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# Rule v2\nCover all error branches and boundary conditions.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(2);
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('# Rule v2\nCover all error branches and boundary conditions.');
    expect(versions[1].body).toBe('# Rule\nCover all error branches.');
    await app.close();
  });

  it('updating metadata (name, description, enabled) does NOT bump version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed Rule', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(1);
    expect(updated.json().name).toBe('Renamed Rule');
    expect(updated.json().enabled).toBe(false);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('restores a past version snapshot, bumping the version to next increment', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'v2 body' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    const restoredSkill = restored.json();
    expect(restoredSkill.version).toBe(3);
    expect(restoredSkill.body).toBe('# Rule\nCover all error branches.');

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(3);
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    await app.close();
  });

  it('computes stats including linked agents, pull frequency, and accept rate', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    const statsRes = await app.inject({ method: 'GET', url: `/skills/${created.id}/stats` });
    expect(statsRes.statusCode).toBe(200);
    const stats = statsRes.json();
    expect(stats).toMatchObject({
      agent_count: 0,
      agents: [],
      pull_frequency_pct: 0,
      accept_rate_pct: 100,
      findings_30d: 0,
      findings_by_category: {},
    });
    await app.close();
  });

  it('an empty PUT is a no-op (200, unchanged), not a 500 from an empty UPDATE', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'Noop', type: 'rubric', body: 'b' } })
    ).json();
    const res = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Noop', body: 'b', version: 1 });
    await app.close();
  });

  it('deletes a skill and cascades links', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    const delRes = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    const getRes = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(getRes.statusCode).toBe(404);
    await app.close();
  });

  it('skills are workspace-scoped: cross-tenant access is denied', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      type: 'convention',
      body: 'foreign body',
    });

    const service = new SkillsService({ skillsRepo: repo } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
  });

  // ---- Skill import tests ----
  describe('Skill import from URL', () => {
    it('imports a skill via URL, returns 201, sets enabled=false and source=imported_url', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi.fn().mockResolvedValue({
          text: '# Awesome Rule\nCheck for X.',
          finalUrl: 'https://example.com/skill.md',
        }),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://example.com/skill.md' },
      });

      expect(res.statusCode).toBe(201);
      const skill = res.json();
      expect(skill.name).toBe('Awesome Rule');
      expect(skill.enabled).toBe(false);
      expect(skill.source).toBe('imported_url');
      expect(skill.description).toBe('Imported from https://example.com/skill.md');
      expect(skill.type).toBe('custom');
      await app.close();
    });

    it('clamps an oversized heading/URL to the POST /skills limits, and rejects an oversized body', async () => {
      const importWith = async (text: string, finalUrl: string) => {
        const app = await buildApp({
          config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
          db: pg.handle.db,
          overrides: {
            git: new MockGitClient(),
            github: new MockGitHubClient(),
            remoteText: { fetchText: vi.fn().mockResolvedValue({ text, finalUrl }) },
          },
        });
        const res = await app.inject({ method: 'POST', url: '/skills/import', payload: { url: 'https://example.com/a.md' } });
        await app.close();
        return res;
      };

      const long = await importWith(`# ${'N'.repeat(500)}\nbody`, `https://example.com/${'p'.repeat(2000)}`);
      expect(long.statusCode).toBe(201);
      expect(long.json().name).toHaveLength(200);
      expect(long.json().description).toHaveLength(1000);

      const huge = await importWith(`# Big\n${'x'.repeat(100_001)}`, 'https://example.com/big.md');
      expect(huge.statusCode).toBe(422);
    });

    it('derives name from first markdown heading', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi.fn().mockResolvedValue({
          text: '# My First Heading\nContent here.',
          finalUrl: 'https://example.com/file.md',
        }),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://example.com/file.md' },
      });

      const skill = res.json();
      expect(skill.name).toBe('My First Heading');
      await app.close();
    });

    it('uses URL basename if no heading found', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi.fn().mockResolvedValue({
          text: 'No heading here, just content.',
          finalUrl: 'https://example.com/my-skill.md',
        }),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://example.com/my-skill.md' },
      });

      const skill = res.json();
      expect(skill.name).toBe('my-skill');
      await app.close();
    });

    it('respects explicit name when provided', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi.fn().mockResolvedValue({
          text: '# Heading\nContent.',
          finalUrl: 'https://example.com/file.md',
        }),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://example.com/file.md', name: 'Custom Name' },
      });

      const skill = res.json();
      expect(skill.name).toBe('Custom Name');
      await app.close();
    });

    it('fetcher ValidationError maps to 422', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi.fn().mockRejectedValue(new ValidationError('SSRF blocked: private address')),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://127.0.0.1/' },
      });

      expect(res.statusCode).toBe(422);
      const error = res.json();
      expect(error.error.code).toBe('validation_error');
      await app.close();
    });

    it('fetcher ExternalServiceError maps to 502', async () => {
      const mockFetcher: RemoteTextFetcher = {
        fetchText: vi
          .fn()
          .mockRejectedValue(new ExternalServiceError('DNS lookup failed')),
      };

      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          remoteText: mockFetcher,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { url: 'https://example.com/missing' },
      });

      expect(res.statusCode).toBe(502);
      const error = res.json();
      expect(error.error.code).toBe('external_service_error');
      await app.close();
    });
  });

  describe('Vetting: non-manual source skills always disabled', () => {
    it('POST /skills with source=imported_url and enabled=true stores enabled=false', async () => {
      const app = await makeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Imported Skill',
          body: 'Skill content',
          type: 'rubric',
          source: 'imported_url',
          enabled: true, // Try to enable it
        },
      });

      expect(res.statusCode).toBe(201);
      const skill = res.json();
      expect(skill.enabled).toBe(false); // Should be disabled despite enabled=true
      expect(skill.source).toBe('imported_url');
      await app.close();
    });

    it('POST /skills with source=manual and enabled=true stores enabled=true', async () => {
      const app = await makeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Manual Skill',
          body: 'Skill content',
          type: 'rubric',
          source: 'manual',
          enabled: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const skill = res.json();
      expect(skill.enabled).toBe(true);
      expect(skill.source).toBe('manual');
      await app.close();
    });
  });

  describe('Input validation limits', () => {
    it('POST /skills with body > 100_000 chars returns 422', async () => {
      const app = await makeApp();
      const largeBody = 'a'.repeat(100_001);

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Big Skill',
          body: largeBody,
          type: 'rubric',
        },
      });

      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('POST /skills with name > 200 chars returns 422', async () => {
      const app = await makeApp();
      const longName = 'a'.repeat(201);

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: longName,
          body: 'content',
          type: 'rubric',
        },
      });

      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('POST /skills with description > 1000 chars returns 422', async () => {
      const app = await makeApp();
      const longDesc = 'a'.repeat(1001);

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Skill',
          description: longDesc,
          body: 'content',
          type: 'rubric',
        },
      });

      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('PUT /skills/:id with body > 100_000 chars returns 422', async () => {
      const app = await makeApp();
      const skillId = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json().id as string;

      const largeBody = 'a'.repeat(100_001);
      const res = await app.inject({
        method: 'PUT',
        url: `/skills/${skillId}`,
        payload: { body: largeBody },
      });

      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('PUT /skills/:id with name > 200 chars returns 422', async () => {
      const app = await makeApp();
      const skillId = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json().id as string;

      const longName = 'a'.repeat(201);
      const res = await app.inject({
        method: 'PUT',
        url: `/skills/${skillId}`,
        payload: { name: longName },
      });

      expect(res.statusCode).toBe(422);
      await app.close();
    });
  });
});

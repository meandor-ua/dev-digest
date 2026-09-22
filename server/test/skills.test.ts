import { describe, it, expect, vi } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Skill } from '@devdigest/shared';
import type { SkillsServiceDeps, SkillsStore } from '../src/modules/skills/ports.js';
import { toSkillVersionDto } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

describe('assemblePrompt with Skills', () => {
  it('injects skills under ## Skills / rules section', () => {
    const system = 'You are a code reviewer.';
    const diff = 'diff --git a/test.ts b/test.ts\n+const x = 1;';
    const skills = [
      '# Test Completeness Rubric\nEnsure all error paths are tested.',
      '# Async Flakiness Convention\nAlways await promises in tests.',
    ];

    const result = assemblePrompt({
      system,
      diff,
      skills,
    });

    const userMessage = result.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Skills / rules');
    expect(userMessage).toContain('# Test Completeness Rubric\nEnsure all error paths are tested.');
    expect(userMessage).toContain('# Async Flakiness Convention\nAlways await promises in tests.');
    expect(result.assembly.skills).toContain('Test Completeness Rubric');
  });

  it('omits ## Skills / rules when no skills are provided', () => {
    const result = assemblePrompt({
      system: 'You are a code reviewer.',
      diff: 'diff --git a/test.ts b/test.ts\n+const x = 1;',
      skills: [],
    });

    const userMessage = result.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).not.toContain('## Skills / rules');
    expect(result.assembly.skills).toBeNull();
  });
});

describe('SkillsService unit tests', () => {
  const skill: Skill = {
    id: 'skill-1',
    name: 'Test Skill',
    description: 'A test skill',
    type: 'rubric',
    source: 'manual',
    body: 'Skill body content',
    enabled: true,
    version: 1,
    evidence_files: null,
  };

  /** Plain port fakes — the service takes its dependencies by constructor, no Container. */
  function makeService(skills: Partial<SkillsStore>) {
    const deps: SkillsServiceDeps = {
      skills: skills as SkillsStore,
      repos: { getById: vi.fn() },
      projectDocs: { list: vi.fn(), read: vi.fn(), readMany: vi.fn() },
      remoteText: { fetchText: vi.fn() },
    };
    return new SkillsService(deps);
  }

  it('create delegates to the store', async () => {
    const store: Partial<SkillsStore> = { insert: vi.fn().mockResolvedValue(skill) };
    const service = makeService(store);

    const result = await service.create('ws-1', {
      name: 'Test Skill',
      description: 'A test skill',
      type: 'rubric',
      body: 'Skill body content',
    });

    expect(store.insert).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'Test Skill',
      description: 'A test skill',
      type: 'rubric',
      source: 'manual',
      body: 'Skill body content',
      enabled: undefined,
      evidenceFiles: undefined,
    });
    expect(result).toEqual(skill);
  });

  it('create forces imported skills to start disabled', async () => {
    const store: Partial<SkillsStore> = { insert: vi.fn().mockResolvedValue(skill) };
    await makeService(store).create('ws-1', {
      name: 'x',
      type: 'rubric',
      body: 'x',
      source: 'imported_url',
      enabled: true,
    });
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('update refuses to relabel an imported skill as manual', async () => {
    const store: Partial<SkillsStore> = {
      getById: vi.fn().mockResolvedValue({ ...skill, source: 'imported_url' }),
      update: vi.fn(),
    };
    const service = makeService(store);

    await expect(service.update('ws-1', 'skill-1', { source: 'manual' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe('skills row mappers', () => {
  it('toSkillVersionDto maps a row to the contract with an ISO created_at', () => {
    const dto = toSkillVersionDto({
      skillId: 'skill-1',
      version: 1,
      body: 'Skill body content',
      message: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(dto).toEqual({
      skill_id: 'skill-1',
      version: 1,
      body: 'Skill body content',
      message: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import type { SkillRow, SkillVersionRow } from '../src/db/rows.js';

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
  const mockSkillRow: SkillRow = {
    id: 'skill-1',
    workspaceId: 'ws-1',
    name: 'Test Skill',
    description: 'A test skill',
    type: 'rubric',
    source: 'manual',
    body: 'Skill body content',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date(),
  };

  const mockVersionRow: SkillVersionRow = {
    skillId: 'skill-1',
    version: 1,
    body: 'Skill body content',
    createdAt: new Date(),
  };

  it('create delegates to repository and maps DTO', async () => {
    const mockRepo: Partial<SkillsRepository> = {
      insert: vi.fn().mockResolvedValue(mockSkillRow),
    };

    const container = { skillsRepo: mockRepo as SkillsRepository } as Container;
    const service = new SkillsService(container);

    const result = await service.create('ws-1', {
      name: 'Test Skill',
      description: 'A test skill',
      type: 'rubric',
      body: 'Skill body content',
    });

    expect(mockRepo.insert).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'Test Skill',
      description: 'A test skill',
      type: 'rubric',
      source: 'manual',
      body: 'Skill body content',
      enabled: undefined,
      evidenceFiles: undefined,
    });
    expect(result.id).toBe('skill-1');
    expect(result.version).toBe(1);
  });

  it('listVersions maps rows to ISO created_at strings', async () => {
    const mockRepo: Partial<SkillsRepository> = {
      listVersions: vi.fn().mockResolvedValue([mockVersionRow]),
    };

    const container = { skillsRepo: mockRepo as SkillsRepository } as Container;
    const service = new SkillsService(container);

    const versions = await service.listVersions('ws-1', 'skill-1');
    expect(versions).toHaveLength(1);
    expect(versions![0]).toMatchObject({
      skill_id: 'skill-1',
      version: 1,
      body: 'Skill body content',
    });
    expect(typeof versions![0].created_at).toBe('string');
  });
});

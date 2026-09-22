import { describe, it, expect, vi } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Skill } from '@devdigest/shared';
import type { SkillsServiceDeps, SkillsStore } from '../src/modules/skills/ports.js';
import { toSkillVersionDto, buildImportedMarkdown, stripFrontmatter } from '../src/modules/skills/helpers.js';
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

  function makeServiceWithFetch(text: string, finalUrl = 'https://example.com/rule.md') {
    const store: Partial<SkillsStore> = {
      insert: vi.fn().mockResolvedValue(skill),
      update: vi.fn().mockResolvedValue(skill),
    };
    const deps: SkillsServiceDeps = {
      skills: store as SkillsStore,
      repos: { getById: vi.fn() },
      projectDocs: { list: vi.fn(), read: vi.fn(), readMany: vi.fn() },
      remoteText: { fetchText: vi.fn().mockResolvedValue({ text, finalUrl }) },
    };
    return { service: new SkillsService(deps), store };
  }

  it('previewImportFromUrl prefers the frontmatter description over the fallback', async () => {
    const { service } = makeServiceWithFetch(
      '---\nname: API Contract\ndescription: Flag breaking routes.\n---\n# Rules\nbody',
    );
    const preview = await service.previewImportFromUrl('https://example.com/rule.md');
    expect(preview).toEqual({
      name: 'API Contract',
      description: 'Flag breaking routes.',
      body: '---\nname: API Contract\ndescription: Flag breaking routes.\nexternal_skill_imported_from: https://example.com/rule.md\n---\n# Rules\nbody',
    });
  });

  it('previewImportFromUrl returns an empty description when the source has none', async () => {
    const { service } = makeServiceWithFetch('# Rules\nbody');
    const preview = await service.previewImportFromUrl('https://example.com/rule.md');
    expect(preview.description).toBe('');
    expect(preview.name).toBe('Rules');
  });

  it('importFromUrl falls back to "Imported from <url>" only when the source has no frontmatter description', async () => {
    const { service, store } = makeServiceWithFetch('# Rules\nbody');
    await service.importFromUrl('ws-1', 'https://example.com/rule.md');
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Imported from https://example.com/rule.md' }),
    );
  });

  it('importFromUrl uses the real frontmatter description when present', async () => {
    const { service, store } = makeServiceWithFetch(
      '---\ndescription: Flag breaking routes.\n---\n# Rules\nbody',
    );
    await service.importFromUrl('ws-1', 'https://example.com/rule.md');
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ description: 'Flag breaking routes.' }));
  });

  it('importFromUrl saves the raw fetch (with frontmatter + provenance stamp) as v1, then cuts the header into v2', async () => {
    const { service, store } = makeServiceWithFetch('---\nname: API Contract\n---\n# Rules\nbody');
    await service.importFromUrl('ws-1', 'https://example.com/rule.md');

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '---\nname: API Contract\nexternal_skill_imported_from: https://example.com/rule.md\n---\n# Rules\nbody',
      }),
    );
    expect(store.update).toHaveBeenCalledWith(
      'ws-1',
      skill.id,
      expect.objectContaining({ body: '# Rules\nbody', message: 'Removed imported YAML frontmatter' }),
    );
  });

  it('importFromUrl still creates v2 when the source had no frontmatter of its own, since the provenance stamp always adds one', async () => {
    const { service, store } = makeServiceWithFetch('# Rules\nbody');
    await service.importFromUrl('ws-1', 'https://example.com/rule.md');
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '---\nexternal_skill_imported_from: https://example.com/rule.md\n---\n# Rules\nbody',
      }),
    );
    expect(store.update).toHaveBeenCalledWith(
      'ws-1',
      skill.id,
      expect.objectContaining({ body: '# Rules\nbody' }),
    );
  });
});

describe('buildImportedMarkdown', () => {
  const url = 'https://example.com/skills/api-contract/SKILL.md';

  it('appends the provenance key as the last frontmatter field when frontmatter exists', () => {
    const result = buildImportedMarkdown(
      '---\nname: API Contract\ndescription: Flag breaking routes.\n---\n# Rules\nbody',
      url,
    );
    expect(result).toEqual({
      name: 'API Contract',
      description: 'Flag breaking routes.',
      body: `---\nname: API Contract\ndescription: Flag breaking routes.\nexternal_skill_imported_from: ${url}\n---\n# Rules\nbody`,
    });
  });

  it('creates a new frontmatter block when the source has none', () => {
    const result = buildImportedMarkdown('# Rules\nbody', url);
    expect(result).toEqual({
      name: 'Rules',
      description: '',
      body: `---\nexternal_skill_imported_from: ${url}\n---\n# Rules\nbody`,
    });
  });

  it('updates an existing provenance key in place on re-fetch, instead of duplicating it', () => {
    const result = buildImportedMarkdown(
      `---\nname: API Contract\nexternal_skill_imported_from: https://old.example.com/x.md\n---\n# Rules\nbody`,
      url,
    );
    expect(result.body).toBe(`---\nname: API Contract\nexternal_skill_imported_from: ${url}\n---\n# Rules\nbody`);
  });

  it('falls back to the URL basename when there is no frontmatter name or heading', () => {
    const result = buildImportedMarkdown('just body text, no heading', 'https://example.com/my-rule.md');
    expect(result.name).toBe('my-rule');
  });
});

describe('stripFrontmatter', () => {
  it('cuts a leading frontmatter block and trims the remainder — no stray whitespace left', () => {
    expect(stripFrontmatter('---\nname: x\n---\n\n# Rules\nbody\n')).toBe('# Rules\nbody');
  });

  it('returns the trimmed content unchanged when there is no frontmatter', () => {
    expect(stripFrontmatter('  # Rules\nbody  \n')).toBe('# Rules\nbody');
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

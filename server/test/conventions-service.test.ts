import { describe, it, expect, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FeatureModelChoice, LLMProvider } from '@devdigest/shared';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { ConventionsServiceDeps } from '../src/modules/conventions/ports.js';
import { AppError, ValidationError } from '../src/platform/errors.js';
import { SCAN_IN_PROGRESS_CODE } from '../src/modules/conventions/constants.js';
import { SKILL_DESCRIPTION_MAX } from '../src/modules/skills/constants.js';

const FIXTURE = {
  candidates: [
    {
      rule: 'Always await, never .then()',
      evidence_path: 'src/a.ts',
      evidence_line: 1,
      evidence_snippet: 'const user = await db.users.find(id);',
      occurrences: 1,
      category: 'style',
      confidence: 0.9,
    },
  ],
};

/** An LLM whose structured call resolves only when the test releases it. */
function gatedLlm() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const completeStructured = vi.fn(async () => {
    await gate;
    return { data: FIXTURE, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0 };
  });
  return { llm: { completeStructured } as unknown as LLMProvider, completeStructured, release };
}

async function depsWith(
  llm: LLMProvider,
  models: { override?: FeatureModelChoice; agents?: FeatureModelChoice[] } = {
    agents: [{ provider: 'openrouter', model: 'agent-model' }],
  },
): Promise<ConventionsServiceDeps & { llmFor: ReturnType<typeof vi.fn> }> {
  const clonePath = await mkdtemp(join(tmpdir(), 'conv-svc-'));
  await mkdir(join(clonePath, 'src'), { recursive: true });
  await writeFile(join(clonePath, 'src/a.ts'), 'const user = await db.users.find(id);\n');
  const llmFor = vi.fn(async () => llm);
  return {
    conventions: {
      listByRepo: async () => [],
      listAccepted: async () => [],
      listDecidedRuleTexts: async () => [],
      replacePending: async () => [],
      patch: async () => undefined,
      deleteById: async () => false,
    },
    repos: { getById: async () => ({ name: 'r', fullName: 'o/r', clonePath }) },
    repoIntel: { getConventionSamples: async () => ['src/a.ts'] },
    skills: { findByName: async () => undefined },
    models: {
      override: async () => models.override,
      enabledAgentModels: async () => models.agents ?? [],
      llm: llmFor,
    },
    llmFor,
  };
}

describe('ConventionsService.extract — one scan per repo at a time', () => {
  it('refuses a second scan of the same repo with 409 while the first runs, then allows it again', async () => {
    const { llm, completeStructured, release } = gatedLlm();
    const service = new ConventionsService(await depsWith(llm));

    const first = service.extract('ws', 'repo-1');
    await vi.waitFor(() => expect(completeStructured).toHaveBeenCalledTimes(1));

    const second = service.extract('ws', 'repo-1').catch((e: unknown) => e);
    const err = (await second) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(SCAN_IN_PROGRESS_CODE);
    expect(completeStructured).toHaveBeenCalledTimes(1); // no second paid call

    release();
    await first;
    await expect(service.extract('ws', 'repo-1')).resolves.toMatchObject({ proposed: 1 });
  });

  it('does not block a scan of a different repo', async () => {
    const { llm, completeStructured, release } = gatedLlm();
    const service = new ConventionsService(await depsWith(llm));
    const a = service.extract('ws', 'repo-a');
    const b = service.extract('ws', 'repo-b');
    await vi.waitFor(() => expect(completeStructured).toHaveBeenCalledTimes(2));
    release();
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
  });

  it('releases the guard when a scan fails', async () => {
    const failing = {
      completeStructured: vi.fn().mockRejectedValueOnce(new Error('provider down')).mockResolvedValue({
        data: FIXTURE,
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
      }),
    } as unknown as LLMProvider;
    const service = new ConventionsService(await depsWith(failing));
    await expect(service.extract('ws', 'repo-1')).rejects.toThrow('provider down');
    await expect(service.extract('ws', 'repo-1')).resolves.toMatchObject({ proposed: 1 });
  });
});

describe('ConventionsService.extract — model resolution', () => {
  it('uses the Settings override over the agents’ model', async () => {
    const { llm, completeStructured, release } = gatedLlm();
    release();
    const deps = await depsWith(llm, {
      override: { provider: 'openai', model: 'picked' },
      agents: [{ provider: 'openrouter', model: 'agent-model' }],
    });
    await new ConventionsService(deps).extract('ws', 'repo-1');
    expect(deps.llmFor).toHaveBeenCalledWith('openai');
    expect(completeStructured.mock.calls[0]![0]).toMatchObject({ model: 'picked' });
  });

  it('falls back to the prevalent enabled-agent model when nothing is picked', async () => {
    const { llm, completeStructured, release } = gatedLlm();
    release();
    const deps = await depsWith(llm, { agents: [{ provider: 'openrouter', model: 'agent-model' }] });
    await new ConventionsService(deps).extract('ws', 'repo-1');
    expect(deps.llmFor).toHaveBeenCalledWith('openrouter');
    expect(completeStructured.mock.calls[0]![0]).toMatchObject({ model: 'agent-model' });
  });

  it('422s with guidance when there is neither a picked model nor an enabled agent', async () => {
    const { llm } = gatedLlm();
    const service = new ConventionsService(await depsWith(llm, { agents: [] }));
    const err = await service.extract('ws', 'repo-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as Error).message).toMatch(/Settings → Feature Models/);
  });
});

describe('ConventionsService.draftSkill', () => {
  it('keeps the description within the skills API limit however many repos the skill covers', async () => {
    const { llm } = gatedLlm();
    const deps = await depsWith(llm);
    const manyRepos = Array.from({ length: 200 }, (_, i) => `## some-org/repository-number-${i}\n\nrule`).join('\n\n');
    deps.skills.findByName = async () => ({ id: 'sk-1', body: `# repo-conventions\n\n${manyRepos}` });
    deps.conventions.listAccepted = async () => [
      {
        id: 'c1',
        category: 'style',
        rule: 'Always await',
        rationale: null,
        evidence_path: 'src/a.ts',
        evidence_line: 1,
        evidence_line_end: 1,
        evidence_snippet: 'const user = await db.users.find(id);',
        confidence: 0.9,
        status: 'accepted',
        created_at: new Date().toISOString(),
      },
    ];
    const draft = await new ConventionsService(deps).draftSkill('ws', 'repo-1');
    expect(draft.name).toBe('repo-conventions');
    expect(draft.existing_skill_id).toBe('sk-1');
    expect(draft.description.length).toBeLessThanOrEqual(SKILL_DESCRIPTION_MAX);
    expect(draft.body).toContain('## o/r');
  });
});

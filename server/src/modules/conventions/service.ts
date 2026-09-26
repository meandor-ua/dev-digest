import { z } from 'zod';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionExtractResult,
  type ConventionSkillDraft,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { SKILL_DESCRIPTION_MAX } from '../skills/constants.js';
import type { ConventionsServiceDeps, PatchConvention } from './ports.js';
import {
  buildConventionSkillBody,
  buildSampleText,
  dedupeCandidates,
  listRepoSections,
  pickPrevalentModel,
  readClone,
  truncateFile,
  verifyCandidate,
  type SampledFile,
  type VerifiedCandidate,
} from './helpers.js';
import {
  CANDIDATE_CAP,
  CONFIG_WISHLIST,
  CONVENTIONS_SCHEMA_NAME,
  CONVENTIONS_SKILL_NAME,
  CONVENTIONS_TEMPERATURE,
  MAX_SNIPPET_LINES,
  RANKED_SAMPLE_COUNT,
  SCAN_IN_PROGRESS_CODE,
} from './constants.js';

// Field order matters: the model observes (rule + evidence) before it judges
// (category + confidence) — a category-first schema tends to collapse to one
// category and flat confidence.
const ExtractionCandidate = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_snippet: z.string(),
  occurrences: z.number().int(),
  category: ConventionCategory,
  confidence: z.number().min(0).max(1),
});

const ExtractionSchema = z.object({
  candidates: z.array(ExtractionCandidate).max(CANDIDATE_CAP),
});

export class ConventionsService {
  /** `workspaceId:repoId` of every scan still running in this process. */
  private readonly scanning = new Set<string>();

  constructor(private deps: ConventionsServiceDeps) {}

  private get repo() {
    return this.deps.conventions;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    return this.repo.listByRepo(workspaceId, repoId);
  }

  async patch(
    workspaceId: string,
    id: string,
    patch: PatchConvention,
  ): Promise<ConventionCandidate | undefined> {
    return this.repo.patch(workspaceId, id, patch);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Un-persisted skill draft merged from the repo's accepted conventions. */
  async draftSkill(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) throw new ValidationError('No accepted conventions to build a skill from');
    // One shared skill for every repo: re-drafting updates this repo's section
    // of the existing `repo-conventions` skill instead of creating another one.
    const existing = await this.deps.skills.findByName(workspaceId, CONVENTIONS_SKILL_NAME);
    const body = buildConventionSkillBody(existing?.body ?? null, repo.fullName, accepted);
    const repos = listRepoSections(body);
    return {
      name: CONVENTIONS_SKILL_NAME,
      description: `House conventions extracted from ${repos.length === 1 ? 'repository' : `${repos.length} repositories`}: ${repos.join(', ')}`.slice(0, SKILL_DESCRIPTION_MAX),
      body,
      source_convention_ids: accepted.map((c) => c.id),
      existing_skill_id: existing?.id ?? null,
    };
  }

  /** Settings → Feature Models choice, else the model most enabled agents run on. */
  private async resolveModel(workspaceId: string) {
    const choice =
      (await this.deps.models.override(workspaceId)) ??
      pickPrevalentModel(await this.deps.models.enabledAgentModels(workspaceId));
    if (!choice) {
      throw new ValidationError(
        'No model for conventions: pick one in Settings → Feature Models, or enable an agent',
      );
    }
    return { llm: await this.deps.models.llm(choice.provider), model: choice.model };
  }

  /**
   * SAMPLE (code) → PROPOSE (one structured call) → VERIFY (code, the
   * evidence gate). Replaces only the pending candidates — accepted/rejected
   * rows survive a re-scan untouched.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const key = `${workspaceId}:${repoId}`;
    if (this.scanning.has(key)) {
      throw new AppError(
        SCAN_IN_PROGRESS_CODE,
        'A scan of this repo is still running — its candidates will appear when it finishes',
        409,
      );
    }
    this.scanning.add(key);
    try {
      return await this.runExtract(workspaceId, repoId);
    } finally {
      this.scanning.delete(key);
    }
  }

  private async runExtract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) {
      throw new ValidationError('Clone and index this repo before extracting conventions');
    }

    // SAMPLE — code only, no model call.
    const configFiles = await Promise.all(
      CONFIG_WISHLIST.map(async (path) => ({ path, content: await readClone(repo.clonePath!, path) })),
    );
    const rankedPaths = await this.deps.repoIntel.getConventionSamples(repoId, RANKED_SAMPLE_COUNT);
    const rankedFiles = await Promise.all(
      rankedPaths.map(async (path) => ({ path, content: await readClone(repo.clonePath!, path) })),
    );

    const sampled: SampledFile[] = [...configFiles, ...rankedFiles]
      .filter((f): f is { path: string; content: string } => f.content !== null)
      .map((f) => ({ path: f.path, lines: truncateFile(f.content) }));

    if (sampled.length === 0) {
      throw new ValidationError('Clone and index this repo before extracting conventions');
    }

    const sampleText = buildSampleText(sampled);

    // PROPOSE — one structured call.
    const { llm, model } = await this.resolveModel(workspaceId);
    const systemPrompt = await renderPrompt('conventions.system.md', {
      cap: String(CANDIDATE_CAP),
      maxSnippetLines: String(MAX_SNIPPET_LINES),
    });

    const result = await llm.completeStructured({
      model,
      schema: ExtractionSchema,
      schemaName: CONVENTIONS_SCHEMA_NAME,
      temperature: CONVENTIONS_TEMPERATURE,
      messages: [
        { role: 'system', content: systemPrompt },
        // wrapUntrusted escapes a `</untrusted>` inside a sampled file, so repo
        // content can't close the delimiter and smuggle in instructions.
        { role: 'user', content: wrapUntrusted('repo-sample', sampleText) },
      ],
    });

    const proposed = result.data.candidates;

    // VERIFY — code only, the evidence gate.
    let droppedUngrounded = 0;
    const verified: VerifiedCandidate[] = [];
    for (const c of proposed) {
      const verifiedOne = verifyCandidate(c, sampled);
      if (verifiedOne === null) {
        droppedUngrounded += 1;
      } else {
        verified.push(verifiedOne);
      }
    }

    const decided = await this.repo.listDecidedRuleTexts(workspaceId, repoId);
    const { kept, droppedDuplicate } = dedupeCandidates(verified, decided);

    const candidates = await this.repo.replacePending(workspaceId, repoId, kept);

    return {
      candidates,
      proposed: proposed.length,
      dropped_ungrounded: droppedUngrounded,
      dropped_duplicate: droppedDuplicate,
      sampled_files: sampled.length,
      model: result.model,
      cost_usd: result.costUsd,
    };
  }
}

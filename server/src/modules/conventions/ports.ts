import type {
  ConventionCandidate,
  ConventionStatus,
  FeatureModelChoice,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import type { VerifiedCandidate } from './helpers.js';

export interface PatchConvention {
  rule?: string;
  rationale?: string | null;
  status?: ConventionStatus;
}

/**
 * Convention persistence as the service sees it — returns contract DTOs, never
 * Drizzle rows. Implemented by `ConventionsRepository`.
 */
export interface ConventionsStore {
  listByRepo(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  listAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /** Rule text of every already-decided (accepted or rejected) candidate. */
  listDecidedRuleTexts(workspaceId: string, repoId: string): Promise<string[]>;
  replacePending(
    workspaceId: string,
    repoId: string,
    candidates: VerifiedCandidate[],
  ): Promise<ConventionCandidate[]>;
  patch(workspaceId: string, id: string, patch: PatchConvention): Promise<ConventionCandidate | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
}

/** The repo fields the extractor needs: names for the skill draft, the clone to sample. */
export interface ConventionRepoLookup {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ name: string; fullName: string; clonePath: string | null } | undefined>;
}

/** Ranked file paths to sample from an indexed repo (implemented by repo-intel). */
export interface ConventionSampleSource {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/** Finds the workspace's shared conventions skill by name (implemented by the skills repository). */
export interface ConventionSkillLookup {
  findByName(workspaceId: string, name: string): Promise<{ id: string; body: string } | undefined>;
}

/** Where the conventions model comes from — Settings first, then the workspace's agents. */
export interface ConventionModelSource {
  /** Settings → Feature Models choice for `conventions`, if the workspace picked one. */
  override(workspaceId: string): Promise<FeatureModelChoice | undefined>;
  /** Provider+model of every enabled agent — the runtime default's input. */
  enabledAgentModels(workspaceId: string): Promise<FeatureModelChoice[]>;
  llm(provider: Provider): Promise<LLMProvider>;
}

/** Everything ConventionsService depends on, injected by constructor (onion R6). */
export interface ConventionsServiceDeps {
  conventions: ConventionsStore;
  repos: ConventionRepoLookup;
  repoIntel: ConventionSampleSource;
  skills: ConventionSkillLookup;
  models: ConventionModelSource;
}

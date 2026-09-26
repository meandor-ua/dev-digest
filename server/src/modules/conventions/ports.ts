import type { ConventionCandidate, ConventionStatus, LLMProvider } from '@devdigest/shared';
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

/** Everything ConventionsService depends on, injected by constructor (onion R6). */
export interface ConventionsServiceDeps {
  conventions: ConventionsStore;
  repos: ConventionRepoLookup;
  repoIntel: ConventionSampleSource;
  /** Resolves the workspace's model for the `conventions` feature and a provider to call it with. */
  resolveLlm(workspaceId: string): Promise<{ llm: LLMProvider; model: string }>;
}

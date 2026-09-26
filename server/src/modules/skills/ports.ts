import type {
  ProjectDoc,
  RepoRef,
  Skill,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillWithStats,
} from '@devdigest/shared';

export type { ProjectDoc };

/**
 * Lists / reads markdown project docs (`specs/`, `docs/`, `insights/`) from a
 * repo's local clone. Backs both the Context tab's doc picker (`list`) and the
 * review-time doc reader (`read`) — a skill stores attached doc PATHS only, so
 * content is always re-read at use time and reflects the clone's current HEAD.
 */
export interface ProjectDocsAdapter {
  list(repo: RepoRef): Promise<ProjectDoc[]>;
  /** Rejects any path not currently returned by `list()` (no traversal). */
  read(repo: RepoRef, path: string): Promise<string>;
  /**
   * Review-time batch read: lists once, returns the listed `paths` in input
   * order and silently drops any that are no longer docs in the clone.
   */
  readMany(repo: RepoRef, paths: string[]): Promise<Array<{ path: string; text: string }>>;
}

/** SSRF-safe fetch of a user-supplied URL's text (skill URL import). */
export interface RemoteTextFetcher {
  fetchText(url: string): Promise<{ text: string; finalUrl: string }>;
}

/** The one thing SkillsService needs from the repos module: resolve a repo id to its clone ref. */
export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<RepoRef | undefined>;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  isDangerous?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  isDangerous?: boolean;
  evidenceFiles?: string[] | null;
  /** Change note for the version snapshot — only used when `body` actually changes. */
  message?: string | null;
  /** When true, atomically removes this skill from every agent it's linked to (same transaction as the update). */
  unlinkFromAgents?: boolean;
}

/**
 * Skill persistence as the service sees it — returns contract DTOs, never
 * Drizzle rows. Implemented by `SkillsRepository`.
 */
export interface SkillsStore {
  listWithStats(workspaceId: string): Promise<SkillWithStats[]>;
  getById(workspaceId: string, id: string): Promise<Skill | undefined>;
  insert(values: InsertSkill): Promise<Skill>;
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<Skill | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined>;
  /** Single historical snapshot by version number — versions are append-only, so this is always safe to read outside a lock. */
  getVersion(id: string, version: number): Promise<SkillVersion | undefined>;
  restore(
    workspaceId: string,
    id: string,
    version: number,
    message?: string | null,
    overrides?: { enabled?: boolean; isDangerous?: boolean; unlinkFromAgents?: boolean },
  ): Promise<Skill | undefined>;
  stats(workspaceId: string, id: string): Promise<SkillStats | undefined>;
  listContextPaths(skillId: string): Promise<string[]>;
  setContextPaths(skillId: string, paths: string[]): Promise<string[]>;
}

/** Everything SkillsService depends on, injected by constructor (onion R6). */
export interface SkillsServiceDeps {
  skills: SkillsStore;
  repos: RepoLookup;
  projectDocs: ProjectDocsAdapter;
  remoteText: RemoteTextFetcher;
}

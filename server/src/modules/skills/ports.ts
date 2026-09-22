import type { ProjectDoc, RepoRef } from '@devdigest/shared';

export type { ProjectDoc };

/**
 * Lists / reads markdown project docs (`specs/`, `docs/`, `INSIGHTS.md`) from a
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

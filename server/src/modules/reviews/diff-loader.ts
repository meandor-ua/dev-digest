import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { replacePrFiles } from '../_shared/pr-files.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 *
 * Last resort: fetch the PR's files from GitHub and store them. The PR list
 * imports PRs WITHOUT their patches (only opening a PR's page stores them), and
 * the clone usually lacks a PR branch's head commit — so "Run Review" from the
 * list on a never-opened PR otherwise sees an empty diff.
 */
export interface LoadedDiff {
  diff: UnifiedDiff;
  /** Why the diff is empty (null when it isn't) — shown to the user as the
   *  run's failure reason, so it must name the REAL cause. */
  emptyReason: string | null;
}

export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<LoadedDiff> {
  const ok = (diff: UnifiedDiff): LoadedDiff => ({ diff, emptyReason: null });
  try {
    const diff = await container.git.diff(
      { owner: repoRow.owner, name: repoRow.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return ok(diff);
  } catch {
    /* fall through to pr_files reconstruction */
  }
  const stored = await diffFromPrFiles(repo, pull.id);
  if (stored.files.length > 0) return ok(stored);
  let detail;
  try {
    const gh = await container.github();
    detail = await gh.getPullRequest({ owner: repoRow.owner, name: repoRow.name }, pull.number);
  } catch (err) {
    return {
      diff: stored,
      emptyReason:
        `no file patches are stored for this PR and GitHub could not be reached (${(err as Error).message}) — ` +
        'check the GitHub token in Settings.',
    };
  }
  if (detail.files.length === 0) {
    // Happens when the branch's commits are already on the base branch.
    return {
      diff: stored,
      emptyReason: `GitHub reports that this PR changes no files against \`${pull.base}\` — there is nothing to review.`,
    };
  }
  if (!detail.files.some((f) => f.patch)) {
    return {
      diff: stored,
      emptyReason: `GitHub lists ${detail.files.length} changed file(s) but no text patch for any of them (binary or too large to diff).`,
    };
  }
  await replacePrFiles(container.db, pull.id, detail.files);
  const fetched = await diffFromPrFiles(repo, pull.id);
  return fetched.files.length > 0
    ? ok(fetched)
    : { diff: fetched, emptyReason: "GitHub's patches for this PR could not be parsed into a diff." };
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}

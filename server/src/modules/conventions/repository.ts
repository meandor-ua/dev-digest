import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';
import type { VerifiedCandidate } from './helpers.js';

export interface PatchConvention {
  rule?: string;
  rationale?: string | null;
  status?: ConventionStatus;
}

/** Drizzle-backed store for the `conventions` table (onion R5 — rows in, DTOs out). */
export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(t.conventions.createdAt);
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  /** Rule text of every already-decided (accepted or rejected) candidate — never re-litigated on a re-scan. */
  async listDecidedRuleTexts(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'pending'),
        ),
      );
    return rows.map((r) => r.rule);
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Replaces only the PENDING candidates of a repo with a fresh scan's output —
   * accepted/rejected rows are untouched, so a re-scan never re-litigates a
   * decision already made (criterion 48).
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: VerifiedCandidate[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          candidates.map((c) => ({
            workspaceId,
            repoId,
            category: c.category,
            rule: c.rule,
            evidencePath: c.evidencePath,
            evidenceLine: c.evidenceLine,
            evidenceLineEnd: c.evidenceLineEnd,
            evidenceSnippet: c.evidenceSnippet,
            confidence: c.confidence,
            status: 'pending' as const,
          })),
        )
        .returning();
    });
  }

  async patch(workspaceId: string, id: string, patch: PatchConvention): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}

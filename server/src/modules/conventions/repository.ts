import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type { ConventionCandidate } from '@devdigest/shared';
import type { VerifiedCandidate } from './helpers.js';
import type { ConventionsStore, PatchConvention } from './ports.js';

function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    rationale: row.rationale ?? null,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? null,
    evidence_line_end: row.evidenceLineEnd ?? row.evidenceLine ?? null,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

/** Drizzle-backed store for the `conventions` table (onion R5 — rows in, DTOs out). */
export class ConventionsRepository implements ConventionsStore {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(t.conventions.createdAt);
    return rows.map(toConventionDto);
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
    return rows.map(toConventionDto);
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

  async getById(workspaceId: string, id: string): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row ? toConventionDto(row) : undefined;
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
  ): Promise<ConventionCandidate[]> {
    const rows = await this.db.transaction(async (tx) => {
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
    return rows.map(toConventionDto);
  }

  async patch(
    workspaceId: string,
    id: string,
    patch: PatchConvention,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toConventionDto(row) : undefined;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}

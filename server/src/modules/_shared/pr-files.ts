import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export interface PrFileInput {
  path: string;
  additions: number;
  deletions: number;
  patch?: string | null;
}

/**
 * Replace a PR's stored `pr_files` in ONE transaction. The old
 * delete-then-insert (two statements) left a window with zero rows, and a
 * review loading its diff inside that window reviewed nothing.
 */
export async function replacePrFiles(db: Db, prId: string, files: PrFileInput[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length > 0) {
      await tx.insert(t.prFiles).values(
        files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
  });
}

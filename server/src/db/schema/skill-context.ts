import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { skills } from './skills';
import { repos } from './repos';

/**
 * Project docs (specs/docs/insights markdown) attached to a skill: the skill
 * carries the file PATH only, not its content — the file is re-read from the
 * repo clone at review time (`run-executor.ts`), so it always reflects HEAD.
 * Attachments are per repo: `docs/README.md` picked while viewing repo A must
 * not silently pull repo B's different `docs/README.md` into B's reviews.
 */
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }) }),
);

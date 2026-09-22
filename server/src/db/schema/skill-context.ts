import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { skills } from './skills';

/**
 * Project docs (specs/docs/insights markdown) attached to a skill: the skill
 * carries the file PATH only, not its content — the file is re-read from the
 * repo clone at review time (`run-executor.ts`), so it always reflects HEAD.
 */
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.path] }) }),
);

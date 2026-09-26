import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { dockerAvailable } from './helpers/pg.js';
import { runMigrations } from '../src/db/migrate.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');

/**
 * Migration 0016 rewrites `skill_context_docs` (new NOT NULL `repo_id`, new
 * composite PK). `startPg()` only ever applies it to an EMPTY table, so this
 * test stops at 0015, writes a pre-0016 attachment, then applies the rest —
 * the path every existing install takes.
 */
d('migration 0016 (skill_context_docs.repo_id) on a populated database', () => {
  let container: StartedPostgreSqlContainer;
  let sql: postgres.Sql;
  let partialDir: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    sql = postgres(container.getConnectionUri(), { max: 1 });
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    // A copy of the migrations folder whose journal stops at 0015.
    partialDir = await mkdtemp(join(tmpdir(), 'mig-0015-'));
    await cp(MIGRATIONS_DIR, partialDir, { recursive: true });
    const journalPath = join(partialDir, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((e) => e.idx <= 15);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrate(drizzle(sql), { migrationsFolder: partialDir });
  });

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
    if (partialDir) await rm(partialDir, { recursive: true, force: true });
  });

  it('applies over existing attachments, clears them, and enforces the per-repo key', async () => {
    const [ws] = await sql`INSERT INTO workspaces (name) VALUES ('mig-ws') RETURNING id`;
    const [skill] = await sql`
      INSERT INTO skills (workspace_id, name, description, type, source, body)
      VALUES (${ws!.id}, 'S', 'd', 'rubric', 'manual', 'body') RETURNING id`;
    await sql`INSERT INTO skill_context_docs (skill_id, path, "order") VALUES (${skill!.id}, 'docs/a.md', 0)`;

    await runMigrations(container.getConnectionUri());

    // Unscoped attachments can't be assigned a repo — they're cleared, not guessed.
    expect(await sql`SELECT * FROM skill_context_docs`).toHaveLength(0);

    const [repo] = await sql`
      INSERT INTO repos (workspace_id, owner, name, full_name)
      VALUES (${ws!.id}, 'acme', 'r', 'acme/r') RETURNING id`;
    const [otherRepo] = await sql`
      INSERT INTO repos (workspace_id, owner, name, full_name)
      VALUES (${ws!.id}, 'acme', 'r2', 'acme/r2') RETURNING id`;
    // Same path under two repos is allowed (that's the point of the new key)…
    await sql`INSERT INTO skill_context_docs (skill_id, repo_id, path, "order") VALUES (${skill!.id}, ${repo!.id}, 'docs/a.md', 0)`;
    await sql`INSERT INTO skill_context_docs (skill_id, repo_id, path, "order") VALUES (${skill!.id}, ${otherRepo!.id}, 'docs/a.md', 0)`;
    // …a duplicate within one repo is not, and repo_id is required.
    await expect(
      sql`INSERT INTO skill_context_docs (skill_id, repo_id, path, "order") VALUES (${skill!.id}, ${repo!.id}, 'docs/a.md', 1)`,
    ).rejects.toThrow(/duplicate key/);
    await expect(
      sql`INSERT INTO skill_context_docs (skill_id, path, "order") VALUES (${skill!.id}, 'docs/b.md', 0)`,
    ).rejects.toThrow(/null value in column "repo_id"/);

    // Deleting a repo takes its attachments with it.
    await sql`DELETE FROM repos WHERE id = ${otherRepo!.id}`;
    expect(await sql`SELECT * FROM skill_context_docs`).toHaveLength(1);
  });
});

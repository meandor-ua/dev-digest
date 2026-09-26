/**
 * project-docs adapter unit tests. No DB, no git — builds a temp clone dir on
 * disk and drives `GitProjectDocsAdapter` through a minimal `GitClient` stub.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitClient, RepoRef } from '@devdigest/shared';
import { GitProjectDocsAdapter, MAX_DOC_BYTES } from '../src/adapters/project-docs/index.js';
import { ValidationError } from '../src/platform/errors.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

/** A GitClient stub whose only used members are clonePathFor + readFile. */
function stubGitClient(root: string): GitClient {
  return {
    clonePathFor: () => root,
    readFile: async (_repo: RepoRef, path: string) => {
      const { readFile } = await import('node:fs/promises');
      return readFile(join(root, path), 'utf8');
    },
  } as unknown as GitClient;
}

describe('GitProjectDocsAdapter', () => {
  let root: string;
  const repo: RepoRef = { owner: 'acme', name: 'demo' };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-docs-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists .md files under specs/ and docs/, and any INSIGHTS.md, with categories', async () => {
    await writeFileAt(root, 'specs/README.md', '# Specs');
    await writeFileAt(root, 'docs/guide.md', '# Guide');
    await writeFileAt(root, 'INSIGHTS.md', '# Root insights'); // flat-file convention (other repos)
    await writeFileAt(root, 'server/INSIGHTS.md', '# Server insights');
    await writeFileAt(root, 'src/index.ts', 'export {};'); // not a doc — excluded

    const adapter = new GitProjectDocsAdapter(stubGitClient(root));
    const docs = await adapter.list(repo);

    expect(docs.map((d) => d.path).sort()).toEqual([
      'INSIGHTS.md',
      'docs/guide.md',
      'server/INSIGHTS.md',
      'specs/README.md',
    ]);
    expect(docs.find((d) => d.path === 'specs/README.md')).toMatchObject({ category: 'specs', dir: 'specs' });
    expect(docs.find((d) => d.path === 'docs/guide.md')).toMatchObject({ category: 'docs', dir: 'docs' });
    expect(docs.find((d) => d.path === 'INSIGHTS.md')).toMatchObject({ category: 'insights', dir: '' });
    expect(docs.find((d) => d.path === 'server/INSIGHTS.md')).toMatchObject({ category: 'insights', dir: 'server' });
  });

  it('lists any .md under an insights/ dir as category insights (our own convention)', async () => {
    await writeFileAt(root, 'insights/INSIGHTS.md', '# Root insights');
    await writeFileAt(root, 'insights/repo-intel.md', '# Repo-intel insights');
    await writeFileAt(root, 'server/insights/INSIGHTS.md', '# Server insights');

    const adapter = new GitProjectDocsAdapter(stubGitClient(root));
    const docs = await adapter.list(repo);

    expect(docs.map((d) => d.path).sort()).toEqual([
      'insights/INSIGHTS.md',
      'insights/repo-intel.md',
      'server/insights/INSIGHTS.md',
    ]);
    expect(docs.every((d) => d.category === 'insights')).toBe(true);
  });

  it('skips node_modules and .git', async () => {
    await writeFileAt(root, 'node_modules/pkg/docs/readme.md', '# Should be skipped');
    await writeFileAt(root, '.git/docs/x.md', '# Should be skipped');
    await writeFileAt(root, 'docs/keep.md', '# Keep');

    const adapter = new GitProjectDocsAdapter(stubGitClient(root));
    const docs = await adapter.list(repo);

    expect(docs.map((d) => d.path)).toEqual(['docs/keep.md']);
  });

  it('degrades to an empty list when the clone does not exist on disk', async () => {
    const adapter = new GitProjectDocsAdapter(stubGitClient(join(root, 'never-cloned')));
    expect(await adapter.list(repo)).toEqual([]);
  });

  it('read() returns the text of a known doc', async () => {
    await writeFileAt(root, 'docs/guide.md', 'Guide contents');
    const adapter = new GitProjectDocsAdapter(stubGitClient(root));
    expect(await adapter.read(repo, 'docs/guide.md')).toBe('Guide contents');
  });

  it('read() rejects a path not returned by list() — no traversal', async () => {
    await writeFileAt(root, 'docs/guide.md', 'Guide contents');
    await writeFileAt(root, 'src/index.ts', 'export {};'); // real file, but not a recognized doc
    const adapter = new GitProjectDocsAdapter(stubGitClient(root));

    await expect(adapter.read(repo, '../../etc/passwd')).rejects.toThrow(ValidationError);
    await expect(adapter.read(repo, 'src/index.ts')).rejects.toThrow(ValidationError);
    await expect(adapter.read(repo, 'docs/not-there.md')).rejects.toThrow(ValidationError);
  });

  it('lists docs in a stable, name-sorted order', async () => {
    await writeFileAt(root, 'docs/b.md', 'b');
    await writeFileAt(root, 'docs/a.md', 'a');
    await writeFileAt(root, 'specs/c.md', 'c');
    const adapter = new GitProjectDocsAdapter(stubGitClient(root));
    expect((await adapter.list(repo)).map((d) => d.path)).toEqual(['docs/a.md', 'docs/b.md', 'specs/c.md']);
  });

  it('readMany() keeps input order and drops unknown or traversal paths', async () => {
    await writeFileAt(root, 'docs/a.md', 'A');
    await writeFileAt(root, 'specs/b.md', 'B');
    await writeFileAt(root, 'src/index.ts', 'export {};');
    const adapter = new GitProjectDocsAdapter(stubGitClient(root));

    expect(
      await adapter.readMany(repo, ['specs/b.md', '../../etc/passwd', 'src/index.ts', 'docs/gone.md', 'docs/a.md']),
    ).toEqual([
      { path: 'specs/b.md', text: 'B' },
      { path: 'docs/a.md', text: 'A' },
    ]);
  });

  it('enforces the per-doc byte cap: read() rejects, readMany() skips', async () => {
    await writeFileAt(root, 'docs/small.md', 'ok');
    await writeFileAt(root, 'docs/huge.md', 'x'.repeat(MAX_DOC_BYTES + 1));
    const adapter = new GitProjectDocsAdapter(stubGitClient(root));

    await expect(adapter.read(repo, 'docs/huge.md')).rejects.toThrow(ValidationError);
    expect(await adapter.readMany(repo, ['docs/huge.md', 'docs/small.md'])).toEqual([
      { path: 'docs/small.md', text: 'ok' },
    ]);
  });
});

/**
 * project-docs adapter — walks a repo's local clone for markdown project docs
 * (`specs/`, `docs/`, `insights/` dirs, plus any standalone `INSIGHTS.md` at
 * any depth for repos still on the flat-file convention) for the Skills
 * Context tab and review-time doc injection. Implements `ProjectDocsAdapter`
 * (`modules/skills/ports.ts`).
 */
import { readdir } from 'node:fs/promises';
import { join, relative, dirname, sep } from 'node:path';
import type { GitClient, RepoRef } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { ProjectDoc, ProjectDocsAdapter } from '../../modules/skills/ports.js';

/** Bounds a runaway walk (vendored dirs excluded, but caps stay as a backstop). */
const MAX_DEPTH = 10;
const MAX_DOCS = 300;
const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);

function categorize(relPath: string, filename: string): ProjectDoc['category'] | null {
  if (filename === 'INSIGHTS.md') return 'insights';
  if (!filename.toLowerCase().endsWith('.md')) return null;
  const segments = relPath.split('/');
  if (segments.includes('specs')) return 'specs';
  if (segments.includes('docs')) return 'docs';
  if (segments.includes('insights')) return 'insights';
  return null;
}

export class GitProjectDocsAdapter implements ProjectDocsAdapter {
  constructor(private git: GitClient) {}

  async list(repo: RepoRef): Promise<ProjectDoc[]> {
    const root = this.git.clonePathFor(repo);
    const docs: ProjectDoc[] = [];
    await this.walk(root, root, 0, docs);
    return docs;
  }

  async read(repo: RepoRef, path: string): Promise<string> {
    const docs = await this.list(repo);
    if (!docs.some((d) => d.path === path)) {
      throw new ValidationError('Not a recognized project doc for this repo');
    }
    return this.git.readFile(repo, path);
  }

  async readMany(repo: RepoRef, paths: string[]): Promise<Array<{ path: string; text: string }>> {
    const known = new Set((await this.list(repo)).map((d) => d.path));
    const out: Array<{ path: string; text: string }> = [];
    for (const path of paths) {
      if (!known.has(path)) continue;
      try {
        out.push({ path, text: await this.git.readFile(repo, path) });
      } catch {
        // Vanished between list and read — same as not listed.
      }
    }
    return out;
  }

  private async walk(root: string, dir: string, depth: number, out: ProjectDoc[]): Promise<void> {
    if (out.length >= MAX_DOCS || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Repo not cloned yet, or dir vanished mid-walk — degrade to no docs.
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= MAX_DOCS) return;
      if (entry.name.startsWith('.')) continue; // .git, .github, dotfiles
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        await this.walk(root, full, depth + 1, out);
        continue;
      }
      if (!entry.isFile()) continue;
      const relPath = relative(root, full).split(sep).join('/');
      const category = categorize(relPath, entry.name);
      if (!category) continue;
      const dirPart = dirname(relPath);
      out.push({ path: relPath, dir: dirPart === '.' ? '' : dirPart, category });
    }
  }
}

/**
 * Pulls the skill's core out of an imported Markdown file: `name` and
 * `description` from a leading YAML frontmatter block (the Agent Skills
 * `SKILL.md` format), and the remaining Markdown as the body. Only flat
 * `key: value` pairs are read — plus `>` / `|` block scalars, whose indented
 * lines are joined — never a full YAML parse, so nothing in the file executes
 * or expands. Without frontmatter, the name falls back to the first heading,
 * then the file name.
 */

export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      const cont: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) cont.push(lines[++i]!.trim());
      out[key] = cont.join(raw.startsWith(">") ? " " : "\n");
    } else {
      out[key] = unquote(raw);
    }
  }
  return out;
}

const baseName = (filename: string) => filename.split("/").pop() ?? filename;

export function parseSkillMarkdown(content: string, filename: string): ParsedSkillMarkdown {
  const fm = content.match(FRONTMATTER);
  const meta = fm ? parseFrontmatter(fm[1]!) : {};
  const body = (fm ? content.slice(fm[0].length) : content).trim();
  const heading = body.match(/^#+\s+(.+)$/m)?.[1]?.trim();
  const name = meta.name || heading || baseName(filename).replace(/\.md$/i, "");
  const description = meta.description || `Imported from ${filename}`;
  return { name, description, body };
}

/** Index of the entry to preselect: the archive's `SKILL.md` if present, else the first. */
export function preferredEntryIndex(files: ReadonlyArray<{ filename: string }>): number {
  const idx = files.findIndex((f) => baseName(f.filename).toLowerCase() === "skill.md");
  return idx >= 0 ? idx : 0;
}

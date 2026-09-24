import type {
  Skill,
  SkillContext,
  SkillImportPreview,
  SkillStats,
  SkillVersion,
  SkillWithStats,
  SkillType,
  SkillSource,
} from '@devdigest/shared';
import type { InsertSkill, UpdateSkill, SkillsServiceDeps } from './ports.js';
import { buildImportedMarkdown, stripFrontmatter } from './helpers.js';
import { detectInjection } from './injection-detector.js';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from './constants.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';

export interface CreateSkillDto {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export interface UpdateSkillDto {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
  message?: string;
}

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  private get repo() {
    return this.deps.skills;
  }

  async list(workspaceId: string): Promise<SkillWithStats[]> {
    return this.repo.listWithStats(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.repo.getById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillDto): Promise<Skill> {
    const source = input.source ?? 'manual';
    // Imported skills must be vetted before enabling (always disabled on creation)
    const enabled = source === 'manual' ? input.enabled : false;

    // Check for injection patterns
    const injection = detectInjection(input.body);
    // Dangerous skills cannot be enabled
    const finalEnabled = injection.isDangerous ? false : enabled;

    const insertValues: InsertSkill = {
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      enabled: finalEnabled,
      isDangerous: injection.isDangerous,
      evidenceFiles: input.evidence_files,
    };
    return this.repo.insert(insertValues);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillDto,
  ): Promise<Skill | undefined> {
    // Provenance is one-way: an imported skill can be vetted (enabled) but never
    // relabelled 'manual', which would hide its untrusted origin in the UI.
    if (patch.source === 'manual') {
      const existing = await this.repo.getById(workspaceId, id);
      if (!existing) return undefined;
      if (existing.source !== 'manual') {
        throw new ValidationError('An imported skill cannot be relabelled as manual');
      }
    }

    // Get the existing skill to check if body changed
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;

    // Re-run injection detection on every save — not just body edits — so
    // toggling `enabled`, renaming, or any other unrelated field change also
    // re-validates the skill's current content. This self-heals rows that
    // predate this check (saved dangerous but never flagged) instead of only
    // catching newly-introduced dangerous content.
    const effectiveBody = patch.body !== undefined ? patch.body : existing.body;
    const injection = detectInjection(effectiveBody);
    let isDangerous = injection.isDangerous;

    // Dangerous skills cannot be enabled. An explicit attempt to enable one is
    // rejected outright; otherwise force-disable regardless of what `patch`
    // touched — e.g. editing the body of an already-enabled skill to newly
    // include dangerous content must flip `enabled` off even though the patch
    // never mentions `enabled` (leaving it `undefined` would make the repo
    // skip that column and silently keep the skill enabled in the DB).
    let enabled = patch.enabled;
    if (isDangerous) {
      if (patch.enabled === true) {
        throw new ValidationError('Cannot enable a skill with dangerous content. Remove the suspicious patterns first.');
      }
      enabled = false;
    }

    const updateValues: UpdateSkill = {
      name: patch.name,
      description: patch.description,
      type: patch.type,
      source: patch.source,
      body: patch.body,
      enabled,
      isDangerous,
      evidenceFiles: patch.evidence_files,
      message: patch.message,
      // A skill flagged dangerous must not keep running for agents it's
      // already linked to — sever every link the moment it's (re-)detected.
      unlinkFromAgents: isDangerous,
    };
    return this.repo.update(workspaceId, id, updateValues);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    return this.repo.listVersions(workspaceId, id);
  }

  async restore(
    workspaceId: string,
    id: string,
    version: number,
    message?: string,
  ): Promise<Skill | undefined> {
    // A restored version's body can itself contain dangerous content (e.g.
    // reverting to an old draft that predates a fix, or undoing the edit that
    // triggered a force-disable) — re-run the same check `update()` does so a
    // restore can't silently bring back an enabled-and-dangerous skill.
    const targetVersion = await this.repo.getVersion(id, version);
    if (!targetVersion) return undefined;

    const injection = detectInjection(targetVersion.body);
    const overrides = {
      isDangerous: injection.isDangerous,
      enabled: injection.isDangerous ? false : undefined,
      unlinkFromAgents: injection.isDangerous,
    };
    return this.repo.restore(workspaceId, id, version, message, overrides);
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    return this.repo.stats(workspaceId, id);
  }

  async importFromUrl(
    workspaceId: string,
    url: string,
    name?: string,
    type?: SkillType,
  ): Promise<Skill> {
    const { text: raw, finalUrl } = await this.deps.remoteText.fetchText(url);
    const parsed = buildImportedMarkdown(raw, finalUrl);

    if (parsed.body.length > SKILL_BODY_MAX) {
      throw new ValidationError(`Skill body exceeds ${SKILL_BODY_MAX} characters`);
    }
    // Same limits POST /skills enforces — a heading or URL can be arbitrarily long.
    const created = await this.create(workspaceId, {
      name: (name ?? parsed.name).slice(0, SKILL_NAME_MAX),
      description: (parsed.description || `Imported from ${finalUrl}`).slice(0, SKILL_DESCRIPTION_MAX),
      type: type ?? 'custom',
      source: 'imported_url',
      body: parsed.body,
      enabled: false, // imported skills require vetting before enabling
    });

    // v1 keeps the raw fetch (with its frontmatter + provenance stamp) so the
    // source URL stays recoverable even after v2 strips the whole header.
    const stripped = stripFrontmatter(parsed.body);
    if (stripped !== parsed.body) {
      const updated = await this.update(workspaceId, created.id, {
        body: stripped,
        message: 'Removed imported YAML frontmatter',
      });
      return updated ?? created;
    }
    return created;
  }

  /**
   * Fetch + derive name/description/body WITHOUT inserting — backs the URL
   * import tab's fetch → preview → confirm flow (confirm goes through
   * `create`, same as file import, so the user can edit the prefilled form
   * before saving).
   */
  async previewImportFromUrl(url: string): Promise<SkillImportPreview> {
    const { text: raw, finalUrl } = await this.deps.remoteText.fetchText(url);
    const parsed = buildImportedMarkdown(raw, finalUrl);
    if (parsed.body.length > SKILL_BODY_MAX) {
      throw new ValidationError(`Skill body exceeds ${SKILL_BODY_MAX} characters`);
    }
    return {
      name: parsed.name.slice(0, SKILL_NAME_MAX),
      description: parsed.description,
      body: parsed.body,
    };
  }

  // ---- Project context (Context tab) --------------------------------------

  async getContext(
    workspaceId: string,
    id: string,
    repoId: string,
  ): Promise<SkillContext | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const repoRow = await this.deps.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const [available, attached] = await Promise.all([
      this.deps.projectDocs.list({ owner: repoRow.owner, name: repoRow.name }),
      this.repo.listContextPaths(id),
    ]);
    return { available, attached };
  }

  async setContext(
    workspaceId: string,
    id: string,
    paths: string[],
  ): Promise<string[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.setContextPaths(id, paths);
  }

  async readContextDoc(workspaceId: string, repoId: string, path: string): Promise<string> {
    const repoRow = await this.deps.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    return this.deps.projectDocs.read({ owner: repoRow.owner, name: repoRow.name }, path);
  }
}

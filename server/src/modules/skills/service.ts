import type { Container } from '../../platform/container.js';
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
import type { InsertSkill, UpdateSkill, SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto, deriveSkillName } from './helpers.js';
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
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = container.skillsRepo;
  }

  async list(workspaceId: string): Promise<SkillWithStats[]> {
    return this.repo.listWithStats(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillDto): Promise<Skill> {
    const source = input.source ?? 'manual';
    // Imported skills must be vetted before enabling (always disabled on creation)
    const enabled = source === 'manual' ? input.enabled : false;

    const insertValues: InsertSkill = {
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      enabled,
      evidenceFiles: input.evidence_files,
    };
    const row = await this.repo.insert(insertValues);
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillDto,
  ): Promise<Skill | undefined> {
    const updateValues: UpdateSkill = {
      name: patch.name,
      description: patch.description,
      type: patch.type,
      source: patch.source,
      body: patch.body,
      enabled: patch.enabled,
      evidenceFiles: patch.evidence_files,
      message: patch.message,
    };
    const row = await this.repo.update(workspaceId, id, updateValues);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const rows = await this.repo.listVersions(workspaceId, id);
    return rows ? rows.map(toSkillVersionDto) : undefined;
  }

  async restore(
    workspaceId: string,
    id: string,
    version: number,
    message?: string,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, id, version, message);
    return row ? toSkillDto(row) : undefined;
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
    const { text: body, finalUrl } = await this.container.remoteText.fetchText(url);

    const derivedName = name ?? deriveSkillName(body, finalUrl);

    if (body.length > SKILL_BODY_MAX) {
      throw new ValidationError(`Skill body exceeds ${SKILL_BODY_MAX} characters`);
    }
    // Same limits POST /skills enforces — a heading or URL can be arbitrarily long.
    return this.create(workspaceId, {
      name: derivedName.slice(0, SKILL_NAME_MAX),
      description: `Imported from ${finalUrl}`.slice(0, SKILL_DESCRIPTION_MAX),
      type: type ?? 'custom',
      source: 'imported_url',
      body,
      enabled: false, // imported skills require vetting before enabling
    });
  }

  /**
   * Fetch + derive name/body WITHOUT inserting — backs the URL import tab's
   * fetch → preview → confirm flow (confirm goes through `create`, same as
   * file import, so the user can edit the prefilled form before saving).
   */
  async previewImportFromUrl(url: string): Promise<SkillImportPreview> {
    const { text: body, finalUrl } = await this.container.remoteText.fetchText(url);
    if (body.length > SKILL_BODY_MAX) {
      throw new ValidationError(`Skill body exceeds ${SKILL_BODY_MAX} characters`);
    }
    return { name: deriveSkillName(body, finalUrl).slice(0, SKILL_NAME_MAX), body };
  }

  // ---- Project context (Context tab) --------------------------------------

  async getContext(
    workspaceId: string,
    id: string,
    repoId: string,
  ): Promise<SkillContext | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const repoRow = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const [available, attached] = await Promise.all([
      this.container.projectDocs.list({ owner: repoRow.owner, name: repoRow.name }),
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
    const repoRow = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    return this.container.projectDocs.read({ owner: repoRow.owner, name: repoRow.name }, path);
  }
}

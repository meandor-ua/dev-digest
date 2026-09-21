import type { Container } from '../../platform/container.js';
import type { Skill, SkillStats, SkillVersion, SkillWithStats, SkillType, SkillSource } from '@devdigest/shared';
import type { InsertSkill, UpdateSkill, SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from './constants.js';
import { ValidationError } from '../../platform/errors.js';

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
  ): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, id, version);
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

    // Derive name from first markdown heading or url basename if not provided
    let derivedName = name;
    if (!derivedName) {
      const match = body.match(/^#+\s+(.+)$/m);
      if (match && match[1]) {
        derivedName = match[1].trim();
      } else {
        const urlParts = finalUrl.split('/');
        derivedName = urlParts[urlParts.length - 1]?.replace(/\.md$/i, '') || 'imported-skill';
      }
    }

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
}

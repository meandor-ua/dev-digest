import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow, SkillContextDocRow } from '../../db/rows.js';
import type { SkillStats, SkillWithStats, SkillType, SkillSource } from '@devdigest/shared';
import { toSkillDto } from './helpers.js';

export type { SkillRow, SkillVersionRow, SkillContextDocRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  /** Change note for the version snapshot — only used when `body` actually changes. */
  message?: string | null;
}

interface AgentUsage {
  /** Completed runs across the whole workspace (the pull-frequency denominator). */
  totalRuns: number;
  runsByAgent: Map<string, number>;
  findingsByAgent: Map<string, { total: number; dismissed: number }>;
}

/**
 * A skill's usage, attributed through the agents that have it linked AND enabled:
 * pull frequency = their completed runs / all completed runs in the workspace;
 * accept rate = their non-dismissed findings / all their findings (null when none —
 * no findings means no signal, never a fabricated 100%).
 */
function usageRates(usage: AgentUsage, enabledAgentIds: string[]) {
  let runs = 0;
  let findings = 0;
  let dismissed = 0;
  for (const agentId of enabledAgentIds) {
    runs += usage.runsByAgent.get(agentId) ?? 0;
    const f = usage.findingsByAgent.get(agentId);
    findings += f?.total ?? 0;
    dismissed += f?.dismissed ?? 0;
  }
  return {
    pullFrequencyPct: usage.totalRuns > 0 ? Math.min(100, Math.round((runs / usage.totalRuns) * 100)) : 0,
    acceptRatePct: findings > 0 ? Math.round(((findings - dismissed) / findings) * 100) : null,
  };
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(t.skills.createdAt);
  }

  async listWithStats(workspaceId: string): Promise<SkillWithStats[]> {
    const allSkills = await this.list(workspaceId);
    if (allSkills.length === 0) return [];

    const [links, usage] = await Promise.all([
      this.db
        .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId, enabled: t.agentSkills.enabled })
        .from(t.agentSkills)
        .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
        .where(eq(t.skills.workspaceId, workspaceId)),
      this.agentUsage(workspaceId),
    ]);

    const bySkill = new Map<string, { agentCount: number; enabledAgentIds: string[] }>();
    for (const link of links) {
      const entry = bySkill.get(link.skillId) ?? { agentCount: 0, enabledAgentIds: [] };
      entry.agentCount += 1;
      if (link.enabled) entry.enabledAgentIds.push(link.agentId);
      bySkill.set(link.skillId, entry);
    }

    return allSkills.map((sk) => {
      const entry = bySkill.get(sk.id);
      const rates = usageRates(usage, entry?.enabledAgentIds ?? []);
      return {
        ...toSkillDto(sk),
        agent_count: entry?.agentCount ?? 0,
        pull_frequency_pct: rates.pullFrequencyPct,
        accept_rate_pct: rates.acceptRatePct,
      };
    });
  }

  /**
   * Per-agent run and finding counts for the workspace, in two grouped queries —
   * the inputs to a skill's pull-frequency and accept-rate (see `usageRates`).
   */
  private async agentUsage(workspaceId: string): Promise<AgentUsage> {
    const [runRows, findingRows] = await Promise.all([
      this.db
        .select({ agentId: t.agentRuns.agentId, runs: sql<number>`count(*)::int` })
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.status, 'done')))
        .groupBy(t.agentRuns.agentId),
      this.db
        .select({
          agentId: t.reviews.agentId,
          total: sql<number>`count(*)::int`,
          dismissed: sql<number>`count(${t.findings.dismissedAt})::int`,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .where(eq(t.reviews.workspaceId, workspaceId))
        .groupBy(t.reviews.agentId),
    ]);
    const runsByAgent = new Map<string, number>();
    let totalRuns = 0;
    for (const r of runRows) {
      totalRuns += r.runs;
      if (r.agentId) runsByAgent.set(r.agentId, r.runs);
    }
    const findingsByAgent = new Map<string, { total: number; dismissed: number }>();
    for (const f of findingRows) {
      if (f.agentId) findingsByAgent.set(f.agentId, { total: f.total, dismissed: f.dismissed });
    }
    return { totalRuns, runsByAgent, findingsByAgent };
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? '',
        type: values.type,
        source: values.source ?? 'manual',
        body: values.body,
        enabled: values.enabled ?? true,
        version: 1,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();

    // Snapshot version 1
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row!.id,
        version: 1,
        body: row!.body,
      })
      .onConflictDoNothing();

    return row!;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // `message` targets skill_versions, not a `skills` column — kept out of the
    // "is this patch empty" check below so a message-only patch (no other field)
    // doesn't build an UPDATE with an empty SET (invalid SQL).
    const { message, ...columnPatch } = patch;
    const bodyChanged = columnPatch.body !== undefined && columnPatch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;
    if (Object.values(columnPatch).every((v) => v === undefined)) return existing;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(columnPatch.name !== undefined ? { name: columnPatch.name } : {}),
        ...(columnPatch.description !== undefined ? { description: columnPatch.description } : {}),
        ...(columnPatch.type !== undefined ? { type: columnPatch.type } : {}),
        ...(columnPatch.source !== undefined ? { source: columnPatch.source } : {}),
        ...(columnPatch.body !== undefined ? { body: columnPatch.body } : {}),
        ...(columnPatch.enabled !== undefined ? { enabled: columnPatch.enabled } : {}),
        ...(columnPatch.evidenceFiles !== undefined ? { evidenceFiles: columnPatch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.db
        .insert(t.skillVersions)
        .values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          message: message ?? null,
        })
        .onConflictDoNothing();
    }

    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersionRow[] | undefined> {
    const skill = await this.getById(workspaceId, id);
    if (!skill) return undefined;

    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id))
      .orderBy(desc(t.skillVersions.version));
  }

  async restore(
    workspaceId: string,
    id: string,
    version: number,
    message?: string | null,
  ): Promise<SkillRow | undefined> {
    const skill = await this.getById(workspaceId, id);
    if (!skill) return undefined;

    const [targetVersion] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, id), eq(t.skillVersions.version, version)));

    if (!targetVersion) return undefined;

    const nextVersion = skill.version + 1;
    const [row] = await this.db
      .update(t.skills)
      .set({
        body: targetVersion.body,
        version: nextVersion,
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (row) {
      await this.db
        .insert(t.skillVersions)
        .values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          message: message ?? `Restored from v${version}`,
        })
        .onConflictDoNothing();
    }

    return row;
  }

  // ---- Context docs (skill_context_docs) -----------------------------------

  /** Attached doc paths for a skill, in `order` ascending. */
  async listContextPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  /** Replace the attached set — array order becomes the persisted `order`. */
  async setContextPaths(skillId: string, paths: string[]): Promise<string[]> {
    const unique = [...new Set(paths)];
    return this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (unique.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(unique.map((path, order) => ({ skillId, path, order })));
      }
      return unique;
    });
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.getById(workspaceId, id);
    if (!skill) return undefined;

    // 1. Linked agents
    const linkedAgents = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, id));

    const agentRefs = linkedAgents.map((a) => ({ id: a.id, name: a.name }));
    const enabledAgentIds = linkedAgents.filter((a) => a.enabled).map((a) => a.id);

    // 2. Pull frequency % + accept rate % — same formulas as the list cards.
    const { pullFrequencyPct, acceptRatePct } = usageRates(await this.agentUsage(workspaceId), enabledAgentIds);

    // 3. Findings in the last 30 days + findings by category
    let findings30d = 0;
    const findingsByCategory: Record<string, number> = {};

    if (enabledAgentIds.length > 0) {
      const findingRows = await this.db
        .select({
          category: t.findings.category,
          createdAt: t.reviews.createdAt,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .where(
          and(
            eq(t.reviews.workspaceId, workspaceId),
            inArray(t.reviews.agentId, enabledAgentIds),
          ),
        );

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      for (const f of findingRows) {
        if (f.createdAt && f.createdAt >= thirtyDaysAgo) {
          findings30d += 1;
        }
        findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
      }
    }

    return {
      agent_count: agentRefs.length,
      agents: agentRefs,
      pull_frequency_pct: pullFrequencyPct,
      accept_rate_pct: acceptRatePct,
      findings_30d: findings30d,
      findings_by_category: findingsByCategory,
    };
  }
}

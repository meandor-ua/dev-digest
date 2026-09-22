import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';
import type { RunRow, FindingRow } from './stats.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order + enabled flag), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  enabled: boolean;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    const skills = await this.skillIdsForAgent(row.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent with `items`, assigning
   * order = index and persisting each `enabled` flag (default true). Used by the
   * "Skills" editor tab (attach/reorder/toggle). Skills not in the list are unlinked.
   */
  async setSkills(
    agentId: string,
    items: Array<{ skillId: string; enabled?: boolean }>,
  ): Promise<void> {
    // One transaction: a failed insert must not leave the agent with its links already deleted.
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (items.length === 0) return;
      await tx
        .insert(t.agentSkills)
        .values(items.map((it, i) => ({ agentId, skillId: it.skillId, order: i, enabled: it.enabled ?? true })));
    });
  }

  /** The subset of `skillIds` that actually belong to `workspaceId` (ownership guard). */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  // ---- stats aggregation source rows (see ./stats.ts) ---------------------

  /** DONE runs of any agent whose PR is in `repoId` (card stats across agents). */
  async doneRunsForRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<Array<RunRow & { agentId: string }>> {
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        runId: t.agentRuns.id,
        prId: t.agentRuns.prId,
        prNumber: t.pullRequests.number,
        ranAt: t.agentRuns.ranAt,
        score: t.agentRuns.score,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        findingsCount: t.agentRuns.findingsCount,
        source: t.agentRuns.source,
        traceRunId: t.runTraces.runId,
      })
      .from(t.agentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          eq(t.pullRequests.repoId, repoId),
        ),
      );
    return rows
      .filter((r) => r.agentId !== null)
      .map((r) => ({
        agentId: r.agentId!,
        runId: r.runId,
        prId: r.prId,
        prNumber: r.prNumber,
        ranAt: r.ranAt,
        score: r.score,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        findingsCount: r.findingsCount,
        source: r.source,
        hasTrace: r.traceRunId !== null,
      }));
  }

  /** DONE runs of one agent whose PR is in `repoId` (Stats tab). */
  async doneRunsForAgentRepo(agentId: string, repoId: string): Promise<RunRow[]> {
    const rows = await this.db
      .select({
        runId: t.agentRuns.id,
        prId: t.agentRuns.prId,
        prNumber: t.pullRequests.number,
        ranAt: t.agentRuns.ranAt,
        score: t.agentRuns.score,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        findingsCount: t.agentRuns.findingsCount,
        source: t.agentRuns.source,
        traceRunId: t.runTraces.runId,
      })
      .from(t.agentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
          eq(t.pullRequests.repoId, repoId),
        ),
      );
    return rows.map((r) => ({
      runId: r.runId,
      prId: r.prId,
      prNumber: r.prNumber,
      ranAt: r.ranAt,
      score: r.score,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      findingsCount: r.findingsCount,
      source: r.source,
      hasTrace: r.traceRunId !== null,
    }));
  }

  /** Findings from an agent's DONE runs within `repoId` (severity/category by run week). */
  async findingsForAgentRepo(agentId: string, repoId: string): Promise<FindingRow[]> {
    const rows = await this.db
      .select({
        severity: t.findings.severity,
        category: t.findings.category,
        ranAt: t.agentRuns.ranAt,
      })
      .from(t.agentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
          eq(t.pullRequests.repoId, repoId),
        ),
      );
    return rows.map((r) => ({ severity: r.severity, category: r.category, ranAt: r.ranAt }));
  }

  /**
   * Count of ENABLED linked skills per agent in a workspace (card stats). The
   * card's "N skills" mirrors the Skills tab's "N of M enabled" left-hand
   * number, so disabled links are excluded here.
   */
  async skillCountByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, r.n]));
  }

  /** Enabled linked-skill names for an agent, in `order` (most-used placeholder). */
  async enabledSkillNames(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => r.name);
  }
}

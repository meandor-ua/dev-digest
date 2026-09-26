/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentCardStats,
  AgentRepoStats,
  AgentSkillItem,
  ModelInfo,
  Provider,
  ReviewStrategy,
  SkillWithStats,
} from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
      // Deleting an agent cascades its skill links → skill cards' agent counts change.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** Per-agent card stats (skills count + runs / avg score / avg cost), repo-scoped. */
export function useAgentCardStats(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-card-stats", repoId],
    queryFn: () => api.get<AgentCardStats[]>(`/agents/stats?repo_id=${repoId}`),
    enabled: !!repoId,
  });
}

/** Repo-scoped Stats-tab aggregates for one agent. */
export function useAgentStats(id: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", id, repoId],
    queryFn: () => api.get<AgentRepoStats>(`/agents/${id}/stats?repo_id=${repoId}`),
    enabled: !!id && !!repoId,
  });
}

/** Linked skills for an agent (ordered, with name/type) — the Skills tab. */
export function useAgentSkills(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", id],
    queryFn: () => api.get<AgentSkillItem[]>(`/agents/${id}/skills`),
    enabled: !!id,
  });
}

/**
 * Replace an agent's linked-skill set (order + membership) in one call, from
 * an ordered list of skill ids. Optimistic: the Skills tab writes the new
 * order/links immediately and rolls back on error.
 *
 * Autosaves can overlap (link, then drag before the first request returns).
 * Each save is a full-set replace built from the cache, so only the LAST
 * in-flight save may write the server response or roll back — an older one
 * settling first would otherwise clobber the newer optimistic state, and the
 * next save built from that cache would silently undo the newer edit.
 */
export function useSetAgentSkills(id: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", id];
  const mutationKey = ["set-agent-skills", id];
  // Callbacks run while this mutation is still pending, so 1 means "only me".
  const isLastInFlight = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillItem[]>(`/agents/${id}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSkillItem[]>(key);

      // For newly linked skills not yet in cache, build them from the global skills cache
      const skillsCache = qc.getQueryData<SkillWithStats[]>(["skills"]) ?? [];
      const skillsById = new Map(skillsCache.map((s) => [s.id, s]));

      const byId = new Map((prev ?? []).map((s) => [s.skill_id, s]));
      const next = skillIds
        .map((skillId, order) => {
          const base = byId.get(skillId);
          if (base) return { ...base, order };
          // Try to build from skills cache for newly linked skills
          const globalSkill = skillsById.get(skillId);
          if (globalSkill) {
            return {
              agent_id: id,
              skill_id: skillId,
              name: globalSkill.name,
              type: globalSkill.type,
              order,
            };
          }
          return undefined;
        })
        .filter((s): s is AgentSkillItem => s !== undefined);
      qc.setQueryData<AgentSkillItem[]>(key, next);
      return { prev };
    },
    onError: (_e, _v, context) => {
      if (!isLastInFlight()) return; // a newer save owns the cache now
      if (context?.prev) qc.setQueryData(key, context.prev);
      qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (data) => {
      // The server response IS the full linked set, so no refetch is needed.
      if (isLastInFlight()) qc.setQueryData(key, data);
    },
    onSettled: () => {
      // The card's "N skills" counts links whose underlying skill is enabled,
      // so linking/unlinking (and a skill's own enabled flag) changes it.
      qc.invalidateQueries({ queryKey: ["agent-card-stats"] });
      // The Stats tab's most-used-skills list is built from those same links.
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
      // Skill cards (agent_count, pull/accept %) and a skill's Stats tab
      // (linked agents) are derived from these links as well.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

/**
 * Additively links ONE skill to an agent (POST /agents/:id/skills with a
 * single skill_id) — unlike `useSetAgentSkills`, which replaces the whole
 * set, this never touches the agent's other links. Used by the Conventions
 * Extractor's "Create skill" flow to attach the newly created skill.
 */
export function useLinkAgentSkill(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.post<AgentSkillItem[]>(`/agents/${agentId}/skills`, { skill_id: skillId }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["agent-card-stats"] });
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

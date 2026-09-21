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

/** Linked skills for an agent (ordered, with name/type/enabled) — the Skills tab. */
export function useAgentSkills(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", id],
    queryFn: () => api.get<AgentSkillItem[]>(`/agents/${id}/skills`),
    enabled: !!id,
  });
}

/** One entry of the Skills-tab set: skill id + enabled, in the desired order. */
export interface SetAgentSkillsItem {
  skill_id: string;
  enabled: boolean;
}

/**
 * Replace an agent's linked-skill set (order + enabled) in one call. Optimistic:
 * the Skills tab writes the new order/enabled immediately and rolls back on error.
 */
export function useSetAgentSkills(id: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", id];
  return useMutation({
    mutationFn: (skills: SetAgentSkillsItem[]) =>
      api.post<AgentSkillItem[]>(`/agents/${id}/skills`, { skills }),
    onMutate: async (skills) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSkillItem[]>(key);
      if (prev) {
        const byId = new Map(prev.map((s) => [s.skill_id, s]));
        const next = skills
          .map((it, order) => {
            const base = byId.get(it.skill_id);
            return base ? { ...base, enabled: it.enabled, order } : undefined;
          })
          .filter((s): s is AgentSkillItem => s !== undefined);
        qc.setQueryData<AgentSkillItem[]>(key, next);
      }
      return { prev };
    },
    onError: (_e, _v, context) => {
      if (context?.prev) qc.setQueryData(key, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // The card's "N skills" counts ENABLED links, so a toggle changes it.
      qc.invalidateQueries({ queryKey: ["agent-card-stats"] });
      // The Stats tab's most-used-skills list is built from enabled links too.
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
    },
  });
}

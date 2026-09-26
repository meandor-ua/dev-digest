/* hooks/conventions.ts — React Query hooks for the Conventions Extractor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionExtractResult, ConventionSkillDraft, ConventionStatus } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

// The scan is one LLM call over a whole-repo sample with a strict JSON
// schema. Slower models take 60-110s (a live deepseek-v4-flash scan measured
// 106s), and the server's OpenRouter client allows 90s per attempt with 2
// retries — so 90s here aborted scans the server then finished anyway. 5 min
// covers the server's own worst case; beyond it, fail with a clear "timed out".
export const EXTRACT_TIMEOUT_MS = 300_000;

/** Scan (one model call). Seeds the list cache from its own response. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`, undefined, {
        timeoutMs: EXTRACT_TIMEOUT_MS,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
    },
    // A timed-out or refused (409: scan already running) request doesn't mean
    // nothing changed server-side — refetch so a finished scan still shows up.
    onError: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface PatchConventionInput {
  id: string;
  patch: { rule?: string; rationale?: string | null; status?: ConventionStatus };
}

export function usePatchConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (list) =>
        list?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useDeleteConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (list) =>
        list?.filter((c) => c.id !== id),
      );
    },
  });
}

/** Un-persisted draft merged from the repo's accepted conventions — nothing is saved yet. */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`),
  });
}

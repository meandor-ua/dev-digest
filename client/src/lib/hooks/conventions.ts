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
// schema — slower models can legitimately take 60-90s. Bound it so a stalled
// call fails with a clear "timed out" error instead of spinning indefinitely.
const EXTRACT_TIMEOUT_MS = 90_000;

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

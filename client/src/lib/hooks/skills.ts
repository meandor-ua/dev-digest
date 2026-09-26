/* hooks/skills.ts — React Query hooks for the Skills Studio + Skill Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillWithStats,
  SkillStats,
  SkillVersion,
  SkillContext,
  SkillImportPreview,
  SkillType,
  SkillSource,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillWithStats[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<
    Pick<
      Skill,
      | "name"
      | "description"
      | "type"
      | "source"
      | "body"
      | "enabled"
      | "evidence_files"
    >
  > & { message?: string };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-stats", data.id] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      // Drop it from the cached list synchronously, before the caller's own
      // onSuccess navigates to /skills — that page redirects to the list's
      // first skill, and a stale list could send it to the one just deleted.
      qc.setQueryData<SkillWithStats[]>(["skills"], (list) => list?.filter((sk) => sk.id !== id));
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-stats", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
      // Deleting cascades the agent links: agent cards/Stats count enabled links.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agent-card-stats"] });
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
    },
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface RestoreSkillInput {
  id: string;
  version: number;
  message?: string;
}

export function useRestoreSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, message }: RestoreSkillInput) =>
      api.post<Skill>(`/skills/${id}/restore`, { version, message }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-stats", data.id] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agent-card-stats"] });
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
    },
  });
}

/** Fetch → preview a URL import WITHOUT saving (fetch → preview → confirm flow). */
export function usePreviewSkillUrl() {
  return useMutation({
    mutationFn: (url: string) => api.post<SkillImportPreview>("/skills/import/preview", { url }),
  });
}

/** Available project docs for a repo + this skill's currently attached paths. */
export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () =>
      api.get<SkillContext>(`/skills/${skillId}/context?repo_id=${encodeURIComponent(repoId!)}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Replaces the attached set; autosaves optimistically (rollback on error). */
export function useSetSkillContext(skillId: string, repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["skill-context", skillId, repoId];
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<{ attached: string[] }>(`/skills/${skillId}/context`, { paths }),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SkillContext>(key);
      if (prev) qc.setQueryData<SkillContext>(key, { ...prev, attached: paths });
      return { prev };
    },
    onError: (_e, _v, context) => {
      if (context?.prev) qc.setQueryData(key, context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["skill-context", skillId] }),
  });
}

/** One project doc's rendered text (the Context tab's eye preview). */
export function useContextDoc(repoId: string | null | undefined, path: string | null) {
  return useQuery({
    queryKey: ["skill-context-doc", repoId, path],
    queryFn: () =>
      api.get<{ text: string }>(
        `/skills/context/doc?repo_id=${encodeURIComponent(repoId!)}&path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

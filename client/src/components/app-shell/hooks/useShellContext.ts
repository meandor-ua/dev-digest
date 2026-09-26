"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "../../../lib/theme";
import { useActiveRepo } from "../../../lib/repo-context";
import { usePulls, useDeleteRepo, useWorkspace } from "../../../lib/hooks";
import { useToast } from "../../../lib/toast";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): {
  ctx: ShellContext;
  pendingRemoveRepo: { id: string; name: string } | null;
  confirmRemoveRepo: () => void;
  cancelRemoveRepo: () => void;
} {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const { data: workspace } = useWorkspace();
  const deleteRepo = useDeleteRepo();
  const toast = useToast();
  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const onRemoveRepo = React.useCallback((id: string) => setPendingRemoveId(id), []);

  const pendingTarget = pendingRemoveId ? repos.find((r) => r.id === pendingRemoveId) : undefined;
  const pendingRemoveRepo = pendingRemoveId
    ? { id: pendingRemoveId, name: pendingTarget?.full_name ?? t("removeRepo.fallbackName") }
    : null;

  const confirmRemoveRepo = React.useCallback(() => {
    const id = pendingRemoveId;
    setPendingRemoveId(null);
    if (!id) return;
    deleteRepo.mutate(id, {
      onSuccess: () => {
        toast.success(t("removeRepo.deleteSuccess", { name: pendingTarget?.full_name ?? t("removeRepo.fallbackName") }));
        if (repoId === id) {
          const next = repos.find((r) => r.id !== id);
          router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
        }
      },
    });
  }, [pendingRemoveId, repos, repoId, deleteRepo, pendingTarget, router, t, toast]);

  const cancelRemoveRepo = React.useCallback(() => setPendingRemoveId(null), []);

  const ctx = React.useMemo<ShellContext>(
    () => ({
      Link,
      activeKey: activeKeyFor(pathname),
      repoId,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
      githubUser: workspace?.github_user
        ? { login: workspace.github_user.login, avatarUrl: workspace.github_user.avatar_url }
        : null,
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
      workspace,
    ],
  );

  return { ctx, pendingRemoveRepo, confirmRemoveRepo, cancelRemoveRepo };
}

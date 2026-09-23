/* /skills — Skills tile list. Selecting a skill opens its three-column editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillWithStats } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { CreateSkillModal } from "../CreateSkillModal";
import { SkillCard } from "../SkillCard";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const updateMutation = useUpdateSkill();
  const deleteMutation = useDeleteSkill();
  const toast = useToast();
  const [modalState, setModalState] = React.useState<"scratch" | "import" | "url" | null>(null);
  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<SkillWithStats | null>(null);

  const confirmDelete = () => {
    const skill = pendingDelete;
    if (!skill) return;
    setPendingDelete(null);
    deleteMutation.mutate(skill.id, {
      onSuccess: () => toast.success(t("detail.deleteSuccess", { name: skill.name })),
      onError: (err) => toast.error((err as Error).message || t("detail.deleteError")),
    });
  };

  const query = search.trim().toLowerCase();
  const filtered = (skills ?? []).filter((skill) => {
    if (!query) return true;
    return (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.type.toLowerCase().includes(query)
    );
  });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {modalState && <CreateSkillModal initialTab={modalState} onClose={() => setModalState(null)} />}
      {pendingDelete && (
        <ConfirmDialog
          message={t("detail.confirmDelete", { name: pendingDelete.name })}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.crumbSkills")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("column.addScratch"), icon: "Edit", onClick: () => setModalState("scratch") },
              { label: t("column.addImport"), icon: "Upload", onClick: () => setModalState("import") },
              { label: t("column.addUrl"), icon: "Link", onClick: () => setModalState("url") },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            icon={query ? "Search" : "Sparkles"}
            title={query ? t("column.emptyTitle") : t("page.empty.title")}
            body={query ? t("column.emptyBody") : t("page.empty.body")}
            cta={query ? undefined : t("page.addSkill")}
            onCta={query ? undefined : () => setModalState("scratch")}
          />
        )}
        {filtered.length > 0 && (
          <div style={s.grid}>
            {filtered.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                active={false}
                onClick={() => router.push(`/skills/${skill.id}?tab=config`)}
                onToggle={(enabled) =>
                  updateMutation.mutate(
                    { id: skill.id, patch: { enabled } },
                    { onError: (err) => toast.error((err as Error).message || t("column.toggleError")) },
                  )
                }
                onDelete={() => setPendingDelete(skill)}
                deleting={deleteMutation.isPending && deleteMutation.variables === skill.id}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

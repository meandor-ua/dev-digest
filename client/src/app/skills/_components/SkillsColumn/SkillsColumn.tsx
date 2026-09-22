"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, TextInput, Skeleton, EmptyState } from "@devdigest/ui";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "../CreateSkillModal";
import type { SkillWithStats } from "@devdigest/shared";
import { useSkills, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { useConfirmDiscard } from "@/lib/unsaved-changes";
import { s } from "./styles";

export function SkillsColumn({
  activeId,
  tab,
}: {
  activeId?: string;
  tab: string;
}) {
  const router = useRouter();
  const t = useTranslations("skills");
  const { data: skills, isLoading } = useSkills();
  const updateMutation = useUpdateSkill();
  const deleteMutation = useDeleteSkill();
  const toast = useToast();
  const confirmDiscard = useConfirmDiscard();

  const handleDelete = (sk: SkillWithStats) => {
    if (!confirm(t("detail.confirmDelete", { name: sk.name }))) return;
    deleteMutation.mutate(sk.id, {
      onSuccess: () => {
        toast.success(t("detail.deleteSuccess", { name: sk.name }));
        // Deleting the open skill leaves its page dangling — /skills redirects to the next one.
        if (sk.id === activeId) router.push("/skills");
      },
      onError: (err) => {
        toast.error((err as Error).message || t("detail.deleteError"));
      },
    });
  };

  const [modalState, setModalState] = React.useState<"scratch" | "import" | "url" | null>(null);
  const [search, setSearch] = React.useState("");

  const q = search.trim().toLowerCase();
  const filtered = (skills ?? []).filter((sk) => {
    if (!q) return true;
    return (
      sk.name.toLowerCase().includes(q) ||
      sk.description.toLowerCase().includes(q) ||
      sk.type.toLowerCase().includes(q)
    );
  });

  return (
    <div style={s.column}>
      {modalState && (
        <CreateSkillModal
          initialTab={modalState}
          onClose={() => setModalState(null)}
        />
      )}

      <div style={s.headerPad}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("column.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("column.add")}
              </Button>
            }
            items={[
              {
                label: t("column.addScratch"),
                icon: "Edit",
                onClick: () => setModalState("scratch"),
              },
              {
                label: t("column.addImport"),
                icon: "Upload",
                onClick: () => setModalState("import"),
              },
              {
                label: t("column.addUrl"),
                icon: "Link",
                onClick: () => setModalState("url"),
              },
            ]}
          />
        </div>

        <TextInput
          value={search}
          onChange={setSearch}
          placeholder={t("column.search")}
        />
      </div>

      <div style={s.list}>
        {isLoading ? (
          <>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="Search"
            title={q ? t("column.emptyTitle") : t("column.emptyNoSkills")}
            body={q ? t("column.emptyBody") : t("column.emptyNoSkillsBody")}
          />
        ) : (
          filtered.map((sk) => (
            <SkillCard
              key={sk.id}
              skill={sk}
              active={sk.id === activeId}
              onClick={() => {
                // Opening another skill replaces the editor — don't drop an unsaved draft silently.
                if (sk.id !== activeId && !confirmDiscard(t("column.discardConfirm"))) return;
                router.push(`/skills/${sk.id}?tab=${tab}`);
              }}
              onToggle={(enabled) =>
                updateMutation.mutate(
                  { id: sk.id, patch: { enabled } },
                  { onError: (err) => toast.error((err as Error).message || t("column.toggleError")) },
                )
              }
              onDelete={() => handleDelete(sk)}
              deleting={deleteMutation.isPending && deleteMutation.variables === sk.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

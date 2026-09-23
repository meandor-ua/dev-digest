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

// Module-level (not component state) because navigating to /skills/[id] fully
// remounts this column — component state doesn't survive, but this does.
let savedScrollTop = 0;

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
  const listRef = React.useRef<HTMLDivElement>(null);

  // Navigating to a skill remounts this column (it's a route-level `page.tsx`
  // tree, not a persisted layout), which resets the list's scroll to the top
  // and drops the browser focus the click had put on the tile. Restore the
  // exact prior scroll offset (not scrollIntoView — the tile is already where
  // the user left it, no extra scrolling should happen) before paint, and
  // refocus the now-active card.
  React.useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = savedScrollTop;
  }, []);

  React.useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-testid="skill-card-${activeId}"]`);
    el?.focus({ preventScroll: true });
  }, [activeId]);

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

      <div
        style={s.list}
        ref={listRef}
        onScroll={(e) => {
          savedScrollTop = e.currentTarget.scrollTop;
        }}
      >
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

/* ContextTab — project docs (specs/docs/INSIGHTS.md) attached to this skill.
   Any agent using this skill inherits these documents at review time (they're
   re-read from the repo clone, not stored as content). Autosaves optimistically
   on every checkbox toggle / reorder via useSetSkillContext (rollback + toast
   on failure). Dragging reorders the full row list; only the relative order of
   the CHECKED subset is what gets persisted as `attached`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, TextInput, Checkbox, Badge, EmptyState, Skeleton, Modal, IconBtn } from "@devdigest/ui";
import type { Skill, ProjectDoc } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useSkillContext, useSetSkillContext, useContextDoc } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { CONTEXT_CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

/** A listed doc, or an attached path the repo no longer has (`category: null`). */
type ContextRowDoc = Omit<ProjectDoc, "category"> & { category: ProjectDoc["category"] | null };

function missingDoc(path: string): ContextRowDoc {
  const slash = path.lastIndexOf("/");
  return { path, dir: slash === -1 ? "" : path.slice(0, slash), category: null };
}

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { repoId, reposLoaded } = useActiveRepo();
  const { data: context, isLoading, isError } = useSkillContext(skill.id, repoId);
  const setContext = useSetSkillContext(skill.id, repoId);
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!reposLoaded || (repoId && isLoading)) {
    return (
      <div style={s.wrap}>
        <Skeleton height={28} width={220} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (!repoId) {
    return (
      <div style={s.center}>
        <EmptyState icon="Layers" title={t("context.noRepo")} body={t("context.noRepoBody")} />
      </div>
    );
  }

  if (isError || !context) {
    return (
      <div style={s.center}>
        <EmptyState icon="AlertTriangle" title={t("context.loadError")} />
      </div>
    );
  }

  const attachedSet = new Set(context.attached);
  const docByPath = new Map(context.available.map((d) => [d.path, d]));
  const unattached = context.available.filter((d) => !attachedSet.has(d.path));
  const orderedPaths = [...context.attached, ...unattached.map((d) => d.path)];
  // An attached path the repo no longer has keeps its row (so it can be
  // unchecked) but no category — the reviewer skips it, so it isn't serialized.
  const combined: ContextRowDoc[] = orderedPaths.map((p) => docByPath.get(p) ?? missingDoc(p));

  const q = filter.trim().toLowerCase();
  const filterActive = q.length > 0;
  const visible = filterActive ? combined.filter((d) => d.path.toLowerCase().includes(q)) : combined;

  const persist = (nextAttached: string[]) =>
    setContext.mutate(nextAttached, { onError: () => toast.error(t("context.saveError")) });

  const toggle = (path: string, checked: boolean) => {
    persist(checked ? [...context.attached, path] : context.attached.filter((p) => p !== path));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = combined.findIndex((d) => d.path === active.id);
    const to = combined.findIndex((d) => d.path === over.id);
    if (from === -1 || to === -1) return;
    const reordered = arrayMove(combined, from, to);
    persist(reordered.map((d) => d.path).filter((p) => attachedSet.has(p)));
  };

  const attachedByCategory = new Map<ProjectDoc["category"], string[]>();
  for (const path of context.attached) {
    const cat = docByPath.get(path)?.category;
    if (cat) attachedByCategory.set(cat, [...(attachedByCategory.get(cat) ?? []), path]);
  }

  const previewDoc = previewPath ? docByPath.get(previewPath) : undefined;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.heading")}</h2>
        <Badge color="var(--accent)" mono>
          {t("context.attachedCount", { count: context.attached.length })}
        </Badge>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("context.filterPlaceholder")} />
        </div>
      </div>
      <p style={s.subtitle}>{t("context.subtitle")}</p>

      {combined.length === 0 ? (
        <EmptyState icon="Layers" title={t("context.empty")} body={t("context.emptyBody")} />
      ) : visible.length === 0 ? (
        <EmptyState icon="Search" title={t("context.noMatch", { query: filter })} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((d) => d.path)} strategy={verticalListSortingStrategy}>
            <div style={s.list}>
              {visible.map((doc) => (
                <ContextRow
                  key={doc.path}
                  doc={doc}
                  checked={attachedSet.has(doc.path)}
                  draggable={!filterActive}
                  onToggle={(checked) => toggle(doc.path, checked)}
                  onPreview={() => setPreviewPath(doc.path)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {attachedByCategory.size > 0 && (
        <div style={s.serializesAs}>
          <span style={s.serializesAsTitle}>{t("context.serializesAs")}</span>
          {[...attachedByCategory.entries()].map(([category, paths]) => (
            <div key={category} style={s.serializesGroup}>
              <span style={s.serializesGroupTitle}>{t(`context.category.${category}`)}</span>
              {paths.map((p) => (
                <span key={p} style={s.serializesPath}>
                  {p}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {previewPath && (
        <DocPreviewModal
          repoId={repoId}
          path={previewPath}
          category={previewDoc?.category}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

function ContextRow({
  doc,
  checked,
  draggable,
  onToggle,
  onPreview,
}: {
  doc: ContextRowDoc;
  checked: boolean;
  draggable: boolean;
  onToggle: (checked: boolean) => void;
  onPreview: () => void;
}) {
  const t = useTranslations("skills");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.path,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    ...s.row(isDragging),
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const fileName = doc.path.slice(doc.path.lastIndexOf("/") + 1);

  return (
    <div ref={setNodeRef} style={style}>
      <span
        style={s.handle(!draggable)}
        aria-label={t("context.dragHandle")}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <Icon.Menu size={15} />
      </span>
      <Checkbox checked={checked} onChange={onToggle} />
      <div style={s.pathCol}>
        <span style={s.fileName}>{fileName}</span>
        {doc.dir && <span style={s.dir}>{doc.dir}</span>}
      </div>
      {doc.category ? (
        <>
          <span style={s.categoryBadge(CONTEXT_CATEGORY_COLOR[doc.category])}>
            {t(`context.category.${doc.category}`)}
          </span>
          <IconBtn icon="Eye" label={t("context.preview")} onClick={onPreview} />
        </>
      ) : (
        <span style={s.missing}>{t("context.missing")}</span>
      )}
    </div>
  );
}

function DocPreviewModal({
  repoId,
  path,
  category,
  onClose,
}: {
  repoId: string;
  path: string;
  category?: ProjectDoc["category"];
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const { data, isLoading, isError } = useContextDoc(repoId, path);

  return (
    <Modal title={path} subtitle={category ? t(`context.category.${category}`) : undefined} onClose={onClose} width={720}>
      {isLoading ? (
        <div style={{ padding: 24 }}>
          <Skeleton height={200} />
        </div>
      ) : isError || data === undefined ? (
        <div style={{ padding: 24 }}>
          <EmptyState icon="AlertTriangle" title={t("context.previewLoadError")} />
        </div>
      ) : (
        <pre style={s.previewBody}>{data.text}</pre>
      )}
    </Modal>
  );
}

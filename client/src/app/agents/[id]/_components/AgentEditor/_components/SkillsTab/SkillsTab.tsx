/* SkillsTab — shows every workspace skill: linked skills on top (drag-to-
   reorder, order is the assembled-prompt order), unlinked skills below (not
   draggable). Checking a skill's box links it to the agent (appending it to
   the bottom of the linked section); unchecking a linked skill unlinks it.
   Reordering and linking/unlinking autosave optimistically via
   useSetAgentSkills. Dragging is disabled while a filter is active (the
   visible list is a subset, so a drop index would be ambiguous). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, TextInput, Checkbox, Badge, EmptyState, Skeleton } from "@devdigest/ui";
import type { AgentSkillItem, SkillType, SkillWithStats } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_COLOR } from "@/lib/skill-type";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: linkedSkills, isLoading: linkedLoading } = useAgentSkills(agentId);
  const { data: availableSkills, isLoading: skillsLoading } = useSkills();
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");

  // Keyboard too: the handle is focusable and announces "press space to pick up".
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isLoading = linkedLoading || skillsLoading;
  const linked = linkedSkills ?? [];
  const totalCount = availableSkills?.length ?? 0;

  const linkedIds = new Set(linked.map((sk) => sk.skill_id));
  const skillsById = new Map((availableSkills ?? []).map((sk) => [sk.id, sk]));
  const unlinked = (availableSkills ?? []).filter((sk) => !linkedIds.has(sk.id));

  const filterActive = filter.trim().length > 0;
  const q = filter.trim().toLowerCase();
  const visibleLinked = filterActive ? linked.filter((sk) => sk.name.toLowerCase().includes(q)) : linked;
  const visibleUnlinked = filterActive ? unlinked.filter((sk) => sk.name.toLowerCase().includes(q)) : unlinked;

  const persist = (skillIds: string[]) =>
    setSkills.mutate(skillIds, { onError: () => toast.error(t("skills.saveError")) });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = linked.findIndex((sk) => sk.skill_id === active.id);
    const to = linked.findIndex((sk) => sk.skill_id === over.id);
    if (from === -1 || to === -1) return;
    persist(arrayMove(linked, from, to).map((sk) => sk.skill_id));
  };

  const link = (skillId: string) => persist([...linked.map((sk) => sk.skill_id), skillId]);
  const unlink = (skillId: string) =>
    persist(linked.filter((sk) => sk.skill_id !== skillId).map((sk) => sk.skill_id));

  // Escape clears a non-empty filter. An already-empty filter lets the key
  // bubble so other Escape handlers (e.g. closing overlays) still fire.
  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && filter !== "") {
      e.preventDefault();
      e.stopPropagation();
      setFilter("");
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.linkedCount", { linked: linked.length, total: totalCount })}</span>
      </div>

      {isLoading ? (
        <div style={s.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={42} />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.empty")} />
      ) : (
        <>
          <TextInput
            value={filter}
            onChange={setFilter}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterLabel")}
            onKeyDown={onFilterKeyDown}
          />
          <span style={s.hint}>{filterActive ? t("skills.filterActiveHint") : t("skills.orderHint")}</span>
          {visibleLinked.length === 0 && visibleUnlinked.length === 0 ? (
            <EmptyState icon="Search" title={t("skills.noMatch")} />
          ) : (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={visibleLinked.map((sk) => sk.skill_id)} strategy={verticalListSortingStrategy}>
                  <div style={s.list}>
                    {visibleLinked.map((sk) => (
                      <LinkedSkillRow
                        key={sk.skill_id}
                        skill={sk}
                        draggable={!filterActive}
                        onUnlink={() => unlink(sk.skill_id)}
                        isGloballyDisabled={!(skillsById.get(sk.skill_id)?.enabled ?? true)}
                        isDangerous={skillsById.get(sk.skill_id)?.is_dangerous ?? false}
                        needsVetting={
                          skillsById.get(sk.skill_id)?.source !== "manual" &&
                          !(skillsById.get(sk.skill_id)?.enabled ?? true)
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {visibleUnlinked.length > 0 && (
                <div style={s.list}>
                  {visibleUnlinked.map((sk) => (
                    <UnlinkedSkillRow key={sk.id} skill={sk} onLink={() => link(sk.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function LinkedSkillRow({
  skill,
  draggable,
  onUnlink,
  isGloballyDisabled,
  isDangerous,
  needsVetting,
}: {
  skill: AgentSkillItem;
  draggable: boolean;
  onUnlink: () => void;
  isGloballyDisabled: boolean;
  isDangerous: boolean;
  needsVetting: boolean;
}) {
  const t = useTranslations("agents");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.skill_id,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    ...s.row(isDragging),
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    <div ref={setNodeRef} style={style}>
      <span
        style={s.handle(!draggable)}
        {...(draggable
          ? { ...attributes, ...listeners, "aria-label": t("skills.dragHandle", { name: skill.name }) }
          : { "aria-hidden": true })}
      >
        <Icon.Menu size={15} />
      </span>
      <Checkbox checked onChange={onUnlink} aria-label={t("skills.unlink", { name: skill.name })} />
      <div style={s.nameCol}>
        <span style={s.name(true)}>{skill.name}</span>
      </div>
      {isDangerous && (
        <span title={t("skills.globallyDangerous")}>
          <Badge color="var(--crit)" bg="var(--crit-bg)" style={s.disabledBadge}>
            {t("skills.dangerousLabel")}
          </Badge>
        </span>
      )}
      {needsVetting ? (
        <span title={t("skills.needsVettingTitle")}>
          <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.disabledBadge}>
            {t("skills.needsVettingLabel")}
          </Badge>
        </span>
      ) : (
        isGloballyDisabled && (
          <span title={t("skills.globallyDisabled")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.disabledBadge}>
              {t("skills.disabledLabel")}
            </Badge>
          </span>
        )
      )}
      <span style={s.badge(color)}>{skill.type}</span>
    </div>
  );
}

function UnlinkedSkillRow({ skill, onLink }: { skill: SkillWithStats; onLink: () => void }) {
  const t = useTranslations("agents");
  const color = SKILL_TYPE_COLOR[skill.type as SkillType];
  const isGloballyDisabled = !skill.enabled;
  const isDangerous = skill.is_dangerous;
  const needsVetting = skill.source !== "manual" && !skill.enabled;
  const cannotLink = isGloballyDisabled || isDangerous;
  return (
    <div style={s.row(false)}>
      <span style={s.handle(true)} aria-hidden="true">
        <Icon.Menu size={15} />
      </span>
      <span
        style={cannotLink ? s.disabledCheckbox : undefined}
        title={
          isDangerous
            ? t("skills.globallyDangerous")
            : needsVetting
              ? t("skills.needsVettingTitle")
              : isGloballyDisabled
                ? t("skills.globallyDisabled")
                : undefined
        }
      >
        <Checkbox
          checked={false}
          onChange={cannotLink ? undefined : onLink}
          aria-label={t("skills.link", { name: skill.name })}
        />
      </span>
      <div style={s.nameCol}>
        <span style={s.name(false)}>{skill.name}</span>
      </div>
      {isDangerous && (
        <span title={t("skills.globallyDangerous")}>
          <Badge color="var(--crit)" bg="var(--crit-bg)" style={s.disabledBadge}>
            {t("skills.dangerousLabel")}
          </Badge>
        </span>
      )}
      {needsVetting ? (
        <span title={t("skills.needsVettingTitle")}>
          <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.disabledBadge}>
            {t("skills.needsVettingLabel")}
          </Badge>
        </span>
      ) : (
        isGloballyDisabled && (
          <span title={t("skills.globallyDisabled")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.disabledBadge}>
              {t("skills.disabledLabel")}
            </Badge>
          </span>
        )
      )}
      <span style={s.badge(color)}>{skill.type}</span>
    </div>
  );
}

/* SkillsTab — drag-to-reorder + enable/disable the skills linked to an agent.
   Order is the assembled-prompt order; reordering and toggling autosave
   optimistically via useSetAgentSkills. Dragging is disabled while a filter is
   active (the visible list is a subset, so a drop index would be ambiguous). */
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
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, TextInput, Checkbox, EmptyState, Skeleton, Button, Dropdown } from "@devdigest/ui";
import type { AgentSkillItem } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SKILL_TYPE_COLOR } from "./constants";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: skills, isLoading } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const ordered = skills ?? [];
  const filterActive = filter.trim().length > 0;
  const q = filter.trim().toLowerCase();
  const visible = filterActive ? ordered.filter((sk) => sk.name.toLowerCase().includes(q)) : ordered;

  const { data: availableSkills } = useSkills();

  const persist = (next: AgentSkillItem[]) =>
    setSkills.mutate(
      next.map((sk) => ({ skill_id: sk.skill_id, enabled: sk.enabled })),
      { onError: () => toast.error(t("skills.saveError")) },
    );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((sk) => sk.skill_id === active.id);
    const to = ordered.findIndex((sk) => sk.skill_id === over.id);
    if (from === -1 || to === -1) return;
    persist(arrayMove(ordered, from, to));
  };

  const toggle = (skillId: string, enabled: boolean) =>
    persist(ordered.map((sk) => (sk.skill_id === skillId ? { ...sk, enabled } : sk)));

  const attachSkill = (skillId: string) => {
    const skill = availableSkills?.find((s) => s.id === skillId);
    if (!skill) return;
    const next = [
      ...ordered,
      {
        agent_id: agentId,
        skill_id: skillId,
        name: skill.name,
        type: skill.type,
        enabled: true,
        order: ordered.length,
      },
    ];
    persist(next);
  };

  const detachSkill = (skillId: string) => {
    const next = ordered.filter((sk) => sk.skill_id !== skillId);
    persist(next);
  };

  // Skills not yet linked
  const unlinkedSkills = availableSkills?.filter(
    (s) => !ordered.some((sk) => sk.skill_id === s.id)
  ) ?? [];

  // Escape clears a non-empty filter. An already-empty filter lets the key
  // bubble so other Escape handlers (e.g. closing overlays) still fire.
  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && filter !== "") {
      e.preventDefault();
      e.stopPropagation();
      setFilter("");
    }
  };

  const enabledCount = ordered.filter((sk) => sk.enabled).length;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabledCount, total: ordered.length })}</span>
        {unlinkedSkills.length > 0 && (
          <div style={s.attach}>
            <Dropdown
              width={260}
              align="right"
              trigger={
                <Button kind="secondary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("skills.attach")}
                </Button>
              }
              items={unlinkedSkills.map((sk) => ({
                label: sk.name,
                icon: "Sparkles" as const,
                hint: sk.enabled ? sk.type : t("skills.attachDisabledHint"),
                onClick: () => attachSkill(sk.id),
              }))}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={s.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={42} />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.empty")} />
      ) : (
        <>
          <TextInput
            value={filter}
            onChange={setFilter}
            placeholder={t("skills.filterPlaceholder")}
            onKeyDown={onFilterKeyDown}
          />
          <span style={s.hint}>{filterActive ? t("skills.filterActiveHint") : t("skills.orderHint")}</span>
          {visible.length === 0 ? (
            <EmptyState icon="Search" title={t("skills.noMatch")} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={visible.map((sk) => sk.skill_id)} strategy={verticalListSortingStrategy}>
                <div style={s.list}>
                  {visible.map((sk) => {
                    const globalSkill = availableSkills?.find((s) => s.id === sk.skill_id);
                    return (
                      <SkillRow
                        key={sk.skill_id}
                        skill={sk}
                        draggable={!filterActive}
                        onToggle={(enabled) => toggle(sk.skill_id, enabled)}
                        onDetach={() => detachSkill(sk.skill_id)}
                        isGloballyDisabled={globalSkill ? !globalSkill.enabled : false}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}

function SkillRow({
  skill,
  draggable,
  onToggle,
  onDetach,
  isGloballyDisabled,
}: {
  skill: AgentSkillItem;
  draggable: boolean;
  onToggle: (enabled: boolean) => void;
  onDetach: () => void;
  isGloballyDisabled: boolean;
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
        aria-label={t("skills.dragHandle")}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <Icon.Menu size={15} />
      </span>
      <Checkbox checked={skill.enabled} onChange={onToggle} />
      <div style={s.nameCol}>
        <span style={s.name(skill.enabled)}>{skill.name}</span>
        {isGloballyDisabled && <div style={s.disabledHint}>{t("skills.globallyDisabled")}</div>}
      </div>
      <span style={s.badge(color)}>{skill.type}</span>
      <Button
        kind="ghost"
        size="sm"
        icon="X"
        onClick={onDetach}
        title={t("skills.detach")}
        aria-label={t("skills.detach")}
      />
    </div>
  );
}

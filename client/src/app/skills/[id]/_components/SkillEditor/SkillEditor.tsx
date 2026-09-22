"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab, useSkillDraft } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { SKILL_TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  // Owned here, not in ConfigTab, so Preview renders the unsaved body too.
  const draftState = useSkillDraft(skill);
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(`editor.tabs.${tb.key}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>

      <div style={s.body}>
        {/* ConfigTab stays mounted to preserve unsaved form edits across tab switching */}
        <div style={{ display: tab === "config" ? "block" : "none", height: "100%" }}>
          <ConfigTab skill={skill} state={draftState} />
        </div>

        {tab === "context" && <ContextTab skill={skill} />}
        {tab === "preview" && (
          <PreviewTab
            body={draftState.draft.body}
            dirty={draftState.dirty}
            version={skill.version}
            onRestore={draftState.reset}
          />
        )}
        {tab === "evals" && <EvalsTab />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}

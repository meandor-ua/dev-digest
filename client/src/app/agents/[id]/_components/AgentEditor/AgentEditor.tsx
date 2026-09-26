/* AgentEditor — five-tab agent editor (Config · Skills · Evals · Stats · CI).
   ConfigTab stays mounted (hidden) so unsaved edits survive tab switches;
   Evals and CI are placeholders. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { StatsTab } from "./_components/StatsTab";
import { EmptyTab } from "./_components/EmptyTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({
  agent,
  tab,
  onTab,
  repoId,
}: {
  agent: Agent;
  tab: string;
  onTab: (t: string) => void;
  repoId: string | null;
}) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        <div style={{ display: tab === "config" ? "block" : "none", height: "100%" }}>
          <ConfigTab agent={agent} />
        </div>
        {tab === "skills" && <SkillsTab agentId={agent.id} />}
        {tab === "stats" && <StatsTab agentId={agent.id} agentName={agent.name} repoId={repoId} />}
        {tab === "evals" && (
          <EmptyTab icon="FlaskConical" title={t("empty.evalsTitle")} body={t("empty.evalsBody")} />
        )}
        {tab === "ci" && <EmptyTab icon="GitBranch" title={t("empty.ciTitle")} body={t("empty.ciBody")} />}
      </div>
    </div>
  );
}

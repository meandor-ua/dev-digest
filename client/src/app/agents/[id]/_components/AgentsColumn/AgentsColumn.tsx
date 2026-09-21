/* AgentsColumn — the editor page's left rail: an "Add Agent" menu and the list
   of agent cards (repo-scoped stats), each linking to the editor while keeping
   the current tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import { AgentCard } from "../../../_components/AgentCard";
import { CreateAgentModal } from "../../../_components/AgentsListView/_components/CreateAgentModal";
import { TEMPLATES } from "../../../_components/AgentsListView/constants";
import { useAgents, useUpdateAgent, useAgentCardStats } from "../../../../../lib/hooks/agents";
import { useActiveRepo } from "../../../../../lib/repo-context";
import { s } from "./styles";

export function AgentsColumn({ activeId, tab }: { activeId: string; tab: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents } = useAgents();
  const update = useUpdateAgent();
  const { repoId } = useActiveRepo();
  const { data: cardStats } = useAgentCardStats(repoId);
  const [creating, setCreating] = React.useState(false);

  const statsById = React.useMemo(
    () => new Map((cardStats ?? []).map((cs) => [cs.agent_id, cs])),
    [cardStats],
  );

  return (
    <div style={s.column}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.headerPad}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("list.breadcrumb")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.addAgent")}
              </Button>
            }
            items={[
              { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { divider: true },
              ...TEMPLATES.map((tp) => ({
                label: tp,
                icon: "Cpu" as const,
                muted: true,
                onClick: () => setCreating(true),
              })),
            ]}
          />
        </div>
      </div>
      <div style={s.list}>
        {(agents ?? []).map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            stats={statsById.get(a.id)}
            onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}

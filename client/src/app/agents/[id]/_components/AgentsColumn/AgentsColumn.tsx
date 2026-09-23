/* AgentsColumn — the editor page's left rail: an "Add Agent" menu and the list
   of agent cards (repo-scoped stats), each linking to the editor while keeping
   the current tab. Owns delete (confirm + toast) so it can redirect to
   /agents when the deleted agent is the one currently open — otherwise the
   editor pane is left showing a dangling, deleted agent. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { Button, Dropdown } from "@devdigest/ui";
import { AgentCard } from "../../../_components/AgentCard";
import { CreateAgentModal, TEMPLATES } from "../../../_components/CreateAgentModal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAgents, useUpdateAgent, useDeleteAgent, useAgentCardStats } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

// Module-level (not component state) because navigating to /agents/[id] fully
// remounts this column — component state doesn't survive, but this does.
let savedScrollTop = 0;

export function AgentsColumn({ activeId, tab }: { activeId: string; tab: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents } = useAgents();
  const update = useUpdateAgent();
  const del = useDeleteAgent();
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const { data: cardStats } = useAgentCardStats(repoId);
  const [creating, setCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Agent | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Navigating to an agent remounts this column (it's a route-level `page.tsx`
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
    const el = listRef.current?.querySelector<HTMLElement>(`[data-testid="agent-card-${activeId}"]`);
    el?.focus({ preventScroll: true });
  }, [activeId]);

  const confirmDelete = () => {
    const ag = pendingDelete;
    if (!ag) return;
    setPendingDelete(null);
    del.mutate(ag.id, {
      onSuccess: () => {
        toast.success(t("card.deleteSuccess", { name: ag.name }));
        // Deleting the open agent leaves its editor dangling — redirect to the list.
        if (ag.id === activeId) router.push("/agents");
      },
      onError: (err) => {
        toast.error((err as Error).message || t("card.deleteError"));
      },
    });
  };

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
      <div
        style={s.list}
        ref={listRef}
        onScroll={(e) => {
          savedScrollTop = e.currentTarget.scrollTop;
        }}
      >
        {(agents ?? []).map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            stats={statsById.get(a.id)}
            onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
            onDelete={() => setPendingDelete(a)}
            deleting={del.isPending && del.variables === a.id}
          />
        ))}
      </div>
      {pendingDelete && (
        <ConfirmDialog
          message={t("card.confirmDelete", { name: pendingDelete.name })}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

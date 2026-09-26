/* /agents — Agents list (A2, L03). AgentCards + create. Selecting an agent
   navigates to the 5-tab editor at /agents/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAgents, useUpdateAgent, useDeleteAgent, useAgentCardStats } from "../../../../lib/hooks/agents";
import { useActiveRepo } from "../../../../lib/repo-context";
import { useToast } from "../../../../lib/toast";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal, TEMPLATES } from "../CreateAgentModal";
import { filterAgents } from "../../_lib/filter-agents";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const del = useDeleteAgent();
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const { data: cardStats } = useAgentCardStats(repoId);
  const statsById = React.useMemo(
    () => new Map((cardStats ?? []).map((cs) => [cs.agent_id, cs])),
    [cardStats],
  );
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<Agent | null>(null);

  const confirmDelete = () => {
    const ag = pendingDelete;
    if (!ag) return;
    setPendingDelete(null);
    del.mutate(ag.id, {
      onSuccess: () => toast.success(t("card.deleteSuccess", { name: ag.name })),
      onError: (err) => toast.error((err as Error).message || t("card.deleteError")),
    });
  };

  const list = filterAgents(agents ?? [], search);

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      {pendingDelete && (
        <ConfirmDialog
          message={t("card.confirmDelete", { name: pendingDelete.name })}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("list.title")}</h1>
            <p style={s.subtitle}>{t("list.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
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

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                stats={statsById.get(a.id)}
                onClick={() => router.push(`/agents/${a.id}?tab=config`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
                onDelete={() => setPendingDelete(a)}
                deleting={del.isPending && del.variables === a.id}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

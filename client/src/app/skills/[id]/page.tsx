"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../components/app-shell";
import { SkillsColumn } from "../_components/SkillsColumn";
import { SkillEditor } from "./_components/SkillEditor";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { useSkill, useDeleteSkill } from "../../../lib/hooks/skills";
import { useToast } from "../../../lib/toast";
import { ApiError } from "../../../lib/api";

const VALID_TABS = ["config", "context", "preview", "evals", "stats", "versions"];

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("skills");
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const deleteMutation = useDeleteSkill();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.header") },
  ];

  const handleDelete = () => {
    if (!skill) return;
    if (confirm(t("detail.confirmDelete", { name: skill.name }))) {
      deleteMutation.mutate(skill.id, {
        onSuccess: () => {
          toast.success(t("detail.deleteSuccess", { name: skill.name }));
          router.push("/skills");
        },
        onError: (err) => {
          toast.error((err as Error).message || t("detail.deleteError"));
        },
      });
    }
  };

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadError")}
          body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <SkillsColumn activeId={id} tab={tab} />

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            {/* Header bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 28px 12px",
                flexShrink: 0,
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{skill.name}</h1>
              <Badge color="var(--accent)" mono>
                {skill.type}
              </Badge>
              <Badge color="var(--text-secondary)" mono>
                v{skill.version}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("detail.disabled")}</Badge>}
              {skill.source !== "manual" && !skill.enabled && (
                <span title={t("listItem.vettingTitle")}>
                  <Badge color="var(--warning)">
                    {t("listItem.needsVetting")}
                  </Badge>
                </span>
              )}

              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Trash"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {t("detail.delete")}
                </Button>
              </div>
            </div>

            {/* Editor content */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

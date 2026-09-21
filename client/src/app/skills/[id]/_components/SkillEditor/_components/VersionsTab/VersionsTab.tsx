"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { diffLines } from "./diff";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError } = useSkillVersions(skill.id);
  const restoreMutation = useRestoreSkill();

  const [expandedVersions, setExpandedVersions] = React.useState<Set<number>>(new Set([skill.version]));

  const toggleExpand = (ver: number) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(ver)) next.delete(ver);
      else next.add(ver);
      return next;
    });
  };

  const handleRestore = (ver: number) => {
    restoreMutation.mutate(
      { id: skill.id, version: ver },
      {
        onSuccess: (updated) => {
          toast.success(t("versions.restoreSuccess", { version: ver, updated: updated.version }));
        },
        onError: (err) => {
          toast.error((err as Error).message || t("versions.restoreError"));
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={32} width={200} />
        <Skeleton height={80} />
        <Skeleton height={80} />
      </div>
    );
  }

  if (isError || !versions || versions.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="History"
          title={t("versions.noHistory")}
          body={t("versions.noHistoryBody")}
        />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {t("versions.recorded", { count: versions.length })}
        </span>
      </div>

      <div style={s.list}>
        {versions.map((ver) => {
          const isCurrent = ver.version === skill.version;
          const isExpanded = expandedVersions.has(ver.version);
          const dateStr = new Date(ver.created_at).toLocaleString();

          return (
            <div key={ver.version} style={s.versionCard(isCurrent)}>
              <div style={s.cardHeader}>
                <div style={s.leftMeta}>
                  <span style={s.versionBadge}>v{ver.version}</span>
                  {isCurrent && (
                    <Badge color="var(--accent)" mono>
                      {t("versions.currentBadge")}
                    </Badge>
                  )}
                  <span style={s.dateText}>{dateStr}</span>
                </div>

                <div style={s.actionsRow}>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon={isExpanded ? "ChevronDown" : "ChevronRight"}
                    onClick={() => toggleExpand(ver.version)}
                  >
                    {isExpanded ? t("versions.hideBody") : t("versions.viewBody")}
                  </Button>
                  {!isCurrent && (
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="RefreshCw"
                      onClick={() => handleRestore(ver.version)}
                      disabled={restoreMutation.isPending}
                    >
                      {t("versions.restore")}
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div style={s.diffContainer}>
                  {isCurrent ? (
                    // For current version, just show the body as-is
                    <div style={s.bodyPreview}>{ver.body}</div>
                  ) : (
                    // For past versions, show the diff
                    <VersionDiff from={ver.body} to={skill.body} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Line diff from an old version to the current body — O(n·m), so memoised on the two bodies. */
function VersionDiff({ from, to }: { from: string; to: string }) {
  const lines = React.useMemo(() => diffLines(from, to), [from, to]);
  return (
    <div>
      {lines.map((line, idx) => (
        <div key={idx} style={s.diffLine(line.kind)}>
          {line.kind === "add" && <span>+ </span>}
          {line.kind === "del" && <span>- </span>}
          {line.text}
        </div>
      ))}
    </div>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffLines } from "./diff";
import { s } from "./styles";

/** YYYY-MM-DD (UTC — deterministic regardless of the viewer's timezone). */
function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError } = useSkillVersions(skill.id);
  const restoreMutation = useRestoreSkill();

  const [expandedVersions, setExpandedVersions] = React.useState<Set<number>>(new Set());

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
        <Badge color="var(--text-secondary)" mono>
          {t("versions.count", { count: versions.length })}
        </Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.list}>
        {versions.map((ver) => {
          const isCurrent = ver.version === skill.version;
          const isExpanded = expandedVersions.has(ver.version);
          // What this save changed: diff against the version right before it.
          const prev = versions.find((v) => v.version === ver.version - 1);

          return (
            <div key={ver.version} style={s.versionCard(isCurrent)}>
              <div style={s.cardHeader}>
                <div style={s.leftMeta}>
                  <span style={s.versionBadge(isCurrent)} data-current={isCurrent}>
                    v{ver.version}
                  </span>
                  <div style={s.messageCol}>
                    <span style={s.messageText}>{ver.message || t("versions.savedBodyFallback")}</span>
                    <span style={s.dateText}>{formatDate(ver.created_at)}</span>
                  </div>
                </div>

                <div style={s.actionsRow}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => toggleExpand(ver.version)}>
                    {t("versions.diff")}
                  </Button>
                  {isCurrent ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                      {t("versions.currentBadge")}
                    </Badge>
                  ) : (
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
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
                  <div style={s.diffLabel}>
                    {prev ? t("versions.diffFrom", { version: prev.version }) : t("versions.diffInitial")}
                  </div>
                  <VersionDiff from={prev?.body ?? ""} to={ver.body} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Line diff between two version bodies — O(n·m), so memoised on the two bodies. */
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

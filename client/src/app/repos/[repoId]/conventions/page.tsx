/* Conventions Extractor — /repos/:repoId/conventions. Scans the cloned repo
   for house rules it already follows and lets a maintainer accept/reject/edit
   them before merging the accepted set into a `repo-conventions` skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, usePatchConvention, useDeleteConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { githubBlobUrl } from "@/lib/github-urls";
import { ApiError } from "@/lib/api";
import { TRIAGE_FILTERS, type TriageFilter } from "./constants";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: candidates, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const del = useDeleteConvention(repoId);

  const [filter, setFilter] = React.useState<TriageFilter>("all");
  const [showCreate, setShowCreate] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? repoId ?? t("page.repoFallback");
  const list = candidates ?? [];
  const acceptedCount = list.filter((c) => c.status === "accepted").length;

  const filtered = filter === "all" ? list : list.filter((c) => c.status === filter);

  const setStatus = (id: string, status: "pending" | "accepted" | "rejected") => {
    setSavingId(id);
    patch.mutate({ id, patch: { status } }, { onSettled: () => setSavingId(null) });
  };

  const deselectAll = () => {
    for (const c of list) {
      if (c.status === "accepted") patch.mutate({ id: c.id, patch: { status: "pending" } });
    }
  };

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            {repoName}
          </h1>
          <p style={s.pageSubtitle}>
            {extract.isPending
              ? t("page.scanningHint")
              : list.length > 0
                ? t("page.candidateCount", { count: list.length })
                : t("page.subtitle")}
          </p>
        </div>
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            size="md"
            icon="RefreshCw"
            loading={extract.isPending}
            onClick={() => extract.mutate()}
          >
            {extract.isPending ? t("page.scanning") : list.length > 0 ? t("page.rescan") : t("page.runExtraction")}
          </Button>
        </div>
      </div>

      {list.length > 0 && (
        <div style={s.toolbar}>
          <div style={s.toolbarLeft}>
            {TRIAGE_FILTERS.map((f) => (
              <Button key={f} kind={filter === f ? "primary" : "secondary"} size="sm" onClick={() => setFilter(f)}>
                {t(`page.filters.${f}`)} ({f === "all" ? list.length : list.filter((c) => c.status === f).length})
              </Button>
            ))}
            <button type="button" style={s.linkBtn} onClick={deselectAll} disabled={acceptedCount === 0}>
              {t("page.deselectAll")}
            </button>
            <span style={s.acceptedCount}>{t("page.acceptedOf", { accepted: acceptedCount, total: list.length })}</span>
          </div>
          <Button kind="primary" size="md" icon="Sparkles" disabled={acceptedCount === 0} onClick={() => setShowCreate(true)}>
            {t("page.createSkill")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div style={s.loadingStack}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={140} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : t("page.loadError")}
          onRetry={() => refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={() => extract.mutate()}
          ctaLoading={extract.isPending}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="ListChecks" title={t("page.noneInFilter")} body="" />
      ) : (
        <div style={s.cardsList}>
          {filtered.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              evidenceUrl={
                activeRepo
                  ? githubBlobUrl(
                      activeRepo.full_name,
                      activeRepo.default_branch,
                      c.evidence_path,
                      c.evidence_line ?? undefined,
                      c.evidence_line_end ?? undefined,
                    )
                  : null
              }
              saving={savingId === c.id}
              onAccept={() => setStatus(c.id, c.status === "accepted" ? "pending" : "accepted")}
              onReject={() => setStatus(c.id, c.status === "rejected" ? "pending" : "rejected")}
              onSave={(p) => {
                setSavingId(c.id);
                patch.mutate({ id: c.id, patch: p }, { onSettled: () => setSavingId(null) });
              }}
              onDelete={() => del.mutate(c.id)}
            />
          ))}
        </div>
      )}

      {showCreate && repoId && (
        <CreateSkillModal repoId={repoId} repoName={repoName} onClose={() => setShowCreate(false)} />
      )}
    </AppShell>
  );
}

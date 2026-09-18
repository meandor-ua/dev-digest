/* PRRow — one clickable row in the PR list table.

   The cells below are hand-ordered (there is no render-from-array): their
   physical order MUST match `COLUMN_KEYS` and `GRID` in ../../constants.ts —
   pullRequest | author | size | score | findings | status | cost | actions |
   updated. A partial reorder is worse than none. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsBySeverityBadge } from "@/components/findings-by-severity";
import { RunReviewDropdown } from "@/components/run-review-dropdown";
import { usePrReviews, usePrActiveRuns, useRefreshWhenRunsSettle } from "../../../../../../lib/hooks/reviews";
import { activeFindings } from "../../../../../../lib/findings";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  // Only a row whose review was just started polls its active runs; idle rows
  // issue no extra requests. Settling refreshes ["pulls"] so score / findings /
  // cost update in place.
  const qc = useQueryClient();
  const [watching, setWatching] = React.useState(false);
  const watchStart = React.useRef(0);
  const { data: activeRuns, dataUpdatedAt } = usePrActiveRuns(watching ? pr.id : null);
  const activeIds = React.useMemo(() => (activeRuns ?? []).map((r) => r.run_id), [activeRuns]);
  useRefreshWhenRunsSettle(pr.id, activeRuns ? activeIds : undefined);
  React.useEffect(() => {
    // Ignore a cached (pre-click) empty result: only a fetch made after the
    // click can say the runs are done.
    if (watching && activeRuns && activeRuns.length === 0 && dataUpdatedAt > watchStart.current)
      setWatching(false);
  }, [watching, activeRuns, dataUpdatedAt]);

  // Lazy — only fetched once the FINDINGS badge is actually hovered/opened,
  // so the list page doesn't fire one reviews request per row up front.
  const { data: reviews } = usePrReviews(pr.id, { enabled: findingsOpen });
  // The badge's counts (pr.findings_by_severity) come from the server scoped
  // to the SAME review (kind === "review") — reviews[0] can be a newer
  // "summary" row, so picking it here would show a different review's
  // findings than the count in the popover's own title.
  // ACTIVE (non-dismissed) only, like every other FindingsBySeverityBadge call
  // site — the badge's own counts come from the server's `findings_by_severity`,
  // which is active-only too, so an unfiltered popover would list more rows than
  // the badge it hangs off claims to have.
  const reviewRecord = reviews?.find((r) => r.kind === "review");
  const popoverFindings = reviewRecord ? activeFindings(reviewRecord.findings) : undefined;
  // Clicking a severity chip lands on the PR's Agent-runs tab, pre-filtered.
  // `run_id` rides along only when the lazily-fetched review is already in
  // hand — never worth an extra request just to build a link.
  // Same key the Review-runs accordions use (`reviewRunRowKey`): a review with
  // no run (the seeded one) is addressed by its own id.
  const popoverRunId = reviewRecord ? (reviewRecord.run_id ?? reviewRecord.id) : null;
  const deepLink = (sev: string) => {
    const qs = new URLSearchParams({ tab: "findings", severity: sev });
    if (popoverRunId) qs.set("agent", popoverRunId);
    return `/repos/${repoId}/pulls/${pr.number}?${qs.toString()}`;
  };
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {/* Score thresholds (green ≥75, amber ≥50, red below), same as the
            PR page; a 0 score shows no ring. */}
        {pr.score ? (
          <CircularScore score={pr.score} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.findingsCell} data-testid="findings-cell">
        {/* No review yet → no badge at all (findings_by_severity absent),
            mirroring the "no runs — no cost badge" convention below. */}
        {pr.findings_by_severity && (
          <span onClick={(e) => e.stopPropagation()}>
            <FindingsBySeverityBadge
              counts={pr.findings_by_severity}
              findings={popoverFindings}
              onOpenChange={setFindingsOpen}
              compact
              /* Cross-page navigate (per-call-site click contract): the page is
                 being left, so the popover is deliberately NOT pinned here. */
              onSeverityClick={(sev) => router.push(deepLink(sev))}
            />
          </span>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell} data-testid="cost-cell">
        {/* No runs at all → no badge (not even "—"); a run exists but its
            cost is unknown → RunCostBadge shows "—". */}
        {pr.cost_usd !== undefined && <RunCostBadge costUsd={pr.cost_usd} />}
      </div>
      <div style={s.actionsCell} data-testid="actions-cell" onClick={(e) => e.stopPropagation()}>
        {/* stopPropagation so opening the menu doesn't also fire the row's own
            router.push — the same wrapper pattern the Findings cell uses.
            `menuPortal` because `tableCard` is `overflow: hidden`.
            `pr.id` is nullish in the contract — nothing to run without one. */}
        {watching && (
          <span style={s.runningChip} data-testid="running-chip">
            <Icon.RefreshCw size={12} style={{ animation: "ddspin 1s linear infinite" }} />
            {t("runReview.running")}
          </span>
        )}
        {pr.id && (
          <RunReviewDropdown
            prId={pr.id}
            kind="ghost"
            menuPortal
            onRunsStarted={() => {
              watchStart.current = Date.now();
              // The ["pr-active-runs"] cache is shared with the PR page and may
              // hold a still-fresh [] from before this click — without this the
              // row trusts it, never polls, and the chip never clears.
              qc.invalidateQueries({ queryKey: ["pr-active-runs", pr.id] });
              setWatching(true);
            }}
          />
        )}
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}

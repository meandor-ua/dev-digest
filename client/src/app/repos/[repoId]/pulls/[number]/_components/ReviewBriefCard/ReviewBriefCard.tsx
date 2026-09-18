/* ReviewBriefCard — the PR BRIEF on the Overview tab. Props-only: every value
   is already loaded by the page (the same numbers the PR list shows), so
   nothing here fetches or calls an LLM. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { verdictFromCounts } from "@/lib/findings";
import { formatTokens } from "@/lib/tokens";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

export interface ReviewBriefCardProps {
  score: number | null | undefined;
  counts: Partial<Record<Severity, number>> | null | undefined;
  costUsd: number | null | undefined;
  tokensIn?: number;
  tokensOut?: number;
  summary: string | null | undefined;
}

export function ReviewBriefCard({
  score,
  counts,
  costUsd,
  tokensIn,
  tokensOut,
  summary,
}: ReviewBriefCardProps) {
  const t = useTranslations("prReview");

  if (counts == null && score == null) {
    return (
      <div style={s.empty}>
        <Icon.Sparkles size={20} />
        <div>
          <div style={s.emptyTitle}>{t("brief.notReviewedTitle")}</div>
          <div style={s.emptyBody}>{t("brief.notReviewedBody")}</div>
        </div>
      </div>
    );
  }

  const c = counts ?? {};
  const findingsCount = (c.CRITICAL ?? 0) + (c.WARNING ?? 0) + (c.SUGGESTION ?? 0);
  const hasTokens = !!tokensIn || !!tokensOut;
  const footer =
    costUsd !== undefined || hasTokens ? (
      <div style={s.footer}>
        {costUsd !== undefined && <RunCostBadge costUsd={costUsd} />}
        {hasTokens && <span className="mono">{formatTokens(tokensIn ?? 0, tokensOut ?? 0)}</span>}
      </div>
    ) : undefined;

  return (
    <VerdictBanner
      verdict={verdictFromCounts(c)}
      summary={summary ?? null}
      score={score ?? null}
      findingsCount={findingsCount}
      blockers={c.CRITICAL ?? 0}
      footer={footer}
    />
  );
}

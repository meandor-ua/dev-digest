"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { ReviewBriefCard, type ReviewBriefCardProps } from "../ReviewBriefCard/ReviewBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  brief: ReviewBriefCardProps;
}

export function OverviewTab({ prBody, brief }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <section>
        <SectionLabel icon="FileText">{t("brief.title")}</SectionLabel>
        <ReviewBriefCard {...brief} />
      </section>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

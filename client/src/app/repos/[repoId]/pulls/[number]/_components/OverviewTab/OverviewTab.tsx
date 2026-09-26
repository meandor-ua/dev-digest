"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReviewBriefCard, type ReviewBriefCardProps } from "../ReviewBriefCard/ReviewBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  brief: ReviewBriefCardProps;
}

// Mirrors the markdown rendering used by the skills Preview tab so PR
// descriptions get the same rich formatting (headings, lists, code blocks).
const MD: Components = {
  h1: ({ children }) => <h1 style={s.mdH1}>{children}</h1>,
  h2: ({ children }) => <h2 style={s.mdH2}>{children}</h2>,
  h3: ({ children }) => <h3 style={s.mdH3}>{children}</h3>,
  h4: ({ children }) => <h4 style={s.mdH3}>{children}</h4>,
  p: ({ children }) => <p style={s.mdP}>{children}</p>,
  ul: ({ children }) => <ul style={s.mdUl}>{children}</ul>,
  ol: ({ children }) => <ol style={s.mdOl}>{children}</ol>,
  li: ({ children }) => <li style={s.mdLi}>{children}</li>,
  strong: ({ children }) => <strong style={s.mdStrong}>{children}</strong>,
  pre: ({ children }) => <pre style={s.mdPre}>{children}</pre>,
  code: ({ children }) => <code style={s.mdCode}>{children}</code>,
  table: ({ children }) => (
    <div style={s.mdTableWrap}>
      <table style={s.mdTable}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={s.mdThead}>{children}</thead>,
  th: ({ children }) => <th style={s.mdTh}>{children}</th>,
  td: ({ children }) => <td style={s.mdTd}>{children}</td>,
};

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
          <div style={s.descriptionBox}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
              {prBody}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </>
  );
}

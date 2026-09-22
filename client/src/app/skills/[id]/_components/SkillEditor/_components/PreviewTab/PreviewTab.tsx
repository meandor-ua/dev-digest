"use client";

import React from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button } from "@devdigest/ui";
import { s } from "./styles";

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
};

/**
 * Renders the Config tab's current body — unsaved edits included — as the
 * reviewing agent would receive it once saved. Restore drops those edits.
 */
export function PreviewTab({
  body,
  dirty,
  version,
  onRestore,
}: {
  body: string;
  dirty: boolean;
  version: number;
  onRestore: () => void;
}) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("preview.title")}</h2>
          {dirty && (
            <Badge color="var(--warn)" mono>
              {t("preview.draftBadge")}
            </Badge>
          )}
        </div>
        <Button kind="secondary" size="sm" icon="History" onClick={onRestore} disabled={!dirty}>
          {t("preview.restore", { version })}
        </Button>
      </div>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>

      <div style={s.previewContainer}>
        <div style={s.markdownBody}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
            {body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

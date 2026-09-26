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
  table: ({ children }) => (
    <div style={s.mdTableWrap}>
      <table style={s.mdTable}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={s.mdThead}>{children}</thead>,
  th: ({ children }) => <th style={s.mdTh}>{children}</th>,
  td: ({ children }) => <td style={s.mdTd}>{children}</td>,
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
  // Skill bodies can be imported from untrusted sources. react-markdown already
  // drops raw HTML and `javascript:` URLs; on top of that, never fetch a
  // remote image just by opening Preview (a tracking-pixel / IP leak), and
  // open links away from the app with no opener access.
  const components = React.useMemo<Components>(
    () => ({
      ...MD,
      img: ({ src, alt }) => (
        <span style={s.mdImagePlaceholder} title={typeof src === "string" ? src : undefined}>
          {t("preview.imagePlaceholder", { alt: alt || "—" })}
        </span>
      ),
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      ),
    }),
    [t],
  );

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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const estimatedTokens = Math.ceil(skill.body.length / 4);
  const section = t("preview.section");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("preview.title")}</h2>
        <Badge mono color="var(--accent)">
          {t("preview.tokens", { count: estimatedTokens })}
        </Badge>
      </div>

      <div style={s.hintBox}>
        <Icon.Info size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span>
          {t.rich("preview.hint", { section, code: (chunks) => <code>{chunks}</code> })}
        </span>
      </div>

      <div style={s.previewContainer}>
        <div style={s.promptHeader}>
          <span>{t("preview.header")}</span>
          <span>{skill.name}</span>
        </div>
        <div style={s.markdownBody}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {`${section}\n\n${skill.body}`}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

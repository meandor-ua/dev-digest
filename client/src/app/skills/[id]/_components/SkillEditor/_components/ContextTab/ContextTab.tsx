"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function ContextTab() {
  const t = useTranslations("skills");

  return (
    <div style={{ padding: 32, display: "flex", justifyContent: "center" }}>
      <EmptyState
        icon="Layers"
        title={t("context.integration")}
        body={t("context.integrationBody")}
      />
    </div>
  );
}

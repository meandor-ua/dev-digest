/* EmptyTab — placeholder body for editor tabs with no content yet (Evals, CI). */
"use client";

import React from "react";
import { EmptyState, type IconName } from "@devdigest/ui";

export function EmptyTab({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <EmptyState icon={icon} title={title} body={body} />
    </div>
  );
}

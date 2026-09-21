import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";

// The tab bodies have their own tests; stub them to test only the switcher.
vi.mock("./_components/ConfigTab", () => ({ ConfigTab: () => <div>config-body</div> }));
vi.mock("./_components/PreviewTab", () => ({ PreviewTab: () => <div>preview-body</div> }));
vi.mock("./_components/StatsTab", () => ({ StatsTab: () => <div>stats-body</div> }));
vi.mock("./_components/VersionsTab", () => ({ VersionsTab: () => <div>versions-body</div> }));

import { SkillEditor } from "./SkillEditor";

const SKILL: Skill = {
  id: "sk1",
  name: "Rule",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# r",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderEditor(tab: string, onTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillEditor skill={SKILL} tab={tab} onTab={onTab} />
    </NextIntlClientProvider>,
  );
  return onTab;
}

afterEach(cleanup);

describe("SkillEditor", () => {
  it("shows all six tabs with translated labels", () => {
    renderEditor("config");
    for (const label of ["Config", "Context", "Preview", "Evals", "Stats", "Versions"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("reports tab changes to the parent", () => {
    const onTab = renderEditor("config");
    fireEvent.click(screen.getByText("Stats"));
    expect(onTab).toHaveBeenCalledWith("stats");
  });

  it("renders the selected tab and keeps Config mounted (hidden) to preserve unsaved edits", () => {
    renderEditor("preview");
    expect(screen.getByText("preview-body")).toBeInTheDocument();
    expect(screen.queryByText("stats-body")).not.toBeInTheDocument();
    expect(screen.getByText("config-body")).not.toBeVisible();
  });

  it("renders the placeholder Context and Evals tabs", () => {
    renderEditor("context");
    expect(screen.getByText(messages.context.integration)).toBeInTheDocument();
    cleanup();
    renderEditor("evals");
    expect(screen.getByText(messages.evals.pipeline)).toBeInTheDocument();
  });
});

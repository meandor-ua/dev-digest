import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";

// The tab bodies have their own tests; stub them to test only the switcher.
// ConfigTab's stub edits the shared draft, the way the real body textarea does.
vi.mock("./_components/ConfigTab", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_components/ConfigTab")>()),
  ConfigTab: ({ state }: { state: { setDraft: (fn: (d: object) => object) => void } }) => (
    <div>
      config-body
      <button onClick={() => state.setDraft((d) => ({ ...d, body: "# Edited" }))}>edit-body</button>
    </div>
  ),
}));
vi.mock("./_components/ContextTab", () => ({ ContextTab: () => <div>context-body</div> }));
vi.mock("./_components/PreviewTab", () => ({
  PreviewTab: ({ body, dirty }: { body: string; dirty: boolean }) => (
    <div>
      preview-body:{body}:{String(dirty)}
    </div>
  ),
}));
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
  return renderAt(tab, onTab).onTab;
}

function renderAt(tab: string, onTab = vi.fn()) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillEditor skill={SKILL} tab={tab} onTab={onTab} />
    </NextIntlClientProvider>,
  );
  const at = (next: string) =>
    utils.rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillEditor skill={SKILL} tab={next} onTab={onTab} />
      </NextIntlClientProvider>,
    );
  return { onTab, at };
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
    expect(screen.getByText(/preview-body/)).toBeInTheDocument();
    expect(screen.queryByText("stats-body")).not.toBeInTheDocument();
    expect(screen.getByText("config-body")).not.toBeVisible();
  });

  it("previews the unsaved Config body, not the saved one", () => {
    const { at } = renderAt("config");
    fireEvent.click(screen.getByText("edit-body"));
    at("preview");
    expect(screen.getByText("preview-body:# Edited:true")).toBeInTheDocument();
  });

  it("renders the Context tab (stubbed) and the placeholder Evals tab", () => {
    renderEditor("context");
    expect(screen.getByText("context-body")).toBeInTheDocument();
    cleanup();
    renderEditor("evals");
    expect(screen.getByText(messages.evals.empty)).toBeInTheDocument();
  });
});

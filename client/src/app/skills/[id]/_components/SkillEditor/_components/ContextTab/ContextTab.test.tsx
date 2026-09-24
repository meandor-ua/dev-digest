import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillContext } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "Payments Domain Notes",
  description: "",
  type: "custom",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
  is_dangerous: false,
  evidence_files: null,
};

const setContextMutate = vi.fn();
let activeRepo: { repoId: string | null; reposLoaded: boolean } = { repoId: "repo1", reposLoaded: true };
let context: SkillContext | undefined;
let contextLoading = false;
let contextError = false;

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => activeRepo,
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillContext: () => ({ data: context, isLoading: contextLoading, isError: contextError }),
  useSetSkillContext: () => ({ mutate: setContextMutate }),
  useContextDoc: () => ({ data: { text: "DOC TEXT" }, isLoading: false, isError: false }),
}));

import { ContextTab } from "./ContextTab";

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ContextTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setContextMutate.mockReset();
  activeRepo = { repoId: "repo1", reposLoaded: true };
  context = undefined;
  contextLoading = false;
  contextError = false;
});

describe("ContextTab", () => {
  it("shows a 'select a repo' state when no repo is active", () => {
    activeRepo = { repoId: null, reposLoaded: true };
    renderTab();
    expect(screen.getByText("Select a repo")).toBeInTheDocument();
  });

  it("shows an empty state when the repo has no project docs", () => {
    context = { available: [], attached: [] };
    renderTab();
    expect(screen.getByText("No project docs found")).toBeInTheDocument();
  });

  it("lists available docs with their category, checked state, and attached count", () => {
    context = {
      available: [
        { path: "specs/README.md", dir: "specs", category: "specs" },
        { path: "docs/guide.md", dir: "docs", category: "docs" },
      ],
      attached: ["specs/README.md"],
    };
    renderTab();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("guide.md")).toBeInTheDocument();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // specs/README.md, attached
    expect(checkboxes[1]).not.toBeChecked(); // docs/guide.md, not attached
  });

  it("attaches a doc when its checkbox is checked", () => {
    context = {
      available: [{ path: "docs/guide.md", dir: "docs", category: "docs" }],
      attached: [],
    };
    renderTab();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(setContextMutate).toHaveBeenCalledWith(["docs/guide.md"], expect.anything());
  });

  it("detaches a doc when its checkbox is unchecked", () => {
    context = {
      available: [{ path: "docs/guide.md", dir: "docs", category: "docs" }],
      attached: ["docs/guide.md"],
    };
    renderTab();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(setContextMutate).toHaveBeenCalledWith([], expect.anything());
  });

  it("filters rows by path", () => {
    context = {
      available: [
        { path: "specs/README.md", dir: "specs", category: "specs" },
        { path: "docs/guide.md", dir: "docs", category: "docs" },
      ],
      attached: [],
    };
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter docs…"), { target: { value: "guide" } });
    expect(screen.getByText("guide.md")).toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });

  it("groups attached paths by category under Serializes as", () => {
    context = {
      available: [
        { path: "specs/README.md", dir: "specs", category: "specs" },
        { path: "docs/guide.md", dir: "docs", category: "docs" },
      ],
      attached: ["specs/README.md", "docs/guide.md"],
    };
    renderTab();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(screen.getByText("specs/README.md")).toBeInTheDocument();
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
  });

  it("keeps an attached doc the repo no longer has as a 'not in this repo' row, left out of Serializes as", () => {
    context = {
      available: [{ path: "docs/guide.md", dir: "docs", category: "docs" }],
      attached: ["docs/removed.md", "docs/guide.md"],
    };
    renderTab();
    expect(screen.getByText("removed.md")).toBeInTheDocument();
    expect(screen.getByText(messages.context.missing)).toBeInTheDocument();
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument(); // serialized
    expect(screen.queryByText("docs/removed.md")).not.toBeInTheDocument(); // not serialized
    expect(screen.getAllByRole("button", { name: messages.context.preview })).toHaveLength(1);
  });

  it("does not show the Serializes as block when nothing is attached", () => {
    context = {
      available: [{ path: "docs/guide.md", dir: "docs", category: "docs" }],
      attached: [],
    };
    renderTab();
    expect(screen.queryByText("Serializes as")).not.toBeInTheDocument();
  });

  it("opens a preview modal with the document's text when the eye icon is clicked", () => {
    context = {
      available: [{ path: "docs/guide.md", dir: "docs", category: "docs" }],
      attached: [],
    };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Preview document" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("DOC TEXT")).toBeInTheDocument();
  });
});

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Security Rubric",
  description: "Detects security issues",
  type: "security",
  source: "manual",
  body: "# Security Rubric v2\nUpdated rules...",
  enabled: true,
  version: 2,
};

const VERSIONS: SkillVersion[] = [
  {
    skill_id: "sk1",
    version: 1,
    body: "# Security Rubric v1\nOriginal rules...",
    message: null,
    created_at: "2026-09-20T10:00:00Z",
  },
  {
    skill_id: "sk1",
    version: 2,
    body: "# Security Rubric v2\nUpdated rules...",
    message: "Tighten the secrets rule",
    created_at: "2026-09-21T10:00:00Z",
  },
];

const restoreMutate = vi.fn();

const { useSkillVersionsMock, useRestoreSkillMock } = vi.hoisted(() => ({ useSkillVersionsMock: vi.fn(), useRestoreSkillMock: vi.fn() }));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: useSkillVersionsMock,
  useRestoreSkill: useRestoreSkillMock,
}));

useSkillVersionsMock.mockReturnValue({
  data: VERSIONS,
  isLoading: false,
  isError: false,
});

useRestoreSkillMock.mockReturnValue({
  mutate: restoreMutate,
  isPending: false,
});

import { VersionsTab } from "./VersionsTab";

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("VersionsTab", () => {
  beforeEach(() => {
    restoreMutate.mockClear();
  });

  it("renders the version history title and count chip", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
  });

  it("renders all versions with version badges, messages, and YYYY-MM-DD dates", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("Tighten the secrets rule")).toBeInTheDocument();
    expect(screen.getByText("Saved body")).toBeInTheDocument(); // v1's fallback (no message)
    expect(screen.getByText("2026-09-20")).toBeInTheDocument();
    expect(screen.getByText("2026-09-21")).toBeInTheDocument();
  });

  it("puts the count chip right next to the title", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("2 versions").parentElement).toBe(screen.getByText("Version history").parentElement);
  });

  it("highlights only the current version's pill", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("v2")).toHaveAttribute("data-current", "true");
    expect(screen.getByText("v1")).toHaveAttribute("data-current", "false");
  });

  it("marks the current version with a green Current pill and no Restore, but still a Diff", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText(messages.versions.currentBadge)).toBeInTheDocument();
    // Every version can show what it changed; only older ones can be restored.
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
  });

  it("starts with every row collapsed — no body or diff shown until Diff is clicked", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.queryByText(/Updated rules/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Original rules/)).not.toBeInTheDocument();
  });

  // VERSIONS is [v1, v2] — rows render in that order.
  const diffButton = (version: number) => screen.getAllByRole("button", { name: "Diff" })[version - 1]!;
  // A diff row is a <div> whose whole text is the marker plus the line.
  const hasDiffLine = (text: string) =>
    screen.queryAllByText((_, el) => el?.tagName === "DIV" && el.textContent === text).length > 0;

  it("diffs a version against the one before it, not against the current body", () => {
    renderWithProviders(<VersionsTab skill={{ ...SKILL, body: "# Something else entirely", version: 3 }} />);
    fireEvent.click(diffButton(2));
    expect(screen.getByText(messages.versions.diffFrom.replace("{version}", "1"))).toBeInTheDocument();
    expect(hasDiffLine("- # Security Rubric v1")).toBe(true);
    expect(hasDiffLine("+ # Security Rubric v2")).toBe(true);
    expect(screen.queryByText(/Something else entirely/)).not.toBeInTheDocument();
  });

  it("shows v1's whole body as added, labelled as the initial version", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(diffButton(1));
    expect(screen.getByText(messages.versions.diffInitial)).toBeInTheDocument();
    expect(hasDiffLine("+ Original rules...")).toBe(true);
  });

  it("collapses a diff on a second click", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(diffButton(1));
    expect(screen.getByText(/Original rules/)).toBeInTheDocument();
    fireEvent.click(diffButton(1));
    await waitFor(() => {
      expect(screen.queryByText(/Original rules/)).not.toBeInTheDocument();
    });
  });

  it("calls restore mutation with the older version's number", async () => {
    restoreMutate.mockImplementation((input, options) => {
      options.onSuccess({ ...SKILL, version: 3 });
    });

    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(restoreMutate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sk1", version: 1 }),
        expect.any(Object),
      );
    });
  });
});

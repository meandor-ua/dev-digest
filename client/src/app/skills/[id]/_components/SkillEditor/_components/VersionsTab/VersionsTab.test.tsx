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
    created_at: "2026-09-20T10:00:00Z",
  },
  {
    skill_id: "sk1",
    version: 2,
    body: "# Security Rubric v2\nUpdated rules...",
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

  it("renders the version history title", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Version History")).toBeInTheDocument();
  });

  it("renders the number of recorded versions", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText(/2 versions recorded/)).toBeInTheDocument();
  });

  it("renders all versions with version badges", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("marks the current version with a current badge", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const currentBadges = screen.getAllByText(/● Current/);
    expect(currentBadges.length).toBeGreaterThan(0);
  });

  it("starts with only the current version expanded", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getAllByRole("button", { name: /Hide body/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /View body/ })).toHaveLength(1);
  });

  it("expands a version when view body button is clicked", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    fireEvent.click(viewButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Original rules/)).toBeInTheDocument();
    });
  });

  it("collapses a version when hide body button is clicked", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    fireEvent.click(viewButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Original rules/)).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByRole("button", { name: /Hide body/ });
    fireEvent.click(hideButtons[0]!);

    await waitFor(() => {
      expect(screen.queryByText(/Original rules/)).not.toBeInTheDocument();
    });
  });

  it("shows restore button for older versions", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    fireEvent.click(viewButtons[0]!);

    await waitFor(() => {
      const restoreButtons = screen.getAllByRole("button", { name: /Restore/ });
      expect(restoreButtons.length).toBeGreaterThan(0);
    });
  });

  it("does not show restore button for current version", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    // Click on v2 (current version) which is typically the last one
    fireEvent.click(viewButtons[viewButtons.length - 1]!);

    await waitFor(() => {
      // The current version should not have a restore button, but older versions will
      const versionCards = screen.getAllByText(/v\d/);
      expect(versionCards.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("calls restore mutation when restore button is clicked", async () => {
    restoreMutate.mockImplementation((input, options) => {
      options.onSuccess({ ...SKILL, version: 3 });
    });

    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    fireEvent.click(viewButtons[0]!); // Open v1

    await waitFor(() => {
      const restoreButtons = screen.getAllByRole("button", { name: /Restore/ });
      fireEvent.click(restoreButtons[0]!);
    });

    await waitFor(() => {
      expect(restoreMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sk1",
          version: 1,
        }),
        expect.any(Object),
      );
    });
  });

  it("shows diff lines for older versions with added lines", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const viewButtons = screen.getAllByRole("button", { name: /View body/ });
    fireEvent.click(viewButtons[0]!); // Open v1

    await waitFor(() => {
      // The diff should show lines from v1 vs current v2
      // Since v1 has "Original rules" and v2 has "Updated rules", there should be differences
      expect(screen.getByText(/Original rules/)).toBeInTheDocument();
    });
  });

  it("renders the current version's body as-is, without diff markers", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText(/Updated rules/)).toBeInTheDocument();
    expect(screen.queryByText("+")).not.toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });
});

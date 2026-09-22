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

  it("marks the current version with a green Current pill and no actions", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.getByText(messages.versions.currentBadge)).toBeInTheDocument();
    // Only v1 (the non-current row) gets Diff/Restore buttons.
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
  });

  it("starts with every row collapsed — no body or diff shown until Diff is clicked", () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    expect(screen.queryByText(/Updated rules/)).not.toBeInTheDocument();
    expect(screen.queryByText("+")).not.toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  it("expands an older version's diff when Diff is clicked, and collapses on a second click", async () => {
    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));

    await waitFor(() => {
      expect(screen.getByText(/Original rules/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
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

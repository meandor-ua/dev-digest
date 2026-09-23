import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import commonMessages from "../../../../../messages/en/common.json";
import { UnsavedChangesProvider, useReportUnsaved } from "@/lib/unsaved-changes";
import { SkillsColumn } from "./SkillsColumn";

afterEach(cleanup);

const { push, updateMutate, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  updateMutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const SKILLS: SkillWithStats[] = [
  {
    id: "sk1",
    name: "Security Rubric",
    description: "Detects security issues",
    type: "security",
    source: "manual",
    body: "# Security",
    enabled: true,
    version: 1,
  },
  {
    id: "sk2",
    name: "Test Coverage",
    description: "Checks test coverage",
    type: "convention",
    source: "manual",
    body: "# Tests",
    enabled: true,
    version: 1,
  },
  {
    id: "sk3",
    name: "Code Style",
    description: "Enforces code style guidelines",
    type: "convention",
    source: "manual",
    body: "# Style",
    enabled: true,
    version: 1,
  },
];

const deleteMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({
    data: SKILLS,
    isLoading: false,
  }),
  useUpdateSkill: () => ({
    mutate: updateMutate,
  }),
  useDeleteSkill: () => ({
    mutate: deleteMutate,
    isPending: false,
    variables: undefined,
  }),
  useCreateSkill: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePreviewSkillUrl: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn(), toast: vi.fn() }),
}));

afterEach(() => {
  deleteMutate.mockReset();
  push.mockReset();
  updateMutate.mockReset();
  toastError.mockReset();
  vi.restoreAllMocks();
});

/** Stands in for the skill editor reporting an unsaved draft. */
function DirtyEditor({ dirty }: { dirty: boolean }) {
  useReportUnsaved(dirty);
  return null;
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages, common: commonMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsColumn", () => {
  it("renders the skills heading", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("renders all skills initially", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.getByText("Code Style")).toBeInTheDocument();
  });

  it("filters skills by name when typing in search", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "security" } });

    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
    expect(screen.queryByText("Test Coverage")).not.toBeInTheDocument();
    expect(screen.queryByText("Code Style")).not.toBeInTheDocument();
  });

  it("filters skills by description when typing in search", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "test" } });

    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.queryByText("Security Rubric")).not.toBeInTheDocument();
  });

  it("filters skills by type when typing in search", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "convention" } });

    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.getByText("Code Style")).toBeInTheDocument();
    expect(screen.queryByText("Security Rubric")).not.toBeInTheDocument();
  });

  it("is case-insensitive when searching", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "SECURITY" } });

    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
  });

  it("shows empty state when no skills match the search", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText("No matching skills")).toBeInTheDocument();
  });

  it("shows empty search result body text", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(searchInput, { target: { value: "xyz" } });

    expect(screen.getByText("Try another search term")).toBeInTheDocument();
  });

  it("clears the filter when search is emptied", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    const searchInput = screen.getByPlaceholderText("Search skills…") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "security" } });
    expect(screen.queryByText("Test Coverage")).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.getByText("Code Style")).toBeInTheDocument();
  });

  it("deletes a skill after the user confirms", () => {
    renderWithProviders(<SkillsColumn activeId="sk1" tab="config" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete skill" })[1]!);
    expect(
      screen.getByText('Delete skill "Test Coverage"? This will unlink it from all agents.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk2", expect.any(Object));
  });

  it("does not delete when the user cancels the confirm", () => {
    renderWithProviders(<SkillsColumn activeId="sk1" tab="config" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete skill" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("toasts when toggling a skill fails", () => {
    updateMutate.mockImplementation((_v, opts) => opts.onError(new Error("")));
    renderWithProviders(<SkillsColumn activeId="sk1" tab="config" />);
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk2", patch: { enabled: false } }, expect.any(Object));
    expect(toastError).toHaveBeenCalledWith("Failed to update skill");
  });

  it("asks before opening another skill while the editor has unsaved changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(
      <UnsavedChangesProvider>
        <SkillsColumn activeId="sk1" tab="config" />
        <DirtyEditor dirty />
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByText("Test Coverage"));
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes to this skill. Discard them?");
    expect(push).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Test Coverage"));
    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });

  it("opens the create modal on the URL tab from the Add Skill dropdown", () => {
    renderWithProviders(<SkillsColumn activeId={undefined} tab="config" />);
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    fireEvent.click(screen.getByText("Import from URL"));
    expect(screen.getByText("Skill URL")).toBeInTheDocument();
  });

  it("navigates without asking when nothing is unsaved", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderWithProviders(
      <UnsavedChangesProvider>
        <SkillsColumn activeId="sk1" tab="config" />
        <DirtyEditor dirty={false} />
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByText("Test Coverage"));
    expect(confirm).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });
});

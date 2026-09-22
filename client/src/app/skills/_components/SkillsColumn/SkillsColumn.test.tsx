import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillsColumn } from "./SkillsColumn";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
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

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: SKILLS,
    isLoading: false,
  }),
  useUpdateSkill: () => ({
    mutate: vi.fn(),
  }),
  useDeleteSkill: () => ({
    mutate: deleteMutate,
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

afterEach(() => {
  deleteMutate.mockReset();
  vi.restoreAllMocks();
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<SkillsColumn activeId="sk1" tab="config" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete skill" })[1]!);
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete skill "Test Coverage"? This will unlink it from all agents.',
    );
    expect(deleteMutate).toHaveBeenCalledWith("sk2", expect.any(Object));
  });

  it("does not delete when the user cancels the confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<SkillsColumn activeId="sk1" tab="config" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete skill" })[0]!);
    expect(deleteMutate).not.toHaveBeenCalled();
  });
});

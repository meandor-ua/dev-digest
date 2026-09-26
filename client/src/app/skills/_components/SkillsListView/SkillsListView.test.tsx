import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import commonMessages from "../../../../../messages/en/common.json";
import { SkillsListView } from "./SkillsListView";

const { push, updateMutate, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  updateMutate: vi.fn(),
  toastError: vi.fn(),
}));

const deleteMutate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false, variables: undefined }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewSkillUrl: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn(), toast: vi.fn() }),
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
    is_dangerous: false,
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
    is_dangerous: false,
  },
];

function renderView() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages, common: commonMessages }}>
        <SkillsListView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SkillsListView", () => {
  it("renders skills as tiles", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByTestId("skill-card-sk1")).toBeInTheDocument();
    expect(screen.getByTestId("skill-card-sk2")).toBeInTheDocument();
  });

  it("opens the selected skill in the editor", () => {
    renderView();

    fireEvent.click(screen.getByText("Test Coverage"));

    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });

  it("filters tiles by search query", () => {
    renderView();

    fireEvent.change(screen.getByRole("textbox", { name: "Search skills…" }), {
      target: { value: "security" },
    });

    expect(screen.getByTestId("skill-card-sk1")).toBeInTheDocument();
    expect(screen.queryByTestId("skill-card-sk2")).not.toBeInTheDocument();
  });
});

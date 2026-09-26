import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const { extractMutate, patchMutate, deleteMutate } = vi.hoisted(() => ({
  extractMutate: vi.fn(),
  patchMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "c1",
    category: "style",
    rule: "Always use async/await instead of .then() chains",
    rationale: null,
    evidence_path: "src/api/users.ts",
    evidence_line: 23,
    evidence_line_end: 23,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "accepted",
    created_at: new Date().toISOString(),
  },
  {
    id: "c2",
    category: "api",
    rule: "All public route handlers return typed Result<T, ApiError>",
    rationale: null,
    evidence_path: "src/api/public/index.ts",
    evidence_line: 14,
    evidence_line_end: 14,
    evidence_snippet: "function handler(): Result<Item[], ApiError> {",
    confidence: 0.78,
    status: "pending",
    created_at: new Date().toISOString(),
  },
  {
    id: "c3",
    category: "structure",
    rule: "Redis access goes through src/lib/redis.ts singleton",
    rationale: null,
    evidence_path: "src/lib/redis.ts",
    evidence_line: 1,
    evidence_line_end: 1,
    evidence_snippet: "export const redis = new Redis(config.redisUrl);",
    confidence: 0.85,
    status: "rejected",
    created_at: new Date().toISOString(),
  },
];

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "repo-1", full_name: "acme/payments-api", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: CANDIDATES, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  usePatchConvention: () => ({ mutate: patchMutate }),
  useDeleteConvention: () => ({ mutate: deleteMutate }),
}));

vi.mock("./_components/CreateSkillModal", () => ({
  CreateSkillModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="create-skill-modal">
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

import ConventionsPage from "./page";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsPage />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConventionsPage", () => {
  it("renders the heading with the repo name and every candidate", () => {
    renderPage();
    expect(screen.getByText("Conventions in acme/payments-api")).toBeInTheDocument();
    expect(screen.getAllByText(/async\/await/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Redis access/)).toBeInTheDocument();
  });

  it("shows 1 of 3 accepted and filters by status", () => {
    renderPage();
    expect(screen.getByText("1 of 3 accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accepted (1)" }));
    expect(screen.queryByText(/All public route handlers/)).not.toBeInTheDocument();
    expect(screen.getByText(/async\/await/)).toBeInTheDocument();
  });

  it("gates the Create skill button on at least one accepted candidate", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("opens the create-skill modal", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByTestId("create-skill-modal")).toBeInTheDocument();
  });

  it("runs a scan via Re-scan", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    expect(extractMutate).toHaveBeenCalled();
  });
});

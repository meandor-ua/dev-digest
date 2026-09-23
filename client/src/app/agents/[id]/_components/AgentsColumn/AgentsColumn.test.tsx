import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const { push, updateMutate, deleteMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const agent = (id: string, name: string): Agent => ({
  id,
  name,
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/toast")>();
  return {
    ...actual,
    useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn(), toast: vi.fn() }),
  };
});
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [agent("a1", "Security Reviewer"), agent("a2", "Perf Reviewer")] }),
  useUpdateAgent: () => ({ mutate: updateMutate }),
  useAgentCardStats: () => ({ data: [] }),
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false, variables: undefined }),
  useCreateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentsColumn } from "./AgentsColumn";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderColumn() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <AgentsColumn activeId="a1" tab="stats" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("AgentsColumn", () => {
  it("lists every agent in the rail", () => {
    renderColumn();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Perf Reviewer")).toBeInTheDocument();
  });

  it("opens another agent on the same editor tab", () => {
    renderColumn();
    fireEvent.click(screen.getByText("Perf Reviewer"));
    expect(push).toHaveBeenCalledWith("/agents/a2?tab=stats");
  });

  it("redirects to /agents after deleting the currently open agent", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMutate.mockImplementation((_id, opts) => opts.onSuccess());
    renderColumn();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete agent" })[0]!);
    expect(deleteMutate).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(toastSuccess).toHaveBeenCalledWith('Deleted agent "Security Reviewer"');
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("does not redirect when deleting a non-active agent", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMutate.mockImplementation((_id, opts) => opts.onSuccess());
    renderColumn();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete agent" })[1]!);
    expect(deleteMutate).toHaveBeenCalledWith("a2", expect.any(Object));
    expect(push).not.toHaveBeenCalledWith("/agents");
  });

  it("does not delete when the user cancels the confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderColumn();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete agent" })[0]!);
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("toasts an error when deletion fails", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMutate.mockImplementation((_id, opts) => opts.onError(new Error("boom")));
    renderColumn();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete agent" })[0]!);
    expect(toastError).toHaveBeenCalledWith("boom");
  });
});

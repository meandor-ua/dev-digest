import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";

const { push, updateMutate } = vi.hoisted(() => ({ push: vi.fn(), updateMutate: vi.fn() }));

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
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [agent("a1", "Security Reviewer"), agent("a2", "Perf Reviewer")] }),
  useUpdateAgent: () => ({ mutate: updateMutate }),
  useAgentCardStats: () => ({ data: [] }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
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
      <AgentsColumn activeId="a1" tab="stats" />
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
});

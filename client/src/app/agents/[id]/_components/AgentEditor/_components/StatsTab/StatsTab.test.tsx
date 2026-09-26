import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentRepoStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

let stats: AgentRepoStats | undefined;
let loading = false;

vi.mock("@/lib/hooks/agents", () => ({
  useAgentStats: () => ({ data: stats, isLoading: loading }),
}));

// RunTraceDrawer pulls in run hooks/query — stub it (never opened in these tests).
vi.mock("@/components/run-trace-drawer", () => ({
  default: () => null,
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  loading = false;
});

function renderTab(repoId: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <StatsTab agentId="ag1" agentName="Security Reviewer" repoId={repoId} />
    </NextIntlClientProvider>,
  );
}

const FULL: AgentRepoStats = {
  agent_id: "ag1",
  repo_id: "r1",
  runs: 12,
  avg_score: 82,
  avg_cost_usd: 0.041,
  avg_duration_ms: 8200,
  cost_trend: 0.002,
  score_trend: [{ label: "W1", value: 80 }, { label: "W2", value: 84 }],
  most_used_skills: [{ label: "Secrets", value: 100 }],
  findings_by_severity: [{ label: "W1", CRITICAL: 1, WARNING: 2, SUGGESTION: 3 }],
  findings_by_category: [{ label: "security", value: 5 }],
  run_history: [
    { run_id: "run1", ran_at: "2024-01-02T00:00:00Z", pr_id: "p1", pr_number: 42, tokens: 12000, cost_usd: 0.004, findings_count: 2, source: "local", has_trace: false },
  ],
};

describe("StatsTab", () => {
  it("asks for a repo when none is active", () => {
    stats = undefined;
    renderTab(null);
    expect(screen.getByText("Select a repo to see this agent’s stats.")).toBeInTheDocument();
  });

  it("shows a no-data state when the agent has no runs in the repo", () => {
    stats = { ...FULL, runs: 0 };
    renderTab("r1");
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders KPI tiles and the run-history row", () => {
    stats = FULL;
    renderTab("r1");
    expect(screen.getByText("Total runs")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    // has_trace=false → "No trace", not a View-trace button.
    expect(screen.getByText("No trace")).toBeInTheDocument();
  });

  it("links the PR number to that PR's view in the active repo", () => {
    stats = FULL;
    renderTab("r1");
    expect(screen.getByRole("link", { name: "#42" })).toHaveAttribute(
      "href",
      "/repos/r1/pulls/42",
    );
  });

  it("shows the run's source from agent_runs", () => {
    stats = FULL;
    renderTab("r1");
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
  });

  it("keeps Most-pulled memory as an explicit no-data placeholder", () => {
    stats = FULL;
    renderTab("r1");
    expect(screen.getByText("Most-pulled memory")).toBeInTheDocument();
    expect(screen.getByText("Memory pulls aren’t recorded per run yet.")).toBeInTheDocument();
  });

  it("shows findings by category as percentages of all findings (sum = 100%)", () => {
    stats = {
      ...FULL,
      findings_by_category: [
        { label: "security", value: 3 },
        { label: "perf", value: 1 },
      ],
    };
    renderTab("r1");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    // raw counts are no longer printed
    expect(screen.queryByText("3.00")).not.toBeInTheDocument();
  });

  it("shows a no-data state for findings-by-severity when every week is zero", () => {
    stats = {
      ...FULL,
      findings_by_severity: [{ label: "W1", CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }],
    };
    renderTab("r1");
    expect(screen.getByText("Findings by severity")).toBeInTheDocument();
    expect(screen.getAllByText("No data yet").length).toBeGreaterThan(0);
  });
});

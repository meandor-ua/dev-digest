import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        stats={{ agent_id: "ag1", skills_count: 3, runs: 142, avg_score: 78, avg_cost_usd: 0.04 }}
      />,
    );
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
    expect(screen.getByText("142 runs")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("renders placeholders in the stats line when the agent has no scored runs", () => {
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        stats={{ agent_id: "ag1", skills_count: 0, runs: 0, avg_score: null, avg_cost_usd: null }}
      />,
    );
    expect(screen.getByText("0 runs")).toBeInTheDocument();
  });

  it("omits the stats line when no stats are provided", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    expect(screen.queryByText(/runs$/)).not.toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("omits the delete button when onDelete is not provided", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    expect(screen.queryByRole("button", { name: "Delete agent" })).not.toBeInTheDocument();
  });

  it("calls onDelete when the delete button is clicked", () => {
    const onDelete = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("disables the delete button while deleting", () => {
    renderWithIntl(<AgentCard ag={AGENT} onDelete={vi.fn()} deleting />);
    expect(screen.getByRole("button", { name: "Delete agent" })).toBeDisabled();
  });
});

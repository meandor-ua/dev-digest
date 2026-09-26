import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const { useSkillStats } = vi.hoisted(() => ({ useSkillStats: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({ useSkillStats }));

import { StatsTab } from "./StatsTab";

const STATS: SkillStats = {
  agent_count: 2,
  agents: [
    { id: "ag1", name: "Security Reviewer" },
    { id: "ag2", name: "Code Quality" },
  ],
  pull_frequency_pct: 45,
  accept_rate_pct: 78,
  findings_30d: 156,
  findings_by_category: { security: 3, bug: 1 },
};

function renderWith(result: { data?: SkillStats; isLoading?: boolean; isError?: boolean }) {
  useSkillStats.mockReturnValue({ isLoading: false, isError: false, ...result });
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("StatsTab", () => {
  const tile = (label: string) => screen.getByText(label).parentElement?.parentElement as HTMLElement;

  it("shows the four KPIs with their units", () => {
    renderWith({ data: STATS });
    expect(tile(messages.stats.usedBy)).toHaveTextContent("2 agents");
    expect(tile(messages.stats.pullFrequency)).toHaveTextContent("45%");
    expect(tile(messages.stats.acceptRate)).toHaveTextContent("78%");
    expect(tile(messages.stats.findings)).toHaveTextContent("156");
  });

  it("shows an em dash, not a fabricated 100%, when there are no findings to rate", () => {
    renderWith({ data: { ...STATS, accept_rate_pct: null } });
    expect(tile(messages.stats.acceptRate)).toHaveTextContent(/^ACCEPT RATE—$/);
  });

  it("uses the singular unit for one agent", () => {
    renderWith({ data: { ...STATS, agent_count: 1, agents: STATS.agents.slice(0, 1) } });
    expect(tile(messages.stats.usedBy)).toHaveTextContent(/^USED BY1 agent$/);
  });

  it("labels each agent row with Open", () => {
    renderWith({ data: STATS });
    expect(screen.getByRole("link", { name: /Security Reviewer/ })).toHaveTextContent(messages.stats.open);
  });

  it("links each agent using the skill to its Skills tab", () => {
    renderWith({ data: STATS });
    expect(screen.getByRole("link", { name: /Security Reviewer/ })).toHaveAttribute("href", "/agents/ag1?tab=skills");
    expect(screen.getByRole("link", { name: /Code Quality/ })).toHaveAttribute("href", "/agents/ag2?tab=skills");
  });

  it("shows category shares as percents", () => {
    renderWith({ data: STATS });
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows empty states with no agents and no findings", () => {
    renderWith({ data: { ...STATS, agent_count: 0, agents: [], findings_by_category: {} } });
    expect(screen.getByText(messages.stats.noAgents)).toBeInTheDocument();
    expect(screen.getByText(messages.stats.noFindings)).toBeInTheDocument();
  });

  it("legend values never show a currency prefix, and always sum to 100%", () => {
    renderWith({ data: { ...STATS, findings_by_category: { security: 1, bug: 1, perf: 1 } } });
    const percents = ["security", "bug", "perf"].map((label) => {
      const row = screen.getByText(label).parentElement as HTMLElement;
      const valueEl = row.lastElementChild as HTMLElement;
      return Number(valueEl.textContent!.replace("%", ""));
    });
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("shows an error state when stats fail to load", () => {
    renderWith({ isError: true });
    expect(screen.getByText(messages.stats.loadError)).toBeInTheDocument();
  });
});

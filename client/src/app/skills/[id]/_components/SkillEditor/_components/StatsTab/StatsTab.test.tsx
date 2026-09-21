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
  it("shows the four KPIs", () => {
    renderWith({ data: STATS });
    expect(screen.getByText("USED BY").parentElement?.parentElement).toHaveTextContent("2");
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
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

  it("shows an error state when stats fail to load", () => {
    renderWith({ isError: true });
    expect(screen.getByText(messages.stats.loadError)).toBeInTheDocument();
  });
});

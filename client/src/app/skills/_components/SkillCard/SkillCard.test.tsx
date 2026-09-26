import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: SkillWithStats = {
  id: "sk1",
  name: "Security Rubric",
  description: "Detects security issues",
  type: "security",
  source: "manual",
  body: "# Security Rubric\n...",
  enabled: true,
  version: 1,
  is_dangerous: false,
  agent_count: 2,
  pull_frequency_pct: 45,
  accept_rate_pct: 78,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders the skill name and type", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("renders the stats line with agent count, pull frequency, and accept rate", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText(/2\s+agents/)).toBeInTheDocument();
    expect(screen.getByText(/45%\s+pull/)).toBeInTheDocument();
    expect(screen.getByText(/78%\s+accept/)).toBeInTheDocument();
  });

  it("renders the source label correctly", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("calls onToggle when the toggle is clicked", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(!SKILL.enabled);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when the card is clicked but not the toggle", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    const name = screen.getByText("Security Rubric");
    fireEvent.click(name);
    expect(onClick).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onDelete (not onClick) when the delete button is clicked", () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={vi.fn()} onDelete={onDelete} />,
    );
    const btn = screen.getByRole("button", { name: "Delete skill" });
    expect(btn).toHaveAttribute("title", "Delete skill");
    fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables the delete button while deleting", () => {
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} deleting />,
    );
    expect(screen.getByRole("button", { name: "Delete skill" })).toBeDisabled();
  });

  it("renders no delete button without onDelete", () => {
    renderWithIntl(<SkillCard skill={SKILL} active={false} onClick={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete skill" })).not.toBeInTheDocument();
  });

  it("shows the needs-vetting badge when the skill is untrusted and disabled", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    const untrustedSkill: SkillWithStats = {
      ...SKILL,
      source: "imported_url",
      enabled: false,
    };
    renderWithIntl(
      <SkillCard skill={untrustedSkill} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not show the needs-vetting badge when the skill is manual", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(
      <SkillCard skill={SKILL} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("does not show the needs-vetting badge when the untrusted skill is enabled", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    const untrustedButEnabledSkill: SkillWithStats = {
      ...SKILL,
      source: "imported_url",
      enabled: true,
    };
    renderWithIntl(
      <SkillCard
        skill={untrustedButEnabledSkill}
        active={false}
        onClick={onClick}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("shows an em dash instead of a fabricated 100% when accept_rate_pct is absent", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    const { accept_rate_pct: _drop, ...noAcceptRate } = SKILL;
    renderWithIntl(
      <SkillCard skill={noAcceptRate} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/accept/)).not.toBeInTheDocument();
  });

  it("shows an em dash when the server reports no accept rate (null)", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, accept_rate_pct: null }} active={false} onClick={vi.fn()} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/accept/)).not.toBeInTheDocument();
  });

  it("renders singular 'agent' when agent_count is 1", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    const singleAgentSkill: SkillWithStats = {
      ...SKILL,
      agent_count: 1,
    };
    renderWithIntl(
      <SkillCard skill={singleAgentSkill} active={false} onClick={onClick} onToggle={onToggle} />,
    );
    expect(screen.getByText(/1\s+agent/)).toBeInTheDocument();
  });
});

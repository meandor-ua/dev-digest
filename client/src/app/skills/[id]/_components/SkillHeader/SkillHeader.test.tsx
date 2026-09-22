import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { SkillHeader } from "./SkillHeader";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# r",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderHeader(skill: Skill = SKILL) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillHeader skill={skill} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("SkillHeader", () => {
  it("shows name, type and version, with a disabled Run on evals and no Delete", () => {
    renderHeader();
    expect(screen.getByRole("heading", { name: "pr-quality-rubric" })).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
    const run = screen.getByRole("button", { name: messages.detail.runOnEvals });
    expect(run).toBeDisabled();
    expect(run.parentElement).toHaveAttribute("title", messages.detail.runOnEvalsTitle);
    expect(screen.queryByRole("button", { name: messages.detail.delete })).not.toBeInTheDocument();
  });

  it("flags an unvetted imported skill", () => {
    renderHeader({ ...SKILL, source: "imported_url", enabled: false });
    expect(screen.getByText(messages.listItem.needsVetting)).toBeInTheDocument();
    expect(screen.getByText(messages.detail.disabled)).toBeInTheDocument();
  });
});

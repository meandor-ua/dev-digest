import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

const SKILL: Skill = {
  id: "sk1",
  name: "Edge Cases",
  description: "",
  type: "rubric",
  source: "manual",
  body: "### Flag untested branches\n- **error paths** must be asserted",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <PreviewTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the body as Markdown, exactly as the reviewing agent receives it", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Flag untested branches" })).toBeInTheDocument();
    expect(screen.getByText("error paths").tagName).toBe("STRONG");
  });

  it("shows the title and subtitle, without a section header or token badge", () => {
    renderTab();
    expect(screen.getByText(messages.preview.title)).toBeInTheDocument();
    expect(screen.getByText(messages.preview.subtitle)).toBeInTheDocument();
    expect(screen.queryByText("Skills / rules", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });
});

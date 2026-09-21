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
  it("renders the body as Markdown under the Skills / rules section", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Skills / rules" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flag untested branches" })).toBeInTheDocument();
    expect(screen.getByText("error paths").tagName).toBe("STRONG");
  });

  it("renders the section name in the hint as code, not as literal tags", () => {
    renderTab();
    expect(screen.queryByText(/<code>/)).not.toBeInTheDocument();
    expect(screen.getByText("## Skills / rules", { selector: "code" })).toBeInTheDocument();
  });

  it("estimates tokens as ceil(chars / 4)", () => {
    renderTab({ ...SKILL, body: "x".repeat(10) });
    expect(screen.getByText("~3 tokens")).toBeInTheDocument();
  });
});

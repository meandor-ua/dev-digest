import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { OverviewTab } from "./OverviewTab";
import type { ReviewBriefCardProps } from "../ReviewBriefCard/ReviewBriefCard";

afterEach(cleanup);

const brief: ReviewBriefCardProps = {
  score: 61,
  counts: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
  costUsd: undefined,
  summary: "Two issues found.",
};

function renderTab(prBody: string | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <OverviewTab prBody={prBody} brief={brief} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("renders the PR description as formatted markdown, not raw text", () => {
    renderTab("## Summary\n\nThis fixes **the bug**.\n\n- one\n- two");

    expect(screen.getByRole("heading", { level: 2, name: "Summary" })).toBeInTheDocument();
    const strong = screen.getByText("the bug");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/^## Summary/)).toBeNull();
  });

  it("omits the Description section when there is no PR body", () => {
    renderTab(null);
    expect(screen.queryByText("Description")).toBeNull();
  });

  it("renders GFM tables with header and data cells", () => {
    renderTab("| A | B |\n| --- | --- |\n| 1 | 2 |");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });
});

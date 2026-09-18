import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ReviewBriefCard, type ReviewBriefCardProps } from "./ReviewBriefCard";

afterEach(cleanup);

function renderCard(o: Partial<ReviewBriefCardProps>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewBriefCard
        score={61}
        counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }}
        costUsd={undefined}
        summary="Two issues found."
        {...o}
      />
    </NextIntlClientProvider>,
  );
}

describe("ReviewBriefCard", () => {
  it("shows verdict, findings, blockers, score and summary", () => {
    renderCard({});
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/)).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("Two issues found.")).toBeInTheDocument();
  });

  it("derives Approve and Comment from the counts", () => {
    renderCard({ counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, score: 100 });
    expect(screen.getByText("Approve")).toBeInTheDocument();
    cleanup();
    renderCard({ counts: { WARNING: 1 } });
    expect(screen.getByText("Comment")).toBeInTheDocument();
  });

  it("renders the muted 'Not reviewed yet' card when there is no review", () => {
    renderCard({ counts: undefined, score: null });
    expect(screen.getByText("Not reviewed yet")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });

  it("omits cost when undefined and formats it when present", () => {
    renderCard({});
    expect(screen.queryByText(/\$/)).toBeNull();
    cleanup();
    renderCard({ costUsd: 0.014 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders tokens as in→out", () => {
    renderCard({ tokensIn: 8000, tokensOut: 1300 });
    expect(screen.getByText("8k→1.3k")).toBeInTheDocument();
  });

  it("is prop-only: never calls fetch", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderCard({ tokensIn: 1000, tokensOut: 100, costUsd: 0.01 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps cost and tokens at score 0 (PR scored 0, e.g. quick-blog #34)", () => {
    renderCard({ score: 0, counts: { CRITICAL: 5, WARNING: 5, SUGGESTION: 0 }, costUsd: 0.02, tokensIn: 8000, tokensOut: 1300 });
    expect(screen.getByText("$0.020")).toBeInTheDocument();
    expect(screen.getByText("8k→1.3k")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });
});

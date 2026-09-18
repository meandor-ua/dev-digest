import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";
import { VERDICT_META } from "./constants";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });
});

describe("VerdictBanner — 'comment' is amber, not gray", () => {
  it("uses var(--warn) for BOTH the label colour and the icon box background", () => {
    const { container } = renderWithIntl(
      <VerdictBanner
        verdict="comment"
        summary="Nothing blocking, but worth a look."
        score={70}
        findingsCount={3}
        blockers={0}
      />,
    );
    expect(VERDICT_META.comment.c).toBe("var(--warn)");
    // Both move together — an amber icon in a gray-tinted box was the bug.
    expect(VERDICT_META.comment.bg).toBe("var(--warn-bg)");
    expect(screen.getByText("Comment")).toHaveStyle({ color: "var(--warn)" });
    const iconBox = container.querySelector("svg")!.parentElement!;
    expect(iconBox).toHaveStyle({ background: "var(--warn-bg)" });
  });

  it("an unrecognized verdict falls back to the same amber 'comment' meta", () => {
    renderWithIntl(
      <VerdictBanner
        verdict={"not_a_verdict" as never}
        summary={null}
        score={null}
        findingsCount={0}
        blockers={0}
      />,
    );
    expect(screen.getByText("Comment")).toHaveStyle({ color: "var(--warn)" });
  });
});

describe("VerdictBanner — the score ring follows the score thresholds", () => {
  const strokes = (c: HTMLElement) => [...c.querySelectorAll('svg[style*="rotate"] circle')].map((x) => x.getAttribute("stroke"));

  it("high score is green even when the verdict is request_changes", () => {
    const { container } = renderWithIntl(
      <VerdictBanner verdict="request_changes" summary={null} score={95} findingsCount={1} blockers={1} />,
    );
    expect(strokes(container)).toContain("var(--ok)");
  });

  it("mid score is amber, low score is red", () => {
    const { container } = renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={61} findingsCount={0} blockers={0} />,
    );
    expect(strokes(container)).toContain("var(--warn)");
    cleanup();
    const low = renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={42} findingsCount={0} blockers={0} />,
    );
    expect(strokes(low.container)).toContain("var(--crit)");
  });

  it("a 0 score renders no ring and no PR SCORE label", () => {
    const { container } = renderWithIntl(
      <VerdictBanner verdict="request_changes" summary={null} score={0} findingsCount={3} blockers={3} />,
    );
    expect(container.querySelector('svg[style*="rotate"] circle')).toBeNull();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });

  it("a 0 score still renders the footer (cost / tokens), just without the ring", () => {
    const { container } = renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary={null}
        score={0}
        findingsCount={10}
        blockers={5}
        footer={<span>$0.020</span>}
      />,
    );
    expect(screen.getByText("$0.020")).toBeInTheDocument();
    expect(container.querySelector('svg[style*="rotate"] circle')).toBeNull();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });
});

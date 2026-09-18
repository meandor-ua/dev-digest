import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
const mutateAsync = vi.fn();
const info = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ notify: { info: (m: string) => info(m), error: vi.fn(), success: vi.fn() } }));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  info.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown — ghost trigger (PR list Actions column)", () => {
  it("keeps the visible 'Run Review' label and uses the quiet outlined style", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" kind="ghost" />);
    const trigger = screen.getByRole("button", { name: "Run Review" });
    expect(trigger).toHaveTextContent("Run Review");
    expect(trigger).toHaveStyle({ background: "transparent", color: "var(--text-secondary)" });
  });

  it("highlights on hover (brighter text + hover background)", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" kind="ghost" />);
    const trigger = screen.getByRole("button", { name: "Run Review" });
    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveStyle({ color: "var(--text-primary)", background: "var(--bg-hover)" });
  });

  it("opens the same menu items as the detail-page trigger", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" kind="ghost" />);
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    expect(screen.getByText("Run all enabled agents")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
  });

  it("the default (primary) trigger is unchanged for PrDetailHeader", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByRole("button", { name: "Run Review" })).toHaveStyle({ background: "var(--accent)" });
  });
});

describe("RunReviewDropdown — menuPortal", () => {
  it("renders the menu into document.body, outside the component's own subtree", () => {
    const { container } = renderWithIntl(<RunReviewDropdown prId="pr1" kind="ghost" menuPortal />);
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    const menu = document.body.querySelector("[data-testid='dropdown-menu']")!;
    expect(menu).toBeInTheDocument();
    expect(container.contains(menu)).toBe(false);
  });

  it("without menuPortal the menu stays inside the component (today's behaviour)", () => {
    const { container } = renderWithIntl(<RunReviewDropdown prId="pr1" />);
    fireEvent.click(screen.getByText("Run Review"));
    expect(container.querySelector("[data-testid='dropdown-menu']")).toBeInTheDocument();
  });
});

describe.each([false, true])("RunReviewDropdown — menu items run reviews (menuPortal=%s)", (menuPortal) => {
  it("'Run all enabled agents' calls the mutation with { prId, all: true } and toasts the count", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "r1" }, { run_id: "r2" }] });
    const onRunsStarted = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" menuPortal={menuPortal} onRunsStarted={onRunsStarted} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    fireEvent.click(screen.getByText("Run all enabled agents"));
    await vi.waitFor(() => expect(onRunsStarted).toHaveBeenCalledWith(["r1", "r2"]));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", all: true });
    expect(info).toHaveBeenCalledWith("Review started · 2 agent(s)");
  });

  it("a specific agent calls the mutation with { prId, agentId }", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "r1" }] });
    renderWithIntl(<RunReviewDropdown prId="pr1" menuPortal={menuPortal} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    fireEvent.click(screen.getByText("Security"));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentId: "a1" }));
  });
});

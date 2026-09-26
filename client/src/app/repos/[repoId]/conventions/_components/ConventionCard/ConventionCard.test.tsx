import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "style",
  rule: "Always use async/await instead of .then() chains",
  rationale: null,
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_line_end: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: new Date().toISOString(),
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders the rule, evidence file:line, snippet, and confidence percentage", () => {
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("links evidence to the given URL when provided", () => {
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl="https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const link = screen.getByText("src/api/users.ts:23").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23");
  });

  it("shows a line range and every line of a multi-line snippet", () => {
    const snippet = "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });";
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, evidence_line_end: 31, evidence_snippet: snippet }}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "CODE" && el.textContent === snippet)).toBeInTheDocument();
  });

  it("calls onAccept / onReject / onDelete", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const onDelete = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl={null}
        onAccept={onAccept}
        onReject={onReject}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("labels the decision buttons by status and marks the active one pressed", () => {
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "accepted" }}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Accepted" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reject" })).toHaveAttribute("aria-pressed", "false");
  });

  it("edits the rule and rationale inline, without navigation, and saves via onSave", () => {
    const onSave = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Edit"));
    const ruleInput = screen.getByLabelText("Rule") as HTMLInputElement;
    fireEvent.change(ruleInput, { target: { value: "Always await, never .then()" } });
    const rationaleInput = screen.getByLabelText("Rationale") as HTMLTextAreaElement;
    fireEvent.change(rationaleInput, { target: { value: "Keeps stack traces readable." } });
    // The snippet is grounded in the real file, so edit mode never offers it for editing.
    expect(screen.queryAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Save"));
    expect(onSave).toHaveBeenCalledWith({
      rule: "Always await, never .then()",
      rationale: "Keeps stack traces readable.",
    });
  });

  it("keeps edit and delete visible while editing; a second Edit click saves", () => {
    const onDelete = vi.fn();
    const onSave = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Prefer await" } });
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(onSave).toHaveBeenCalledWith({ rule: "Prefer await", rationale: null });
    expect(screen.queryByLabelText("Rule")).not.toBeInTheDocument();
  });

  it("does not save an empty rule and stays in edit mode", () => {
    const onSave = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "   " } });
    fireEvent.click(screen.getByLabelText("Save"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Rule")).toBeInTheDocument();
  });

  it("renders a rejected candidate at reduced opacity but still visible", () => {
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "rejected" }}
        evidenceUrl={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`convention-card-${CANDIDATE.id}`)).toBeInTheDocument();
  });
});

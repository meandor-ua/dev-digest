import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0037, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

const traceEnabled: boolean[] = [];
vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: (_id: string, enabled: boolean) => {
    traceEnabled.push(enabled);
    return { data: TRACE, isLoading: false };
  },
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.0037")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("renders the run's actual findings, not just cost/stats (criterion 23)", () => {
    const findings = [
      {
        id: "f1",
        severity: "CRITICAL" as const,
        category: "security" as const,
        title: "Hardcoded Stripe secret key in commit",
        file: "src/config.ts",
        start_line: 12,
        end_line: 12,
        rationale: "Line 12 contains a literal secret key.",
        suggestion: null,
        confidence: 0.98,
        review_id: "rv1",
        accepted_at: null,
        dismissed_at: null,
      },
    ];
    renderWithIntl(
      <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} findings={findings} onClose={() => {}} />,
    );
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText(/src\/config\.ts:12/)).toBeInTheDocument();
  });
});

describe("Run Trace drawer — persisted log vs live log", () => {
  it("lists the persisted trace log for a finished run (was '0 lines')", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" running={false} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    expect(screen.getByText("Starting review with agent Security")).toBeInTheDocument();
  });

  it("while running, gates the trace fetch off the server's running flag", () => {
    traceEnabled.length = 0;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" running onClose={() => {}} />);
    expect(traceEnabled.every((e) => e === false)).toBe(true);
  });

  it("falls back to the trace's agent name when none is passed", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" running={false} onClose={() => {}} />);
    expect(screen.getByText(/Security/)).toBeInTheDocument();
  });
});

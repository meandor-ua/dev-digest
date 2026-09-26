import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import type { RunTrace } from "@devdigest/shared";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const renderRuns = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0037, findings: 0, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

describe("TraceBody", () => {
  it("renders configuration, stats and the empty findings/tool-call states", () => {
    renderRuns(<TraceBody trace={TRACE} findings={[]} />);
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText(messages.trace.noFindings)).toBeInTheDocument();
    expect(screen.getByText(messages.trace.noToolCalls)).toBeInTheDocument();
  });

  it("only lists prompt blocks for the segments the run actually had", () => {
    renderRuns(<TraceBody trace={TRACE} findings={[]} />);
    fireEvent.click(screen.getByText(messages.trace.promptAssembly));
    expect(screen.getByText(messages.trace.prompt.system)).toBeInTheDocument();
    expect(screen.getByText(messages.trace.prompt.user)).toBeInTheDocument();
    expect(screen.queryByText(messages.trace.prompt.skills)).not.toBeInTheDocument();
  });
});

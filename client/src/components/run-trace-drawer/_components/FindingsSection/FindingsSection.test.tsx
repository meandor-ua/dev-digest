import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsSection } from "./FindingsSection";

afterEach(cleanup);

const renderRuns = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const FINDING = {
  id: "f1",
  severity: "CRITICAL",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 12,
  end_line: 14,
  rationale: "An API key is committed.",
  suggestion: "Read it from the environment.",
} as FindingRecord;

describe("FindingsSection", () => {
  it("shows an empty state when the run has no findings", () => {
    renderRuns(<FindingsSection findings={[]} />);
    expect(screen.getByText(messages.trace.noFindings)).toBeInTheDocument();
  });

  it("lists each finding with severity, location range and suggested fix", () => {
    renderRuns(<FindingsSection findings={[FINDING]} />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12-14")).toBeInTheDocument();
    expect(screen.getByText("Read it from the environment.")).toBeInTheDocument();
  });
});

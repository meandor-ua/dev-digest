import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import { ToolCallRow } from "./ToolCallRow";

afterEach(cleanup);

const renderRuns = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("ToolCallRow", () => {
  const tc = { tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 };

  it("shows the tool, its args and duration, with details collapsed", () => {
    renderRuns(<ToolCallRow tc={tc} />);
    expect(screen.getByText("review_file")).toBeInTheDocument();
    expect(screen.getByText("(src/config.ts)")).toBeInTheDocument();
    expect(screen.getByText("1200ms")).toBeInTheDocument();
    expect(screen.queryByText(/preview truncated/)).not.toBeInTheDocument();
  });

  it("expands the args/result detail on click", () => {
    renderRuns(<ToolCallRow tc={tc} />);
    fireEvent.click(screen.getByText("review_file"));
    expect(screen.getByText(/preview truncated/)).toBeInTheDocument();
  });
});

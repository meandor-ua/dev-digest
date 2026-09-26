import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import { PromptModalBody } from "./PromptModalBody";

afterEach(cleanup);

const renderRuns = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("PromptModalBody", () => {
  const text = "You are a reviewer.\nFlag secrets.\nCite file:line.";

  it("renders the whole prompt text", () => {
    renderRuns(<PromptModalBody text={text} />);
    expect(screen.getByText(/Flag secrets\./)).toBeInTheDocument();
  });

  it("filters to matching lines and shows the match count", () => {
    renderRuns(<PromptModalBody text={text} />);
    fireEvent.change(screen.getByPlaceholderText(messages.trace.prompt.search), { target: { value: "secret" } });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/Cite file:line/)).not.toBeInTheDocument();
  });

  it("shows a no-matches message when nothing matches", () => {
    renderRuns(<PromptModalBody text={text} />);
    fireEvent.change(screen.getByPlaceholderText(messages.trace.prompt.search), { target: { value: "zzz" } });
    expect(screen.getByText("No matches for “zzz”.")).toBeInTheDocument();
  });
});

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

const renderRuns = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("PromptBlock", () => {
  it("starts collapsed and expands the prompt text on header click", () => {
    renderRuns(<PromptBlock label="System" text="You are a reviewer." color="var(--accent)" />);
    expect(screen.queryByText("You are a reviewer.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("System"));
    expect(screen.getByText("You are a reviewer.")).toBeInTheDocument();
  });

  it("opens the fullscreen view with a line search without toggling the block", () => {
    renderRuns(<PromptBlock label="System" text="You are a reviewer." color="var(--accent)" />);
    fireEvent.click(screen.getByRole("button", { name: messages.trace.prompt.fullscreen }));
    expect(screen.getByPlaceholderText(messages.trace.prompt.search)).toBeInTheDocument();
  });
});

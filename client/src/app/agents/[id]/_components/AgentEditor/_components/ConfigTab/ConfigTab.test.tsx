import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <ConfigTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab Cancel", () => {
  it("hides Cancel until the form is dirty, then reverts on click", () => {
    renderTab();
    // Clean form: no Cancel button.
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();

    const name = screen.getByDisplayValue("Security Reviewer") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Security Reviewer X" } });

    // Dirty: Cancel appears.
    const cancel = screen.getByText("Cancel");
    expect(cancel).toBeInTheDocument();

    fireEvent.click(cancel);

    // Reverted to baseline; Cancel disappears again.
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });
});

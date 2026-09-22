import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

const wrap = (agent: Agent) => (
  <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
    <ToastProvider>
      <ConfigTab agent={agent} />
    </ToastProvider>
  </NextIntlClientProvider>
);

function renderTab(agent: Agent = AGENT) {
  return render(wrap(agent));
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

describe("ConfigTab draft", () => {
  it("rebases onto an outside change without showing Cancel, and Save sends only edited fields", () => {
    const { rerender } = renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });

    // The agent is disabled elsewhere (e.g. the rail toggle) while the tab stays mounted.
    rerender(wrap({ ...AGENT, enabled: false }));

    fireEvent.click(screen.getByRole("button", { name: /Save agent/ }));
    // Only the user's edit is sent — the stale `enabled: true` is not re-sent.
    expect(mutate).toHaveBeenCalledWith({ id: "ag1", patch: { name: "Renamed" } }, expect.anything());
  });

  it("an outside change alone leaves the form clean: no Cancel, Save disabled", () => {
    const { rerender } = renderTab();
    rerender(wrap({ ...AGENT, enabled: false }));
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save agent/ })).toBeDisabled();
  });
});

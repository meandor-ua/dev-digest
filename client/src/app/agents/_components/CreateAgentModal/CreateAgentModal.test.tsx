import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agents.json";

const { mutateAsync, routerPush } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { CreateAgentModal } from "./CreateAgentModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

describe("CreateAgentModal", () => {
  it("creates the agent with the entered fields, then closes and opens its config tab", async () => {
    mutateAsync.mockResolvedValue({ id: "ag-9" });
    const { onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText(messages.create.fields.namePlaceholder), {
      target: { value: "  Perf Reviewer  " },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.create.create }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/agents/ag-9?tab=config"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Perf Reviewer",
        provider: "openai",
        model: "gpt-4.1",
        system_prompt: messages.create.defaultSystemPrompt,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the default name when the name is left blank", async () => {
    mutateAsync.mockResolvedValue({ id: "ag-1" });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: messages.create.create }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: messages.create.defaultName })),
    );
  });

  it("closes without creating on Cancel", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: messages.create.cancel }));
    expect(onClose).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

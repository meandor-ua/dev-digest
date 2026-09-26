import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const { updateMutate, settings } = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  settings: { current: { feature_models: {} as Record<string, unknown> } },
}));

vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: settings.current }),
  useUpdateSettings: () => ({ mutate: updateMutate }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [{ id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" }] }),
}));

import { SettingsModels } from "./SettingsModels";

function renderModels() {
  render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  settings.current = { feature_models: {} };
});

describe("SettingsModels — conventions row", () => {
  it("has its own row with no hardcoded model: Auto until one is picked", () => {
    renderModels();
    expect(screen.getByText("Conventions · classification")).toBeInTheDocument();
    expect(screen.getByText("Auto — the model most of your enabled agents use")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();
    expect(screen.getByText("auto")).toBeInTheDocument();
    // Features that do have a registry default still say so.
    expect(screen.getAllByText("default")).toHaveLength(4);
  });

  it("picking a model while on Auto saves it as an openrouter choice", () => {
    renderModels();
    fireEvent.click(screen.getByText("Auto — the model most of your enabled agents use"));
    const listed = screen.getAllByText(/deepseek\/deepseek-v4-flash/);
    fireEvent.click(listed.at(-1)!);
    expect(updateMutate).toHaveBeenCalledWith({
      feature_models: { conventions: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" } },
    });
  });

  it("picking Auto clears the saved choice and keeps the other features' choices", () => {
    settings.current = {
      feature_models: {
        conventions: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
        onboarding: { provider: "openrouter", model: "x/y" },
      },
    };
    renderModels();
    const conventionsValue = screen.getAllByText("deepseek/deepseek-v4-flash").at(-1)!;
    fireEvent.click(conventionsValue);
    fireEvent.click(screen.getByText("Auto — the model most of your enabled agents use"));
    expect(updateMutate).toHaveBeenCalledWith({
      feature_models: { onboarding: { provider: "openrouter", model: "x/y" } },
    });
  });
});

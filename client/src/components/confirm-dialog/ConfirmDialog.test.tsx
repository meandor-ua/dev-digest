import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={{ common: messages }}>
    {ui}
  </NextIntlClientProvider>
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfirmDialog", () => {
  it("renders the unchanged prompt message and default Ok/Cancel labels", () => {
    render(wrap(<ConfirmDialog message="Delete this thing?" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    expect(screen.getByText("Delete this thing?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ok" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("fires onConfirm and not onCancel when Ok is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />));
    fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("fires onCancel and not onConfirm when Cancel is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires onCancel (not onConfirm) when the header close (X) button is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

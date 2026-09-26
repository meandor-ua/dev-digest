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
  it("renders the unchanged prompt message and default Delete/Cancel labels", () => {
    render(wrap(<ConfirmDialog message="Delete this thing?" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    expect(screen.getByText("Delete this thing?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("fires onConfirm and not onCancel when the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
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

  it("uses a caller-supplied confirm label", () => {
    render(wrap(<ConfirmDialog message="Remove?" confirmLabel="Remove" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("focuses Cancel on open and cancels on Escape", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores Escape while the action is pending", () => {
    const onCancel = vi.fn();
    render(wrap(<ConfirmDialog message="Delete?" pending onConfirm={vi.fn()} onCancel={onCancel} />));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog and returns focus to the trigger on close", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            trigger
          </button>
          {open && <ConfirmDialog message="Delete?" onConfirm={vi.fn()} onCancel={() => setOpen(false)} />}
        </>
      );
    }
    render(wrap(<Harness />));
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    const confirm = screen.getByRole("button", { name: "Delete" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });
});

import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, renderHook } from "@testing-library/react";
import { UnsavedChangesProvider, useReportUnsaved, useConfirmDiscard } from "./unsaved-changes";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Editor({ dirty }: { dirty: boolean }) {
  useReportUnsaved(dirty);
  return null;
}

/** What the native "leave site?" prompt actually hangs off. */
const fireBeforeUnload = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("useReportUnsaved — tab close / reload", () => {
  it("warns while dirty, and stops warning once saved or unmounted", () => {
    const { rerender, unmount } = render(
      <UnsavedChangesProvider>
        <Editor dirty />
      </UnsavedChangesProvider>,
    );
    expect(fireBeforeUnload()).toBe(true);

    rerender(
      <UnsavedChangesProvider>
        <Editor dirty={false} />
      </UnsavedChangesProvider>,
    );
    expect(fireBeforeUnload()).toBe(false);

    rerender(
      <UnsavedChangesProvider>
        <Editor dirty />
      </UnsavedChangesProvider>,
    );
    expect(fireBeforeUnload()).toBe(true);
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });
});

describe("useConfirmDiscard — in-app navigation", () => {
  function setup(dirty: boolean) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UnsavedChangesProvider>
        {children}
        <Editor dirty={dirty} />
      </UnsavedChangesProvider>
    );
    return renderHook(() => useConfirmDiscard(), { wrapper });
  }

  it("does not prompt when there is nothing unsaved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup(false);
    expect(result.current("Discard?")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("prompts while dirty and relays the answer", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = setup(true);
    expect(result.current("Discard?")).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Discard?");

    confirm.mockReturnValue(true);
    expect(result.current("Discard?")).toBe(true);
  });

  it("outside a provider there is never anything unsaved", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useConfirmDiscard());
    expect(result.current("Discard?")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

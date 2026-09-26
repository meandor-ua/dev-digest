import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastProvider, useToast, notify } from "./toast";

afterEach(cleanup);

let api: ReturnType<typeof useToast>;
function Grab() {
  api = useToast();
  return null;
}

describe("ToastProvider", () => {
  it("shows an identical visible toast once — the global mutation handler and a caller's onError often both fire", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => {
      notify.error("Skill not found");
      api.error("Skill not found");
    });
    expect(screen.getAllByText("Skill not found")).toHaveLength(1);
  });

  it("still shows distinct messages, and the same text under a different kind", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => {
      api.error("Skill not found");
      api.error("Couldn’t save skills. Reverted.");
      api.info("Skill not found");
    });
    expect(screen.getAllByText("Skill not found")).toHaveLength(2);
    expect(screen.getByText("Couldn’t save skills. Reverted.")).toBeInTheDocument();
  });
});

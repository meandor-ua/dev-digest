import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRefreshWhenRunsSettle, useRunEvents, useDeleteRun, useDeleteReview } from "./reviews";

afterEach(cleanup);

function setup(initial: string[] | undefined) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ ids }) => useRefreshWhenRunsSettle("pr1", ids), {
    wrapper,
    initialProps: { ids: initial },
  });
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
  return { ...hook, spy, keys };
}

describe("useRefreshWhenRunsSettle", () => {
  it("refreshes reviews, run history, PR detail and the PR list when a run leaves the active set", () => {
    const { rerender, keys } = setup([]);
    rerender({ ids: ["run-1"] }); // run started
    rerender({ ids: [] }); // run finished — the poll emptied
    expect(keys()).toEqual([["reviews", "pr1"], ["pr-runs", "pr1"], ["pull", "pr1"], ["pulls"], ["run-trace"]]);
  });

  it("does not refresh on first load or when a run merely starts", () => {
    const { rerender, spy } = setup([]);
    rerender({ ids: ["run-1"] });
    rerender({ ids: ["run-1", "run-2"] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refreshes when ONE of several parallel runs finishes (Run all agents)", () => {
    const { rerender, spy } = setup(["run-1", "run-2"]);
    rerender({ ids: ["run-2"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
  });

  it("ignores the loading state (undefined) instead of treating it as 'everything finished'", () => {
    const { rerender, spy } = setup(["run-1"]);
    rerender({ ids: undefined });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useRunEvents — one shared EventSource per run", () => {
  class FakeES {
    static all: FakeES[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
    closed = false;
    constructor(public url: string) {
      FakeES.all.push(this);
    }
    addEventListener(k: string, f: (e: MessageEvent) => void) {
      (this.listeners[k] ??= []).push(f);
    }
    close() {
      this.closed = true;
    }
    emit(kind: string, msg: string) {
      const data = JSON.stringify({ runId: "r", seq: 1, kind, msg, t: "00.1" });
      for (const f of this.listeners[kind] ?? []) f({ data } as MessageEvent);
    }
  }
  const g = globalThis as unknown as { EventSource: unknown };
  const original = g.EventSource;
  beforeEach(async () => {
    // Let the previous test's deferred stream closes run (module-level map).
    await new Promise((r) => setTimeout(r, 0));
    FakeES.all = [];
    g.EventSource = FakeES;
  });
  afterEach(() => {
    g.EventSource = original;
  });

  it("the live section and the trace drawer on the same run share ONE connection", () => {
    // Findings tab live section (two runs) + drawer (one of them).
    const live = renderHook(() => useRunEvents(["run-a", "run-b"]));
    const drawer = renderHook(() => useRunEvents(["run-a"]));
    expect(FakeES.all.map((e) => e.url.split("/runs/")[1])).toEqual(["run-a/events", "run-b/events"]);

    act(() => FakeES.all[0]!.emit("info", "Diff ready"));
    act(() => FakeES.all[1]!.emit("tool", "Reviewing b"));
    expect(drawer.result.current.events.map((e) => e.msg)).toEqual(["Diff ready"]);
    expect(live.result.current.events.map((e) => e.msg)).toEqual(["Diff ready", "Reviewing b"]);
    expect(drawer.result.current.running).toBe(true);
  });

  it("a drawer opened later still sees the events already received", () => {
    const live = renderHook(() => useRunEvents(["run-a"]));
    act(() => FakeES.all[0]!.emit("info", "early line"));
    const drawer = renderHook(() => useRunEvents(["run-a"]));
    expect(drawer.result.current.events.map((e) => e.msg)).toEqual(["early line"]);
    live.unmount();
    drawer.unmount();
  });

  it("closes the connection once the last subscriber leaves", async () => {
    const a = renderHook(() => useRunEvents(["run-a"]));
    const b = renderHook(() => useRunEvents(["run-a"]));
    a.unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeES.all[0]!.closed).toBe(false);
    b.unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeES.all[0]!.closed).toBe(true);
  });

  it("reports not running once the stream ends", () => {
    const h = renderHook(() => useRunEvents(["run-a"]));
    act(() => FakeES.all[0]!.onerror?.());
    expect(h.result.current.running).toBe(false);
  });
});

vi.mock("../api", async (orig) => ({
  ...(await orig<object>()),
  api: { del: async () => ({ ok: true }), get: async () => [], post: async () => ({}) },
}));

describe("deleting a run / review refreshes the PR list's score", () => {
  function mount<T>(hook: () => T) {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const h = renderHook(hook, { wrapper });
    const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    return { h, keys };
  }

  it("useDeleteRun invalidates [pulls] and [pull, prId]", async () => {
    const { h, keys } = mount(() => useDeleteRun("pr1"));
    await act(() => h.result.current.mutateAsync("run-1"));
    await waitFor(() => expect(keys()).toContainEqual(["pulls"]));
    expect(keys()).toContainEqual(["pull", "pr1"]);
  });

  it("useDeleteReview invalidates [pulls] and [pull, prId]", async () => {
    const { h, keys } = mount(() => useDeleteReview("pr1"));
    await act(() => h.result.current.mutateAsync("rv-1"));
    await waitFor(() => expect(keys()).toContainEqual(["pulls"]));
    expect(keys()).toContainEqual(["pull", "pr1"]);
  });
});

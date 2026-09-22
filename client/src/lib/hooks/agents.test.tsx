import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillItem } from "@devdigest/shared";

const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));
vi.mock("../api", () => ({ api: { post, del, get: vi.fn(), put: vi.fn() } }));

import { useSetAgentSkills, useDeleteAgent } from "./agents";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (skill_id: string, enabled: boolean, order: number): AgentSkillItem => ({
  agent_id: "a1",
  skill_id,
  enabled,
  order,
  name: skill_id,
  type: "rubric",
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["agent-skills", "a1"], [item("x", true, 0), item("y", true, 1)]);
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSetAgentSkills("a1"), { wrapper });
  const cached = () => qc.getQueryData<AgentSkillItem[]>(["agent-skills", "a1"])!;
  return { qc, hook, spy, cached };
}

describe("useSetAgentSkills", () => {
  it("an older save resolving first does not clobber a newer optimistic edit", async () => {
    const first = deferred<AgentSkillItem[]>();
    const second = deferred<AgentSkillItem[]>();
    post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { hook, cached } = setup();

    // A: disable x. B (while A is in flight): also disable y.
    act(() => hook.result.current.mutate([{ skill_id: "x", enabled: false }, { skill_id: "y", enabled: true }]));
    await waitFor(() => expect(cached()[0]!.enabled).toBe(false));
    act(() => hook.result.current.mutate([{ skill_id: "x", enabled: false }, { skill_id: "y", enabled: false }]));
    await waitFor(() => expect(cached()[1]!.enabled).toBe(false));

    // A returns first with ITS server state (y still enabled) — must not overwrite B's optimistic y=false.
    await act(async () => first.resolve([item("x", false, 0), item("y", true, 1)]));
    expect(cached()[1]!.enabled).toBe(false);

    await act(async () => second.resolve([item("x", false, 0), item("y", false, 1)]));
    await waitFor(() => expect(cached().map((s) => s.enabled)).toEqual([false, false]));
  });

  it("rolls back on error when it is the only save in flight", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    const { hook, cached } = setup();
    act(() => hook.result.current.mutate([{ skill_id: "x", enabled: false }, { skill_id: "y", enabled: true }]));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(cached()[0]!.enabled).toBe(true);
  });

  it("invalidates skill cards and skill stats, since they are derived from agent links", async () => {
    post.mockResolvedValueOnce([item("x", true, 0)]);
    const { hook, spy } = setup();
    act(() => hook.result.current.mutate([{ skill_id: "x", enabled: true }]));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([["skills"], ["skill-stats"], ["agent-card-stats"], ["agent-stats"]]),
    );
  });
});

describe("useDeleteAgent", () => {
  it("refreshes the skill views too, since deleting an agent cascades its links", async () => {
    del.mockResolvedValue({ ok: true });
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteAgent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("a1");
    });
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(expect.arrayContaining([["agents"], ["skills"], ["skill-stats"]]));
  });
});

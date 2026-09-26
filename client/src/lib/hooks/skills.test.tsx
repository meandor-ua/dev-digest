import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillWithStats } from "@devdigest/shared";

const { del, put } = vi.hoisted(() => ({ del: vi.fn(), put: vi.fn() }));
vi.mock("../api", () => ({ api: { del, get: vi.fn(), post: vi.fn(), put } }));

import { useDeleteSkill, useSetSkillContext, useUpdateSkill } from "./skills";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sk = (id: string) => ({ id, name: id }) as SkillWithStats;

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("useUpdateSkill", () => {
  it("invalidates the agent cards' enabled-skill counts (enabled toggles change them)", async () => {
    put.mockResolvedValue(sk("a"));
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateSkill(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "a", patch: { enabled: false } });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent-card-stats"] });
  });
});

describe("useSetSkillContext", () => {
  it("scopes the saved attachments to the repo being viewed", async () => {
    put.mockResolvedValue({ attached: ["docs/a.md"] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetSkillContext("sk1", "repo-1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(["docs/a.md"]);
    });
    expect(put).toHaveBeenCalledWith("/skills/sk1/context", { repo_id: "repo-1", paths: ["docs/a.md"] });
  });
});

describe("useDeleteSkill", () => {
  it("removes the skill from the cached list before the caller's onSuccess runs", async () => {
    del.mockResolvedValue({ ok: true });
    const qc = new QueryClient();
    qc.setQueryData(["skills"], [sk("a"), sk("b")]);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteSkill(), { wrapper });

    let seenByCaller: SkillWithStats[] | undefined;
    await act(async () => {
      await result.current.mutateAsync("a", {
        // What /skills would read when the caller navigates there.
        onSuccess: () => {
          seenByCaller = qc.getQueryData<SkillWithStats[]>(["skills"]);
        },
      });
    });
    expect(seenByCaller?.map((s) => s.id)).toEqual(["b"]);
  });
});

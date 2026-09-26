import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillWithStats } from "@devdigest/shared";

const { del } = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("../api", () => ({ api: { del, get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import { useDeleteSkill } from "./skills";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sk = (id: string) => ({ id, name: id }) as SkillWithStats;

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

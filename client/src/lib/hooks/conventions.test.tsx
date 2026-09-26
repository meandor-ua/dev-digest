import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../api", () => ({ api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() } }));

import { useExtractConventions, EXTRACT_TIMEOUT_MS } from "./conventions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useExtractConventions("repo-1"), { wrapper });
  return { qc, invalidate, result };
}

describe("useExtractConventions", () => {
  it("waits long enough for a slow model (a real scan measured 106s)", async () => {
    post.mockResolvedValue({ candidates: [] });
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(EXTRACT_TIMEOUT_MS).toBeGreaterThanOrEqual(270_000);
    expect(post).toHaveBeenCalledWith("/repos/repo-1/conventions/extract", undefined, {
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });
  });

  it("seeds the list from a successful scan", async () => {
    post.mockResolvedValue({ candidates: [{ id: "c1" }] });
    const { qc, result } = setup();
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(qc.getQueryData(["conventions", "repo-1"])).toEqual([{ id: "c1" }]);
  });

  it("refetches the list after a timeout or a 409 — the server may still finish the scan", async () => {
    post.mockRejectedValue(new Error("A scan of this repo is still running"));
    const { invalidate, result } = setup();
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["conventions", "repo-1"] });
  });
});

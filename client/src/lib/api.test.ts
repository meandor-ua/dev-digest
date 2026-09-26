import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, apiFetch } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fetch that never settles on its own — only an abort ends it. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  );
}

describe("apiFetch", () => {
  it("turns a timeout into a coded ApiError", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const p = apiFetch("/slow", { timeoutMs: 50 });
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout", status: 0 });
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it("still honours the caller's own signal when a timeout is also set", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const caller = new AbortController();
    const p = apiFetch("/slow", { timeoutMs: 60_000, signal: caller.signal });
    caller.abort();
    const err = await p.catch((e: unknown) => e);
    // The caller cancelled — neither a timeout nor an outage.
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it("keeps the timeout running while the response body is read", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            }),
        } as unknown as Response),
      ),
    );
    const p = apiFetch("/slow-body", { timeoutMs: 50 });
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

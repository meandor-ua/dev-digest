/* PRRow + the REAL review hooks and react-query cache (only the network is
   faked) — pins the shared ["pr-active-runs", prId] cache interaction that
   the hook-mocked PRRow.test.tsx cannot see. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "m", enabled: true }] }),
}));
vi.mock("@/lib/toast", () => ({ notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

let active: { run_id: string }[] = [];
const get = vi.fn(async (path: string) => (path.endsWith("/runs/active") ? active : []));
vi.mock("../../../../../../lib/api", async (orig) => ({
  ...(await orig<object>()),
  api: {
    get: (p: string) => get(p),
    post: async () => ({ pr_id: "pr-1", runs: [{ run_id: "run-1" }], reviews: [] }),
  },
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  get.mockClear();
  active = [];
});

const PR = {
  id: "pr-1", number: 482, title: "T", author: "a", branch: "b", base: "main", head_sha: "h",
  additions: 1, deletions: 0, files_count: 1, status: "needs_review", opened_at: null,
  updated_at: null, score: null,
} as PrMeta;

describe("PRRow — run started while an EMPTY active-runs result is still cached", () => {
  it("refetches active runs instead of trusting the fresh-but-stale []", async () => {
    // The PR page (or a finished earlier run) left a fresh [] in the shared cache.
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    qc.setQueryData(["pr-active-runs", "pr-1"], []);
    active = [{ run_id: "run-1" }]; // the server now has the new run

    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <PRRow pr={PR} repoId="r1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    fireEvent.click(screen.getByText("Run all enabled agents"));

    await screen.findByTestId("running-chip");
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith("/pulls/pr-1/runs/active"));
    expect(qc.getQueryData(["pr-active-runs", "pr-1"])).toEqual([{ run_id: "run-1" }]);
  });
});

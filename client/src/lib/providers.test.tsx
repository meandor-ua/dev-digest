import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import commonMessages from "../../messages/en/common.json";
import { ApiError } from "./api";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { Providers } from "./providers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Failing({ error }: { error: Error }) {
  const m = useMutation({ mutationFn: () => Promise.reject(error) });
  return (
    <button type="button" onClick={() => m.mutate()}>
      go
    </button>
  );
}

function renderWith(error: Error) {
  // RepoProvider lists repos on mount — answer with none.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
  render(
    <NextIntlClientProvider locale="en" messages={{ common: commonMessages }}>
      <Providers>
        <Failing error={error} />
      </Providers>
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "go" }));
}

describe("Providers — global mutation error toast", () => {
  it("shows translated copy for a client-side timeout, not the ApiError's English text", async () => {
    renderWith(new ApiError("english-only text", 0, "timeout"));
    expect(await screen.findByText(commonMessages.errors.timeout)).toBeInTheDocument();
    expect(screen.queryByText("english-only text")).not.toBeInTheDocument();
  });

  it("passes a server error's own message through unchanged", async () => {
    renderWith(new ApiError("Skill not found", 404, "not_found"));
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
  });
});

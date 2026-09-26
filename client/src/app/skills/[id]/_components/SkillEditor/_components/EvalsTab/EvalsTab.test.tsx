import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/skills.json";
import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

describe("EvalsTab", () => {
  it("renders the translated evals placeholder", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <EvalsTab />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(messages.evals.empty)).toBeInTheDocument();
    expect(screen.getByText(messages.evals.emptyBody)).toBeInTheDocument();
  });
});

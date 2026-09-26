import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

const BODY = "### Flag untested branches\n- **error paths** must be asserted";

function renderTab(props: Partial<React.ComponentProps<typeof PreviewTab>> = {}) {
  const onRestore = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <PreviewTab body={BODY} dirty={false} version={4} onRestore={onRestore} {...props} />
    </NextIntlClientProvider>,
  );
  return onRestore;
}

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the body as Markdown, exactly as the reviewing agent receives it", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Flag untested branches" })).toBeInTheDocument();
    expect(screen.getByText("error paths").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("shows the title and subtitle, without a section header or token badge", () => {
    renderTab();
    expect(screen.getByText(messages.preview.title)).toBeInTheDocument();
    expect(screen.getByText(messages.preview.subtitle)).toBeInTheDocument();
    expect(screen.queryByText("Skills / rules", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("marks an unsaved draft and lets Restore drop it", () => {
    const onRestore = renderTab({ body: "# Draft heading", dirty: true });
    expect(screen.getByRole("heading", { name: "Draft heading" })).toBeInTheDocument();
    expect(screen.getByText(messages.preview.draftBadge)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore v4" }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("keeps Restore disabled and hides the draft badge when nothing is unsaved", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Restore v4" })).toBeDisabled();
    expect(screen.queryByText(messages.preview.draftBadge)).not.toBeInTheDocument();
  });
});

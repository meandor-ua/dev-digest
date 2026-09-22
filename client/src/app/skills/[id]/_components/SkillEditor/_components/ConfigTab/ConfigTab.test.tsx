import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const { updateMutate, deleteMutate, routerPush } = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false, isSuccess: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { ConfigTab } from "./ConfigTab";

const MANUAL: Skill = {
  id: "sk1",
  name: "Security Rubric",
  description: "Detects security issues",
  type: "security",
  source: "manual",
  body: "# Security Rubric\nFlag secrets.",
  enabled: true,
  version: 3,
  evidence_files: null,
};
const IMPORTED: Skill = { ...MANUAL, source: "imported_url", enabled: false };

const wrap = (skill: Skill) => (
  <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
    <ToastProvider>
      <ConfigTab skill={skill} />
    </ToastProvider>
  </NextIntlClientProvider>
);
const renderTab = (skill: Skill) => render(wrap(skill));

const body = () => screen.getByRole("textbox", { name: messages.config.bodyLabel });
const save = () => screen.getByRole("button", { name: /Save/ });

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  routerPush.mockReset();
});

describe("ConfigTab", () => {
  it("shows the skill's current values", () => {
    renderTab(MANUAL);
    expect(screen.getByDisplayValue("Security Rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Detects security issues")).toBeInTheDocument();
    expect(body()).toHaveValue(MANUAL.body);
    expect(screen.getByRole("combobox")).toHaveValue("security");
  });

  it("keeps Save disabled and Cancel hidden until something changes", () => {
    renderTab(MANUAL);
    expect(save()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("saves the edited body as a patch", () => {
    renderTab(MANUAL);
    fireEvent.change(body(), { target: { value: "# New rule" } });
    fireEvent.click(save());
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# New rule" } }, // only what changed
      expect.anything(),
    );
  });

  it("does not allow saving an empty body", () => {
    renderTab(MANUAL);
    fireEvent.change(body(), { target: { value: "   " } });
    expect(save()).toBeDisabled();
  });

  it("Cancel restores the original values", () => {
    renderTab(MANUAL);
    fireEvent.change(body(), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(body()).toHaveValue(MANUAL.body);
    expect(save()).toBeDisabled();
  });

  it("warns that an imported skill must be vetted, but not for a manual one", () => {
    renderTab(IMPORTED);
    expect(screen.getByRole("note")).toHaveTextContent(/external source/);
    cleanup();
    renderTab(MANUAL);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("picks up a restored body instead of re-saving the stale one", () => {
    const { rerender } = renderTab(MANUAL);
    rerender(wrap({ ...MANUAL, body: "# Restored v1", version: 4 }));
    expect(body()).toHaveValue("# Restored v1");
    expect(save()).toBeDisabled(); // not dirty — nothing stale to save
  });

  it("keeps an unsaved edit when another field changes on the server", () => {
    const { rerender } = renderTab(MANUAL);
    fireEvent.change(body(), { target: { value: "# my draft" } });
    rerender(wrap({ ...MANUAL, enabled: false })); // toggled from the skills list
    expect(body()).toHaveValue("# my draft");
    fireEvent.click(save());
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { body: "# my draft" } }, expect.anything());
  });

  it("shows an 'unsaved' chip in the editor header only while dirty", () => {
    renderTab(MANUAL);
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
    fireEvent.change(body(), { target: { value: "# dirty" } });
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("sends an optional change note as `message` alongside the patch", () => {
    renderTab(MANUAL);
    fireEvent.change(body(), { target: { value: "# New rule" } });
    fireEvent.change(screen.getByPlaceholderText("What changed and why…"), {
      target: { value: "Tighten the rule" },
    });
    fireEvent.click(save());
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# New rule", message: "Tighten the rule" } },
      expect.anything(),
    );
  });

  it("offers the change note only for a body edit, never for a metadata-only edit", () => {
    renderTab(MANUAL);
    fireEvent.change(screen.getByDisplayValue("Security Rubric"), { target: { value: "Renamed" } });
    expect(screen.queryByPlaceholderText(messages.config.changeNotePlaceholder)).not.toBeInTheDocument();
    fireEvent.change(body(), { target: { value: "# New rule" } });
    expect(screen.getByPlaceholderText(messages.config.changeNotePlaceholder)).toBeInTheDocument();
  });

  it("lays out Name, Description, Type and Skill body in that order with plain type labels", () => {
    renderTab(MANUAL);
    const labels = [
      messages.config.nameLabel,
      messages.config.descriptionLabel,
      messages.config.typeLabel,
      messages.config.bodyLabel,
    ].map((l) => screen.getByText(l));
    labels.slice(1).forEach((label, i) => {
      expect(labels[i]!.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.getByRole("option", { name: "security" })).toBeInTheDocument();
    expect(screen.getByText("security-rubric.md")).toBeInTheDocument();
    expect(screen.getByText("8 tokens")).toBeInTheDocument();
  });

  it("deletes the skill from the danger zone after confirming", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderTab(MANUAL);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
    vi.unstubAllGlobals();
  });

  it("does not delete when the confirmation is dismissed", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderTab(MANUAL);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

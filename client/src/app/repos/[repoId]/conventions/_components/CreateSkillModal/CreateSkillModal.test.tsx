import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

const { draftMutateAsync, createMutate, linkMutate } = vi.hoisted(() => ({
  draftMutateAsync: vi.fn(),
  createMutate: vi.fn(),
  linkMutate: vi.fn(),
}));

const DRAFT = {
  name: "payments-api-conventions",
  description: "3 house conventions extracted from acme/payments-api",
  body: "# payments-api-conventions\n\nHouse conventions...",
  source_convention_ids: ["c1", "c2", "c3"],
};

vi.mock("@/lib/hooks/conventions", () => ({
  useCreateConventionSkill: () => ({ mutateAsync: draftMutateAsync, isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "General Reviewer" }] }),
  useLinkAgentSkill: () => ({ mutate: linkMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

function renderModal() {
  const onClose = vi.fn();
  draftMutateAsync.mockResolvedValue(DRAFT);
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <CreateSkillModal repoId="repo-1" repoName="acme/payments-api" onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateSkillModal", () => {
  it("prefills name/description/body from the draft and shows the merge banner", async () => {
    renderModal();
    expect(await screen.findByLabelText("Name")).toHaveValue(DRAFT.name);
    expect(screen.getByLabelText("Description")).toHaveValue(DRAFT.description);
    expect(screen.getByLabelText("Skill body")).toHaveValue(DRAFT.body);
    expect(
      screen.getByText(/Merged from 3 accepted conventions in acme\/payments-api/),
    ).toBeInTheDocument();
  });

  it("edits the body before saving and creates the skill, then links it to the selected agent", async () => {
    createMutate.mockImplementation((_v: unknown, opts: { onSuccess: (s: { id: string; name: string }) => void }) =>
      opts.onSuccess({ id: "sk-1", name: DRAFT.name }),
    );
    linkMutate.mockImplementation((_v: unknown, opts: { onSettled: () => void }) => opts.onSettled());

    const { onClose } = renderModal();
    const bodyField = await screen.findByLabelText("Skill body");
    fireEvent.change(bodyField, { target: { value: "# edited body" } });
    fireEvent.change(screen.getByLabelText("Link to agent"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: DRAFT.name, body: "# edited body", source: "extracted", enabled: false }),
      expect.anything(),
    );
    expect(linkMutate).toHaveBeenCalledWith("sk-1", expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it("does not link to any agent by default", async () => {
    createMutate.mockImplementation((_v: unknown, opts: { onSuccess: (s: { id: string; name: string }) => void }) =>
      opts.onSuccess({ id: "sk-1", name: DRAFT.name }),
    );
    const { onClose } = renderModal();
    expect(await screen.findByLabelText("Link to agent")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(createMutate).toHaveBeenCalled();
    expect(linkMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without saving on Cancel", async () => {
    const { onClose } = renderModal();
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });
});

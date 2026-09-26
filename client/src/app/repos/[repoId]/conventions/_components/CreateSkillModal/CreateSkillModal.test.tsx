import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

const { draftMutateAsync, createMutate, updateMutate, linkMutate } = vi.hoisted(() => ({
  draftMutateAsync: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  linkMutate: vi.fn(),
}));

const DRAFT = {
  name: "repo-conventions",
  description: "House conventions extracted from repository: acme/payments-api",
  body: "# repo-conventions\n\n## acme/payments-api\n\nHouse conventions...",
  source_convention_ids: ["c1", "c2", "c3"],
  existing_skill_id: null as string | null,
};

vi.mock("@/lib/hooks/conventions", () => ({
  useCreateConventionSkill: () => ({ mutateAsync: draftMutateAsync, isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "General Reviewer" }] }),
  useLinkAgentSkill: () => ({ mutate: linkMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

function renderModal(draft = DRAFT) {
  const onClose = vi.fn();
  draftMutateAsync.mockResolvedValue(draft);
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

  it("shows the fixed repo-conventions name read-only", async () => {
    renderModal();
    const nameField = await screen.findByLabelText("Name");
    expect(nameField).toHaveValue("repo-conventions");
    expect(nameField).toHaveAttribute("readonly");
    expect(screen.getByText(/merge into this one skill/)).toBeInTheDocument();
  });

  it("updates the existing repo-conventions skill instead of creating a duplicate", async () => {
    updateMutate.mockImplementation((_v: unknown, opts: { onSuccess: (s: { id: string; name: string }) => void }) =>
      opts.onSuccess({ id: "sk-existing", name: DRAFT.name }),
    );
    const { onClose } = renderModal({ ...DRAFT, existing_skill_id: "sk-existing" });
    expect(await screen.findByText(/other repositories' sections are kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update skill" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "sk-existing",
        patch: expect.objectContaining({
          body: DRAFT.body,
          enabled: false,
          message: "Conventions from acme/payments-api",
        }),
      },
      expect.anything(),
    );
    expect(createMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("links the updated skill to the chosen agent too", async () => {
    updateMutate.mockImplementation((_v: unknown, opts: { onSuccess: (s: { id: string; name: string }) => void }) =>
      opts.onSuccess({ id: "sk-existing", name: DRAFT.name }),
    );
    linkMutate.mockImplementation((_v: unknown, opts: { onSettled: () => void }) => opts.onSettled());
    const { onClose } = renderModal({ ...DRAFT, existing_skill_id: "sk-existing" });
    fireEvent.change(await screen.findByLabelText("Link to agent"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update skill" }));
    expect(linkMutate).toHaveBeenCalledWith("sk-existing", expect.anything());
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

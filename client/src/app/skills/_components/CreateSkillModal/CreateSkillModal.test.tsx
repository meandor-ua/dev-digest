import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const { createMutate, importMutate, push, extractMarkdownFiles } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  importMutate: vi.fn(),
  push: vi.fn(),
  extractMarkdownFiles: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useImportSkill: () => ({ mutate: importMutate, isPending: false }),
}));
vi.mock("./file-extractor", () => ({ extractMarkdownFiles }));

import { CreateSkillModal } from "./CreateSkillModal";

function renderModal(initialTab?: "scratch" | "import") {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <CreateSkillModal onClose={onClose} initialTab={initialTab} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

const type = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateSkillModal", () => {
  it("creates a manual, enabled skill from scratch and opens it", () => {
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "sk9", name: "My Skill" }));
    const { onClose } = renderModal("scratch");
    type("Skill Name", "  My Skill ");
    type("Skill Body (Markdown)", "# Rule\nbody");
    fireEvent.change(screen.getByRole("combobox", { name: "Skill Type" }), { target: { value: "security" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Skill/ }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Skill", body: "# Rule\nbody", type: "security", source: "manual", enabled: true }),
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk9");
  });

  it("keeps Create disabled until both name and body are filled", () => {
    renderModal("scratch");
    const create = screen.getByRole("button", { name: /Create Skill/ });
    expect(create).toBeDisabled();
    type("Skill Name", "Only a name");
    expect(create).toBeDisabled();
    type("Skill Body (Markdown)", "# body");
    expect(create).toBeEnabled();
  });

  it("imports an extracted .md file as an unvetted (disabled) skill named after its heading", async () => {
    extractMarkdownFiles.mockResolvedValue([{ filename: "a.md", content: "# Rule A\nbody" }]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.md")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Rule A"));
    fireEvent.click(screen.getByRole("button", { name: /Import Skill/ }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Rule A", body: "# Rule A\nbody", source: "imported_url", enabled: false }),
      expect.anything(),
    );
  });

  it("imports from a URL through the server-side importer", () => {
    renderModal("scratch");
    fireEvent.click(screen.getByRole("button", { name: "From URL" }));
    const submit = screen.getByRole("button", { name: /Import from URL/ });
    expect(submit).toBeDisabled();
    type("Skill URL", " https://example.com/rule.md ");
    fireEvent.change(screen.getByRole("combobox", { name: "Skill Type" }), { target: { value: "convention" } });
    fireEvent.click(submit);

    expect(importMutate).toHaveBeenCalledWith(
      { url: "https://example.com/rule.md", name: undefined, type: "convention" },
      expect.anything(),
    );
    expect(createMutate).not.toHaveBeenCalled();
  });
});

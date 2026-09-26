import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { ExtractError } from "./file-extractor";

const { createMutate, updateMutate, previewMutate, push, extractMarkdownFiles } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  previewMutate: vi.fn(),
  push: vi.fn(),
  extractMarkdownFiles: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  usePreviewSkillUrl: () => ({ mutate: previewMutate, isPending: false }),
}));
vi.mock("./file-extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./file-extractor")>()),
  extractMarkdownFiles,
}));

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
    // No frontmatter to cut — a single version is enough, no second save.
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("preselects an archive's SKILL.md, saves the raw upload as v1, and cuts the frontmatter into v2", async () => {
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "sk9", name: "api-contract" }));
    const rawContent = "---\nname: api-contract\ndescription: Flag breaking routes.\n---\n# Rules\nbody";
    extractMarkdownFiles.mockResolvedValue([
      { filename: "pkg/README.md", content: "# Readme" },
      { filename: "pkg/SKILL.md", content: rawContent },
    ]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "pkg.zip")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("api-contract"));
    fireEvent.click(screen.getByRole("button", { name: /Import Skill/ }));

    // v1: the raw upload, header included, verbatim.
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Flag breaking routes.", body: rawContent, enabled: false }),
      expect.anything(),
    );
    // v2: the same content with the YAML header cut and no stray whitespace left behind.
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk9", patch: { body: "# Rules\nbody", message: "Removed imported YAML frontmatter" } },
      expect.anything(),
    );
  });

  it("fetches a URL preview, shows the stripped body, and creates v1 raw / v2 stripped on confirm", () => {
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "sk9", name: "Fetched Rule" }));
    const rawBody =
      "---\nname: Fetched Rule\ndescription: Flag breaking routes.\nexternal_skill_imported_from: https://example.com/rule.md\n---\n# Fetched Rule\nbody";
    previewMutate.mockImplementation((_url, opts) =>
      opts.onSuccess({ name: "Fetched Rule", description: "Flag breaking routes.", body: rawBody }),
    );
    renderModal("scratch");
    fireEvent.click(screen.getByRole("button", { name: "From URL" }));
    const fetchBtn = screen.getByRole("button", { name: /Fetch/ });
    expect(fetchBtn).toBeDisabled();
    type("Skill URL", " https://example.com/rule.md ");
    fireEvent.click(fetchBtn);

    expect(previewMutate).toHaveBeenCalledWith("https://example.com/rule.md", expect.anything());
    // No skill is created merely by fetching — only the preview form is filled.
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Fetched Rule");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("Flag breaking routes.");
    // The working body shown/edited by the user is already frontmatter-free.
    expect(screen.getByRole("textbox", { name: "Skill Body (Markdown)" })).toHaveValue("# Fetched Rule\nbody");

    fireEvent.click(screen.getByRole("button", { name: /Import Skill/ }));
    // v1: the raw fetch, header (incl. our provenance stamp) included.
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fetched Rule",
        description: "Flag breaking routes.",
        source: "imported_url",
        body: rawBody,
        enabled: false,
      }),
      expect.anything(),
    );
    // v2: the header cut, no stray whitespace left behind.
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk9", patch: { body: "# Fetched Rule\nbody", message: "Removed imported YAML frontmatter" } },
      expect.anything(),
    );
  });

  it("fills a translated description when the fetched URL has no frontmatter one", () => {
    previewMutate.mockImplementation((_url, opts) =>
      opts.onSuccess({ name: "Fetched Rule", description: "", body: "# Fetched Rule\nbody" }),
    );
    renderModal("scratch");
    fireEvent.click(screen.getByRole("button", { name: "From URL" }));
    type("Skill URL", "https://example.com/rule.md");
    fireEvent.click(screen.getByRole("button", { name: /Fetch/ }));

    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue(
      "Imported from https://example.com/rule.md",
    );
  });

  it("keeps imported provenance when the user switches to the scratch tab before creating", async () => {
    extractMarkdownFiles.mockResolvedValue([{ filename: "a.md", content: "# Rule A\nbody" }]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.md")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Rule A"));

    fireEvent.click(screen.getByRole("button", { name: "Create from scratch" }));
    expect(screen.getByText(/This content was imported/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create Skill/ }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Rule A", source: "imported_url", enabled: false }),
      expect.anything(),
    );
  });

  it("drops imported provenance on Start blank", async () => {
    extractMarkdownFiles.mockResolvedValue([{ filename: "a.md", content: "# Rule A\nbody" }]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.md")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Rule A"));

    fireEvent.click(screen.getByRole("button", { name: "Create from scratch" }));
    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("");
    type("Skill Name", "Mine");
    type("Skill Body (Markdown)", "# mine");
    fireEvent.click(screen.getByRole("button", { name: /Create Skill/ }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mine", source: "manual", enabled: true }),
      expect.anything(),
    );
  });

  it("keeps manual provenance for typed content submitted from the import tab", () => {
    renderModal("scratch");
    type("Skill Name", "Typed");
    type("Skill Body (Markdown)", "# typed");
    fireEvent.click(screen.getByRole("button", { name: "Import from file (.md / .zip)" }));
    fireEvent.click(screen.getByRole("button", { name: /Import Skill/ }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Typed", source: "manual", enabled: true }),
      expect.anything(),
    );
  });

  it("fills a translated description when the imported file has no frontmatter one", async () => {
    extractMarkdownFiles.mockResolvedValue([{ filename: "pkg/rule.md", content: "# Rule A\nbody" }]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "pkg.zip")] } });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue(
        "Imported from pkg/rule.md",
      ),
    );
  });

  it("fills empty Name/Description from a pasted YAML header on the scratch tab, without stripping it from the visible body", () => {
    renderModal("scratch");
    type(
      "Skill Body (Markdown)",
      "---\nname: Pasted Rule\ndescription: Flag pasted headers.\n---\n# Rules\nbody",
    );

    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Pasted Rule");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("Flag pasted headers.");
    // The header stays visible — cutting happens only on submit, never live.
    expect(screen.getByRole("textbox", { name: "Skill Body (Markdown)" })).toHaveValue(
      "---\nname: Pasted Rule\ndescription: Flag pasted headers.\n---\n# Rules\nbody",
    );
  });

  it("does not overwrite an already-filled Name/Description with a pasted header's values", () => {
    renderModal("scratch");
    type("Skill Name", "My Own Name");
    type("Directive Description", "My own description");
    type("Skill Body (Markdown)", "---\nname: Pasted Rule\ndescription: Pasted desc.\n---\nbody");

    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("My Own Name");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("My own description");
  });

  it("creates a scratch skill with a pasted header as v1, then cuts the header into v2 only after Create Skill is pressed", () => {
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "sk9", name: "Pasted Rule" }));
    const rawContent = "---\nname: Pasted Rule\ndescription: Flag pasted headers.\n---\n# Rules\nbody";
    renderModal("scratch");
    type("Skill Body (Markdown)", rawContent);

    // Still raw right before submit — the header is never cut ahead of time.
    expect(screen.getByRole("textbox", { name: "Skill Body (Markdown)" })).toHaveValue(rawContent);
    fireEvent.click(screen.getByRole("button", { name: /Create Skill/ }));

    // v1: the raw, header-included body — manual/enabled provenance, unaffected by the split.
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: rawContent, source: "manual", enabled: true }),
      expect.anything(),
    );
    // v2: the header cut, no stray whitespace left behind.
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk9", patch: { body: "# Rules\nbody", message: "Removed YAML frontmatter" } },
      expect.anything(),
    );
  });

  it("file import keeps Name/Description the user filled in before importing", async () => {
    extractMarkdownFiles.mockResolvedValue([
      { filename: "SKILL.md", content: "---\nname: file-name\ndescription: File desc.\n---\n# Rules\nbody" },
    ]);
    renderModal("import");
    type("Skill Name", "My Name");
    type("Directive Description", "My desc.");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "SKILL.md")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Body (Markdown)" })).toHaveValue("# Rules\nbody"));

    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("My Name");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("My desc.");
  });

  it("file import fills only the empty fields — frontmatter first, then the code fallback", async () => {
    extractMarkdownFiles.mockResolvedValue([{ filename: "SKILL.md", content: "---\nname: file-name\n---\n# Rules\nbody" }]);
    renderModal("import");
    type("Skill Name", "My Name");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "SKILL.md")] } });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("Imported from SKILL.md"),
    );
    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("My Name");
  });

  it("switching archive entries replaces import-filled fields but keeps ones the user edited", async () => {
    extractMarkdownFiles.mockResolvedValue([
      { filename: "pkg/SKILL.md", content: "---\nname: first\ndescription: First desc.\n---\nbody" },
      { filename: "pkg/other.md", content: "---\nname: second\ndescription: Second desc.\n---\nbody" },
    ]);
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "pkg.zip")] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("first"));
    type("Directive Description", "Edited desc.");
    fireEvent.click(screen.getByRole("button", { name: "pkg/other.md" }));

    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("second");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("Edited desc.");
  });

  it("URL import prefers the fetched file's name/description over values typed earlier", () => {
    previewMutate.mockImplementation((_url, opts) =>
      opts.onSuccess({ name: "Fetched Rule", description: "Fetched desc.", body: "# Fetched Rule\nbody" }),
    );
    renderModal("scratch");
    type("Skill Name", "Typed");
    type("Directive Description", "Typed desc.");
    fireEvent.click(screen.getByRole("button", { name: messages.create.modal.url }));
    type(messages.create.url.label, "https://example.com/rule.md");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(messages.create.url.fetch) }));

    expect(screen.getByRole("textbox", { name: "Skill Name" })).toHaveValue("Fetched Rule");
    expect(screen.getByRole("textbox", { name: "Directive Description" })).toHaveValue("Fetched desc.");
  });

  it("shows extraction failures as translated copy keyed by the error code", async () => {
    extractMarkdownFiles.mockRejectedValue(new ExtractError("tooManyEntries", "english only", { max: 50 }));
    renderModal("import");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.zip")] } });
    expect(await screen.findByText("Archive has more than 50 Markdown files.")).toBeInTheDocument();
    expect(screen.queryByText("english only")).not.toBeInTheDocument();
  });
});

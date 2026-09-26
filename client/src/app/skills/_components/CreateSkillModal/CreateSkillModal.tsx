"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Button, TextInput, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import { useCreateSkill, useUpdateSkill, usePreviewSkillUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { extractMarkdownFiles, ExtractError, type ExtractedMarkdown } from "./file-extractor";
import { parseSkillMarkdown, preferredEntryIndex, stripFrontmatter } from "./skill-markdown";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  initialTab = "scratch",
}: {
  onClose: () => void;
  initialTab?: "scratch" | "import" | "url";
}) {
  const router = useRouter();
  const t = useTranslations("skills");
  const toast = useToast();
  const createMutation = useCreateSkill();
  const updateMutation = useUpdateSkill();
  const previewMutation = usePreviewSkillUrl();

  const [tab, setTabState] = React.useState<"scratch" | "import" | "url">(initialTab);
  const setTab = (next: "scratch" | "import" | "url") => {
    setTabState(next);
    setUrlFetched(false);
  };

  // Form states
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const [body, setBody] = React.useState("");
  // The untouched import (frontmatter included), frozen at import time — kept
  // separate from `body` so version 1 preserves the original upload even as
  // the user edits the (frontmatter-stripped) working body before saving.
  const [rawBody, setRawBody] = React.useState("");

  // Import state
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [importingFile, setImportingFile] = React.useState(false);
  const [extractedFiles, setExtractedFiles] = React.useState<ExtractedMarkdown[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = React.useState(0);

  // URL import state — fetch → preview → confirm (the shared name/description/
  // type/body fields below get prefilled from the preview once fetched).
  const [importUrl, setImportUrl] = React.useState("");
  const [urlFetched, setUrlFetched] = React.useState(false);

  // Provenance of the shared fields: set to "imported" the moment a file or
  // URL prefills them and kept across tab switches, so `source`/`enabled` on
  // submit reflect where the content came from — not which tab is open.
  const [origin, setOrigin] = React.useState<"manual" | "imported">("manual");

  // Which of Name/Description currently hold a value an import put there (as
  // opposed to one the user typed or had ready before importing). File import
  // resolves each field as: form value > file frontmatter > code fallback —
  // so only an empty or import-filled field gets replaced (e.g. switching
  // between files of one archive), never one the user owns.
  const importFilled = React.useRef({ name: false, description: false });
  const editName = (value: string) => {
    importFilled.current.name = false;
    setName(value);
  };
  const editDescription = (value: string) => {
    importFilled.current.description = false;
    setDescription(value);
  };

  const startBlank = () => {
    importFilled.current = { name: false, description: false };
    setName("");
    setDescription("");
    setBody("");
    setRawBody("");
    setExtractedFiles([]);
    setOrigin("manual");
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Prefill the shared fields from one extracted file's skill core
  // (frontmatter name/description + the Markdown body).
  const applyExtracted = (files: ExtractedMarkdown[], idx: number) => {
    setSelectedFileIdx(idx);
    const item = files[idx];
    if (!item) return;
    const parsed = parseSkillMarkdown(item.content, item.filename);
    // Functional updaters read the live form value (the user may type while
    // an archive is still extracting). Idempotent under StrictMode's double
    // call: once a field is import-filled, the second call just replaces it.
    const fillField = (field: "name" | "description", fromFile: string) => (prev: string) => {
      if (prev.trim() && !importFilled.current[field]) return prev;
      importFilled.current[field] = true;
      return fromFile;
    };
    setName(fillField("name", parsed.name));
    setDescription(
      fillField("description", parsed.description || t("create.file.importedDescription", { filename: item.filename })),
    );
    setBody(parsed.body);
    setRawBody(item.content);
    setOrigin("imported");
  };

  const handleFile = async (file: File) => {
    setImportingFile(true);
    try {
      const extracted = await extractMarkdownFiles(file);
      setExtractedFiles(extracted);
      applyExtracted(extracted, preferredEntryIndex(extracted));
      toast.success(t("create.file.success", { count: extracted.length }));
    } catch (err) {
      toast.error(
        err instanceof ExtractError
          ? t(`create.file.errors.${err.code}`, err.params)
          : t("create.file.extractFailed"),
      );
    } finally {
      setImportingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSelectExtracted = (idx: number) => applyExtracted(extractedFiles, idx);

  // Create-from-scratch: the body is edited directly, so a pasted/typed YAML
  // header is never stripped from what's shown — only used, live, as a
  // fallback for Name/Description while those fields are still empty. The
  // header itself is cut only at submit time (see handleSubmit).
  const handleBodyChange = (value: string) => {
    setBody(value);
    if (tab !== "scratch" || origin !== "manual") return;
    const parsed = parseSkillMarkdown(value, "");
    if (!name.trim() && parsed.name) setName(parsed.name);
    if (!description.trim() && parsed.description) setDescription(parsed.description);
  };

  const finish = (created: { id: string; name: string }) => {
    const key =
      tab === "scratch" ? "create.scratch.success" : tab === "import" ? "create.file.createSuccess" : "create.url.success";
    toast.success(t(key, { name: created.name }));
    onClose();
    router.push(`/skills/${created.id}`);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error(t("create.scratch.errors.nameRequired"));
      return;
    }
    if (!body.trim()) {
      toast.error(t("create.scratch.errors.bodyRequired"));
      return;
    }

    const trimmedBody = body.trim();
    // v1/v2 split: v1 always preserves whatever header the body arrived (or
    // was typed) with, verbatim; v2 is the clean body the skill actually
    // starts on. Two ways to get here:
    // - Imported content whose raw upload still differs from the (already
    //   frontmatter-stripped) working body the user may have edited further.
    // - Manual "create from scratch" content that still carries a pasted/typed
    //   YAML header — cut only now, never while the user was still editing.
    let v1Body = trimmedBody;
    let v2Body: string | null = null;
    let stripMessage = "Removed YAML frontmatter";
    if (origin === "imported") {
      if (rawBody.trim() !== trimmedBody) {
        v1Body = rawBody.trim();
        v2Body = trimmedBody;
        stripMessage = "Removed imported YAML frontmatter";
      }
    } else {
      const stripped = stripFrontmatter(trimmedBody);
      if (stripped !== trimmedBody) v2Body = stripped;
    }
    const needsStrip = v2Body !== null;

    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        source: origin === "imported" ? "imported_url" : "manual",
        body: v1Body,
        enabled: origin === "manual", // Imported content starts disabled until vetted
      },
      {
        onSuccess: (created) => {
          if (!needsStrip) {
            finish(created);
            return;
          }
          updateMutation.mutate(
            { id: created.id, patch: { body: v2Body!, message: stripMessage } },
            {
              onSuccess: () => finish(created),
              onError: (err) => {
                toast.error((err as Error).message || t("create.scratch.errors.createFailed"));
              },
            },
          );
        },
        onError: (err) => {
          toast.error((err as Error).message || t("create.scratch.errors.createFailed"));
        },
      },
    );
  };

  /** Fetch a URL and prefill the shared form (fetch → preview → confirm; confirm goes through `handleSubmit`). */
  const handleFetchUrl = () => {
    if (!importUrl.trim()) {
      toast.error(t("create.url.urlRequired"));
      return;
    }

    previewMutation.mutate(importUrl.trim(), {
      onSuccess: (preview) => {
        // URL import: the fetched file's frontmatter wins over the form, then
        // the server/translated fallback — unlike file import (applyExtracted).
        importFilled.current = { name: true, description: true };
        setName(preview.name);
        setDescription(preview.description || t("create.url.importedDescription", { url: importUrl.trim() }));
        setBody(stripFrontmatter(preview.body));
        setRawBody(preview.body);
        setOrigin("imported");
        setUrlFetched(true);
      },
      onError: (err) => {
        toast.error((err as Error).message || t("create.scratch.errors.importFailed"));
      },
    });
  };

  return (
    <Modal title={t("create.modal.title")} onClose={onClose} width={580}>
      <div style={s.wrap}>
        {/* Top tabs */}
        <div style={s.tabsRow}>
          <button
            type="button"
            style={s.tabBtn(tab === "scratch")}
            onClick={() => setTab("scratch")}
          >
            {t("create.modal.scratch")}
          </button>
          <button
            type="button"
            style={s.tabBtn(tab === "import")}
            onClick={() => setTab("import")}
          >
            {t("create.modal.import")}
          </button>
          <button
            type="button"
            style={s.tabBtn(tab === "url")}
            onClick={() => setTab("url")}
          >
            {t("create.modal.url")}
          </button>
        </div>

        {tab === "import" && (
          <div style={s.field}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".md,.zip,text/markdown"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              style={s.dropzone(isDragOver)}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon.Upload size={24} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {importingFile ? t("create.file.extracting") : t("create.file.dropzone")}
              </span>
              <span style={s.hint}>{t("create.file.hint")}</span>
            </div>

            {extractedFiles.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {extractedFiles.map((f, i) => (
                  <button
                    key={f.filename}
                    type="button"
                    onClick={() => handleSelectExtracted(i)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      border: i === selectedFileIdx ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: i === selectedFileIdx ? "var(--accent-bg)" : "var(--bg-surface)",
                      color: i === selectedFileIdx ? "var(--accent)" : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {f.filename}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "url" && !urlFetched && (
          <div style={s.field}>
            <label style={s.label}>{t("create.url.label")}</label>
            <TextInput
              value={importUrl}
              onChange={setImportUrl}
              placeholder={t("create.url.placeholder")}
              aria-label={t("create.url.label")}
            />
            <span style={s.hint}>{t("create.url.hint")}</span>
          </div>
        )}

        {(tab === "scratch" || tab === "import" || (tab === "url" && urlFetched)) && (
          <>
            {origin === "imported" && tab === "scratch" && (
              <div style={s.importedNotice} role="status">
                <span>{t("create.scratch.importedNotice")}</span>
                <button type="button" style={s.linkBtn} onClick={startBlank}>
                  {t("create.scratch.startBlank")}
                </button>
              </div>
            )}
            {/* Name */}
            <div style={s.field}>
              <label style={s.label}>{t("create.scratch.name")}</label>
              <TextInput
                value={name}
                onChange={editName}
                placeholder={t("create.scratch.namePlaceholder")}
                aria-label={t("create.scratch.name")}
              />
            </div>

            {/* Directive Description */}
            <div style={s.field}>
              <label style={s.label}>{t("create.scratch.description")}</label>
              <TextInput
                value={description}
                onChange={editDescription}
                placeholder={t("create.scratch.descriptionPlaceholder")}
                aria-label={t("create.scratch.description")}
              />
            </div>

            {/* Type select */}
            <div style={s.field}>
              <label style={s.label}>{t("create.scratch.type")}</label>
              <select
                style={s.select}
                value={type}
                onChange={(e) => setType(e.target.value as SkillType)}
                aria-label={t("create.scratch.type")}
              >
                {SKILL_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`typeOptions.${v}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Body */}
            <div style={s.field}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={s.label}>{t("create.scratch.body")}</label>
                <span style={s.hint}>{t("create.scratch.tokens", { count: estimateTokens(body) })}</span>
              </div>
              <textarea
                style={s.textarea}
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder={t("create.scratch.bodyPlaceholder")}
                aria-label={t("create.scratch.body")}
              />
            </div>
          </>
        )}

        {/* Footer */}
        <div style={s.footer}>
          <Button kind="secondary" size="md" onClick={onClose}>
            {t("create.scratch.cancel")}
          </Button>
          {tab === "url" && !urlFetched ? (
            <Button
              kind="primary"
              size="md"
              icon="Link"
              onClick={handleFetchUrl}
              disabled={previewMutation.isPending || !importUrl.trim()}
            >
              {previewMutation.isPending ? t("create.url.fetching") : t("create.url.fetch")}
            </Button>
          ) : (
            <Button
              kind="primary"
              size="md"
              icon="Sparkles"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !name.trim() || !body.trim()}
            >
              {createMutation.isPending || updateMutation.isPending
                ? t("create.scratch.creating")
                : tab === "scratch"
                  ? t("create.scratch.create")
                  : t("create.scratch.import")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

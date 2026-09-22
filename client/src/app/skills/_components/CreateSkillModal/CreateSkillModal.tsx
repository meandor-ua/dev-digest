"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Button, TextInput, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import { useCreateSkill, usePreviewSkillUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { extractMarkdownFiles, type ExtractedMarkdown } from "./file-extractor";
import { parseSkillMarkdown, preferredEntryIndex } from "./skill-markdown";
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

  // Import state
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [importingFile, setImportingFile] = React.useState(false);
  const [extractedFiles, setExtractedFiles] = React.useState<ExtractedMarkdown[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = React.useState(0);

  // URL import state — fetch → preview → confirm (the shared name/description/
  // type/body fields below get prefilled from the preview once fetched).
  const [importUrl, setImportUrl] = React.useState("");
  const [urlFetched, setUrlFetched] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Prefill the shared fields from one extracted file's skill core
  // (frontmatter name/description + the Markdown body).
  const applyExtracted = (files: ExtractedMarkdown[], idx: number) => {
    setSelectedFileIdx(idx);
    const item = files[idx];
    if (!item) return;
    const parsed = parseSkillMarkdown(item.content, item.filename);
    setName(parsed.name);
    setDescription(parsed.description);
    setBody(parsed.body);
  };

  const handleFile = async (file: File) => {
    setImportingFile(true);
    try {
      const extracted = await extractMarkdownFiles(file);
      setExtractedFiles(extracted);
      applyExtracted(extracted, preferredEntryIndex(extracted));
      toast.success(t("create.file.success", { count: extracted.length }));
    } catch (err) {
      toast.error((err as Error).message || t("create.file.extractFailed"));
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

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error(t("create.scratch.errors.nameRequired"));
      return;
    }
    if (!body.trim()) {
      toast.error(t("create.scratch.errors.bodyRequired"));
      return;
    }

    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        source: tab === "import" || tab === "url" ? "imported_url" : "manual",
        body: body.trim(),
        enabled: tab === "scratch", // Only manual skills start enabled
      },
      {
        onSuccess: (created) => {
          const key =
            tab === "scratch" ? "create.scratch.success" : tab === "import" ? "create.file.createSuccess" : "create.url.success";
          toast.success(t(key, { name: created.name }));
          onClose();
          router.push(`/skills/${created.id}`);
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
        setName(preview.name);
        setDescription(t("create.url.importedDescription", { url: importUrl.trim() }));
        setBody(preview.body);
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
            {/* Name */}
            <div style={s.field}>
              <label style={s.label}>{t("create.scratch.name")}</label>
              <TextInput
                value={name}
                onChange={setName}
                placeholder={t("create.scratch.namePlaceholder")}
                aria-label={t("create.scratch.name")}
              />
            </div>

            {/* Directive Description */}
            <div style={s.field}>
              <label style={s.label}>{t("create.scratch.description")}</label>
              <TextInput
                value={description}
                onChange={setDescription}
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
                onChange={(e) => setBody(e.target.value)}
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
              disabled={createMutation.isPending || !name.trim() || !body.trim()}
            >
              {createMutation.isPending
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

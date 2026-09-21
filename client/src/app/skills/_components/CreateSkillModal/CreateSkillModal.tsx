"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Button, TextInput, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { extractMarkdownFiles, type ExtractedMarkdown } from "./file-extractor";
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
  const importMutation = useImportSkill();

  const [tab, setTab] = React.useState<"scratch" | "import" | "url">(initialTab);

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

  // URL import state
  const [importUrl, setImportUrl] = React.useState("");
  const [importUrlName, setImportUrlName] = React.useState("");
  const [importUrlType, setImportUrlType] = React.useState<SkillType>("rubric");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setImportingFile(true);
    try {
      const extracted = await extractMarkdownFiles(file);
      setExtractedFiles(extracted);
      setSelectedFileIdx(0);

      const first = extracted[0];
      if (first) {
        setBody(first.content);

        // Derive name from first markdown heading or clean filename
        const headingMatch = first.content.match(/^#+\s+(.+)$/m);
        if (headingMatch && headingMatch[1]) {
          setName(headingMatch[1].trim());
        } else {
          setName(first.filename.replace(/\.md$/i, ""));
        }
        setDescription(`Imported from ${first.filename}`);
      }
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

  const handleSelectExtracted = (idx: number) => {
    setSelectedFileIdx(idx);
    const item = extractedFiles[idx];
    if (item) {
      setBody(item.content);
      const headingMatch = item.content.match(/^#+\s+(.+)$/m);
      if (headingMatch && headingMatch[1]) {
        setName(headingMatch[1].trim());
      } else {
        setName(item.filename.replace(/\.md$/i, ""));
      }
      setDescription(`Imported from ${item.filename}`);
    }
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

    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        source: tab === "import" ? "imported_url" : "manual",
        body: body.trim(),
        enabled: tab === "scratch", // Only manual skills start enabled
      },
      {
        onSuccess: (created) => {
          toast.success(
            tab === "import"
              ? t("file.success", { name: created.name })
              : t("create.scratch.success", { name: created.name }),
          );
          onClose();
          router.push(`/skills/${created.id}`);
        },
        onError: (err) => {
          toast.error((err as Error).message || t("create.scratch.errors.createFailed"));
        },
      },
    );
  };

  const handleImportUrl = () => {
    if (!importUrl.trim()) {
      toast.error(t("create.url.urlRequired"));
      return;
    }

    importMutation.mutate(
      {
        url: importUrl.trim(),
        name: importUrlName.trim() || undefined,
        type: importUrlType,
      },
      {
        onSuccess: (created) => {
          toast.success(t("create.url.success", { name: created.name }));
          onClose();
          router.push(`/skills/${created.id}`);
        },
        onError: (err) => {
          toast.error((err as Error).message || t("create.scratch.errors.importFailed"));
        },
      },
    );
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

        {tab === "url" && (
          <div style={s.field}>
            <label style={s.label}>{t("create.url.label")}</label>
            <TextInput
              value={importUrl}
              onChange={setImportUrl}
              placeholder={t("create.url.placeholder")}
              aria-label={t("create.url.label")}
            />
            <span style={s.hint}>{t("url.hint")}</span>

            <label style={{ ...s.label, marginTop: 16 }}>
              {t("create.url.nameOptional")}
            </label>
            <TextInput
              value={importUrlName}
              onChange={setImportUrlName}
              placeholder={t("create.scratch.namePlaceholder")}
              aria-label={t("create.url.nameOptional")}
            />

            <label style={{ ...s.label, marginTop: 16 }}>
              {t("create.scratch.type")}
            </label>
            <select
              style={s.select}
              value={importUrlType}
              aria-label={t("create.scratch.type")}
              onChange={(e) => setImportUrlType(e.target.value as SkillType)}
            >
              <option value="rubric">{t("typeOptions.rubric")}</option>
              <option value="convention">{t("typeOptions.convention")}</option>
              <option value="security">{t("typeOptions.security")}</option>
              <option value="custom">{t("typeOptions.custom")}</option>
            </select>
          </div>
        )}

        {(tab === "scratch" || tab === "import") && (
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
                <option value="rubric">{t("typeOptions.rubric")}</option>
                <option value="convention">{t("typeOptions.convention")}</option>
                <option value="security">{t("typeOptions.security")}</option>
                <option value="custom">{t("typeOptions.custom")}</option>
              </select>
            </div>

            {/* Body */}
            <div style={s.field}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={s.label}>{t("create.scratch.body")}</label>
                <span style={s.hint}>{t("create.scratch.tokens", { count: Math.ceil(body.length / 4) })}</span>
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
          {tab === "url" ? (
            <Button
              kind="primary"
              size="md"
              icon="Sparkles"
              onClick={handleImportUrl}
              disabled={importMutation.isPending || !importUrl.trim()}
            >
              {importMutation.isPending ? t("create.url.fetching") : t("create.url.import")}
            </Button>
          ) : (
            <Button
              kind="primary"
              size="md"
              icon="Sparkles"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !name.trim() || !body.trim()}
            >
              {createMutation.isPending ? t("create.scratch.creating") : tab === "import" ? t("create.scratch.import") : t("create.scratch.create")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

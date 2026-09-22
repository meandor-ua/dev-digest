"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button, Icon, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { s } from "./styles";
import { toDraft, sameDraft, rebaseDraft, draftPatch, type SkillDraft } from "./draft";

/** Filename shown in the editor header — lowercase, dash-joined, `.md`-suffixed. */
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "skill"}.md`;
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const updateMutation = useUpdateSkill();
  const deleteMutation = useDeleteSkill();
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const isUntrusted = skill.source !== "manual";
  const [changeNote, setChangeNote] = React.useState("");

  const server = toDraft(skill);
  const [draft, setDraft] = React.useState<SkillDraft>(server);
  // The server copy the draft was last reconciled with (see rebaseDraft).
  const [base, setBase] = React.useState<{ id: string; draft: SkillDraft }>({ id: skill.id, draft: server });
  if (base.id !== skill.id) {
    setBase({ id: skill.id, draft: server });
    setDraft(server);
  } else if (!sameDraft(base.draft, server)) {
    setBase({ id: skill.id, draft: server });
    setDraft((d) => rebaseDraft(d, base.draft, server));
  }

  const { name, description, type, body, enabled } = draft;
  const set = <K extends keyof SkillDraft>(key: K) => (value: SkillDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setName = set("name");
  const setDescription = set("description");
  const setBody = set("body");
  const setEnabled = set("enabled");
  const setType = set("type");

  const dirty = !sameDraft(draft, server);
  // The server records a change note only on a body change (a new version).
  const bodyChanged = draft.body !== server.body;
  const cancel = () => setDraft(server);

  const handleSave = () => {
    const note = changeNote.trim();
    updateMutation.mutate(
      {
        id: skill.id,
        patch: { ...draftPatch(draft, server), ...(bodyChanged && note ? { message: note } : {}) },
      },
      {
        onSuccess: (updated) => {
          toast.success(t("config.saved", { version: updated.version }));
          setChangeNote("");
        },
        onError: (err) => {
          toast.error((err as Error).message || t("config.saveFailed"));
        },
      },
    );
  };

  const handleDelete = () => {
    if (!confirm(t("detail.confirmDelete", { name: skill.name }))) return;
    deleteMutation.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("detail.deleteSuccess", { name: skill.name }));
        router.push("/skills");
      },
      onError: (err) => {
        toast.error((err as Error).message || t("detail.deleteError"));
      },
    });
  };

  const lineCount = Math.max(body.split("\n").length, 14);
  const estimatedTokens = estimateTokens(body);
  const fileName = slugify(server.name);

  return (
    <div style={s.wrap}>
      {isUntrusted && (
        <div role="note" style={s.untrustedNotice}>
          {t("preview.untrustedNotice")}
        </div>
      )}
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("config.configTitle")}</h2>
          <Badge color="var(--text-secondary)" mono>
            v{skill.version}
          </Badge>
        </div>
        <label style={s.enabledLabel}>
          {t("config.enabledLabel")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.nameLabel")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>

      <FormField
        label={t("config.descriptionLabel")}
        hint={t("config.descriptionHint")}
      >
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      <FormField label={t("config.typeLabel")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={typeOptions}
        />
      </FormField>

      <FormField label={t("config.bodyLabel")} required>
        <div style={s.editorContainer}>
          <div style={s.editorHeader}>
            <div style={s.editorTab}>
              <Icon.FileText size={13} style={{ color: "var(--accent)" }} />
              <span>{fileName}</span>
              {dirty && (
                <Badge color="var(--warn)" mono style={{ fontSize: 10 }}>
                  {t("config.unsaved")}
                </Badge>
              )}
            </div>
            <span style={s.tokenBadge}>{t("config.tokens", { count: estimatedTokens })}</span>
          </div>
          <div style={s.editorBody}>
            <div style={s.gutter}>
              {Array.from({ length: lineCount }, (_, i) => (
                <span key={i + 1} style={s.gutterLine}>
                  {i + 1}
                </span>
              ))}
            </div>
            <textarea
              style={s.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={lineCount}
              spellCheck={false}
              aria-label={t("config.bodyLabel")}
            />
          </div>
        </div>
      </FormField>

      {bodyChanged && (
        <FormField label={t("config.changeNoteLabel")} hint={t("config.changeNoteHint")}>
          <TextInput
            value={changeNote}
            onChange={setChangeNote}
            placeholder={t("config.changeNotePlaceholder")}
          />
        </FormField>
      )}

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={handleSave}
          disabled={updateMutation.isPending || !dirty || !name.trim() || !body.trim()}
        >
          {updateMutation.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {dirty && (
          <Button kind="ghost" onClick={cancel} disabled={updateMutation.isPending}>
            {t("config.cancel")}
          </Button>
        )}
        {updateMutation.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.savedNote", { version: skill.version })}</span>
        )}
      </div>

      <div style={s.dangerZone}>
        <div>
          <div style={s.dangerTitle}>{t("config.dangerZoneTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerZoneBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={handleDelete} disabled={deleteMutation.isPending}>
          {t("detail.delete")}
        </Button>
      </div>
    </div>
  );
}

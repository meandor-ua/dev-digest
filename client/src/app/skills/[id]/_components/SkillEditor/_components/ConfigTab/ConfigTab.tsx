"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button, Icon } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { s } from "./styles";
import { toDraft, sameDraft, rebaseDraft, draftPatch, type SkillDraft } from "./draft";

function useTypeOptions() {
  const t = useTranslations("skills");
  return [
    { value: "rubric", label: t("typeOptions.rubric") },
    { value: "convention", label: t("typeOptions.convention") },
    { value: "security", label: t("typeOptions.security") },
    { value: "custom", label: t("typeOptions.custom") },
  ];
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const updateMutation = useUpdateSkill();
  const typeOptions = useTypeOptions();
  const isUntrusted = skill.source !== "manual";

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
  const cancel = () => setDraft(server);

  const handleSave = () => {
    updateMutation.mutate(
      {
        id: skill.id,
        patch: draftPatch(draft, server),
      },
      {
        onSuccess: (updated) => {
          toast.success(t("config.saved", { version: updated.version }));
        },
        onError: (err) => {
          toast.error((err as Error).message || t("config.saveFailed"));
        },
      },
    );
  };

  const lineCount = Math.max(body.split("\n").length, 14);
  const estimatedTokens = Math.ceil(body.length / 4);

  return (
    <div style={s.wrap}>
      {isUntrusted && (
        <div role="note" style={s.untrustedNotice}>
          {t("preview.untrustedNotice")}
        </div>
      )}
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.configTitle")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabledLabel")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <div style={s.row}>
        <FormField label={t("config.nameLabel")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("config.typeLabel")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={typeOptions}
          />
        </FormField>
      </div>

      <FormField
        label={t("config.descriptionLabel")}
        hint={t("config.descriptionHint")}
      >
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      <FormField
        label={t("config.bodyLabel")}
        hint={t("config.bodyHint")}
      >
        <div style={s.editorContainer}>
          <div style={s.editorHeader}>
            <div style={s.editorTab}>
              <Icon.FileText size={13} style={{ color: "var(--accent)" }} />
              <span>skill.md</span>
            </div>
            <span style={s.tokenBadge}>{t("preview.tokens", { count: estimatedTokens })}</span>
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
    </div>
  );
}

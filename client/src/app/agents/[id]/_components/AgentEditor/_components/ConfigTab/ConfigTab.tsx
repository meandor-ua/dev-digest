"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { toModelOptions } from "@/lib/model-label";
import { useDraft, draftPatch } from "@/lib/draft";
import { CI_FAIL_ON_VALUES, OUTPUT_SCHEMA_VALUE, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";
import { s } from "./styles";

type AgentDraft = Pick<
  Agent,
  "name" | "description" | "provider" | "model" | "system_prompt" | "strategy" | "ci_fail_on" | "repo_intel" | "enabled"
>;
const FIELDS = [
  "name",
  "description",
  "provider",
  "model",
  "system_prompt",
  "strategy",
  "ci_fail_on",
  "repo_intel",
  "enabled",
] as const;

const toDraft = (a: Agent): AgentDraft => ({
  name: a.name,
  description: a.description,
  provider: a.provider,
  model: a.model,
  system_prompt: a.system_prompt,
  strategy: a.strategy,
  ci_fail_on: a.ci_fail_on,
  repo_intel: a.repo_intel,
  enabled: a.enabled,
});

/**
 * Config tab — name/description/provider/model/system-prompt + enabled toggle.
 * The tab stays mounted across tab switches, so the form is a draft that
 * rebases onto server changes made elsewhere (e.g. the rail's enable toggle)
 * and a save sends only the fields the user actually changed.
 */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const { draft, setDraft, server, dirty, reset } = useDraft(agent.id, toDraft(agent), FIELDS);
  const set =
    <K extends keyof AgentDraft>(k: K) =>
    (v: AgentDraft[K]) =>
      setDraft((d) => ({ ...d, [k]: v }));
  const { name, description, provider, model, system_prompt: systemPrompt, strategy, ci_fail_on: ciFailOn, repo_intel: repoIntel, enabled } = draft;

  const { data: models } = useProviderModels(provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (!hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: agent.id, patch: draftPatch(FIELDS, draft, server) },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={set("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={set("name")} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={set("description")} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={provider}
          onChange={(v) => set("provider")(v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={model}
          onChange={set("model")}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={strategy}
          onChange={(v) => set("strategy")(v as ReviewStrategy)}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={ciFailOn}
          onChange={(v) => set("ci_fail_on")(v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={repoIntel} onChange={set("repo_intel")} size={16} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={systemPrompt} onChange={set("system_prompt")} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !dirty}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {dirty && (
          <Button kind="ghost" onClick={reset} disabled={update.isPending}>
            {t("config.cancel")}
          </Button>
        )}
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}

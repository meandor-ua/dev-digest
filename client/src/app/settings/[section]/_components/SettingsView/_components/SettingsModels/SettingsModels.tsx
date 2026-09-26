"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SearchableSelect, Icon } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { useProviderModels } from "../../../../../../../lib/hooks/agents";
import { toModelOptions } from "../../../../../../../lib/model-label";
import { FEATURE_MODELS } from "../../../../../../../lib/feature-models";
import type { FeatureModelChoice, FeatureModelId } from "../../../../../../../lib/types";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

/**
 * Settings → Feature Models. One picker per system LLM feature; the model list +
 * prices come LIVE from OpenRouter (useProviderModels), and the choice persists
 * to `settings.feature_models`. Each feature falls back to its registry default
 * when unset.
 */
export function SettingsModels() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const { data: models } = useProviderModels("openrouter");

  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId, FeatureModelChoice>>;
  const baseOptions = toModelOptions(models);
  const noModels = models !== undefined && models.length === 0;

  // "" is the Auto option (features without a registry default): clearing the
  // choice hands model selection back to the server's runtime default.
  const setModel = (id: FeatureModelId, model: string) => {
    const { [id]: _previous, ...rest } = chosen;
    update.mutate({
      feature_models: model ? { ...rest, [id]: { provider: "openrouter", model } } : rest,
    });
  };

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("models.title")} body={t("models.body")} />

      {FEATURE_MODELS.map((f) => {
        const current = chosen[f.id]?.model ?? f.defaultModel ?? "";
        const isUnset = !chosen[f.id];
        // Ensure the current value is selectable even if it isn't in the live
        // OpenRouter list (e.g. an OpenAI registry default, or an empty list).
        const listed =
          !current || baseOptions.some((o) => (typeof o === "string" ? o : o.value) === current)
            ? baseOptions
            : [current, ...baseOptions];
        const options = f.defaultModel ? listed : [{ value: "", label: t("models.auto") }, ...listed];
        return (
          <div key={f.id} style={s.row}>
            <FormField
              label={
                <>
                  {f.label}
                  {isUnset && (
                    <span style={s.defaultTag}>
                      {f.defaultModel ? t("models.usingDefault") : t("models.usingAuto")}
                    </span>
                  )}
                </>
              }
              hint={f.description}
            >
              <SearchableSelect
                value={current}
                onChange={(m) => setModel(f.id, m)}
                options={options}
                placeholder={t("models.search")}
              />
            </FormField>
          </div>
        );
      })}

      <div style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <span>{noModels ? t("models.noKeyNote") : t("models.liveNote")}</span>
      </div>
    </div>
  );
}

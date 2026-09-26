"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, TextInput, Skeleton } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useAgents, useLinkAgentSkill } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const draftMutation = useCreateConventionSkill(repoId);
  const createMutation = useCreateSkill();
  const { data: agents } = useAgents();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [body, setBody] = React.useState("");
  const [sourceCount, setSourceCount] = React.useState(0);
  const [agentId, setAgentId] = React.useState("");

  const linkMutation = useLinkAgentSkill(agentId);

  // Tracked locally rather than via `draftMutation.isPending`: React's Strict
  // Mode dev double-invoke of this effect (mount → cleanup → mount) drops the
  // mutation observer's subscription before the request resolves, so its
  // result — and the onSuccess/onError passed to `mutate()` — never arrive.
  // `mutateAsync()`'s returned promise isn't gated on that subscription.
  const [loadingDraft, setLoadingDraft] = React.useState(true);

  const fetchedRef = React.useRef(false);
  React.useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    draftMutation
      .mutateAsync()
      .then((draft) => {
        setName(draft.name);
        setDescription(draft.description);
        setBody(draft.body);
        setSourceCount(draft.source_convention_ids.length);
      })
      // The error itself is already toasted by the global MutationCache.onError
      // (lib/providers.tsx) — toasting here too would show it twice.
      .catch(() => onClose())
      .finally(() => setLoadingDraft(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!agentId && agents && agents.length > 0) setAgentId(agents[0]!.id);
  }, [agents, agentId]);

  const handleCreate = () => {
    if (!name.trim() || !body.trim()) {
      toast.error(t("modal.errors.required"));
      return;
    }
    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        source: "extracted",
        body: body.trim(),
        enabled: false, // extracted skills always start disabled until vetted (SkillsService.create)
      },
      {
        onSuccess: (created) => {
          const finish = () => {
            toast.success(t("modal.success", { name: created.name }));
            onClose();
          };
          if (agentId) {
            // A link failure is toasted globally; the skill itself exists, so still finish.
            linkMutation.mutate(created.id, { onSettled: finish });
          } else {
            finish();
          }
        },
      },
    );
  };

  const loading = loadingDraft;
  const saving = createMutation.isPending || linkMutation.isPending;

  return (
    <Modal title={t("modal.title")} onClose={onClose} width={580}>
      <div style={s.wrap}>
        {loading ? (
          <>
            <Skeleton height={40} />
            <Skeleton height={220} />
          </>
        ) : (
          <>
            <div style={s.banner} role="status">
              {t("modal.banner", { count: sourceCount, repo: repoName })}
            </div>

            <div style={s.field}>
              <label style={s.label}>{t("modal.name")}</label>
              <TextInput value={name} onChange={setName} aria-label={t("modal.name")} />
            </div>

            <div style={s.field}>
              <label style={s.label}>{t("modal.description")}</label>
              <TextInput value={description} onChange={setDescription} aria-label={t("modal.description")} />
            </div>

            <div style={s.field}>
              <label style={s.label}>{t("modal.type")}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SkillType)}
                aria-label={t("modal.type")}
                style={s.select}
              >
                {SKILL_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`modal.typeOptions.${v}`)}
                  </option>
                ))}
              </select>
            </div>

            <div style={s.vettingNotice} role="status">
              {t("modal.vettingNotice")}
            </div>

            {agents && agents.length > 0 && (
              <div style={s.field}>
                <label style={s.label}>{t("modal.agent")}</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  aria-label={t("modal.agent")}
                  style={s.select}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={s.field}>
              <div style={s.row}>
                <label style={s.label}>{t("modal.body")}</label>
                <span style={s.hint}>{t("modal.tokens", { count: estimateTokens(body) })}</span>
              </div>
              <textarea
                style={s.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label={t("modal.body")}
              />
            </div>
          </>
        )}

        <div style={s.footer}>
          <Button kind="secondary" size="md" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            size="md"
            icon="Sparkles"
            onClick={handleCreate}
            disabled={loading || saving || !name.trim() || !body.trim()}
          >
            {saving ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_COLOR, CONFIDENCE_HIGH_PCT, CONFIDENCE_MEDIUM_PCT } from "../../constants";
import { formatEvidenceLocation } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  evidenceUrl,
  onAccept,
  onReject,
  onSave,
  onDelete,
  saving = false,
}: {
  candidate: ConventionCandidate;
  evidenceUrl: string | null;
  onAccept: () => void;
  onReject: () => void;
  onSave: (patch: { rule: string; rationale: string | null }) => void;
  onDelete: () => void;
  saving?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");

  const startEdit = () => {
    setRule(candidate.rule);
    setRationale(candidate.rationale ?? "");
    setEditing(true);
  };

  // The API rejects an empty rule, so stay in edit mode instead of sending one.
  const save = () => {
    if (!rule.trim()) return;
    onSave({ rule: rule.trim(), rationale: rationale.trim() || null });
    setEditing(false);
  };

  const location = formatEvidenceLocation(candidate);
  const pct = Math.round(candidate.confidence * 100);
  const color =
    pct >= CONFIDENCE_HIGH_PCT
      ? CONFIDENCE_COLOR.high
      : pct >= CONFIDENCE_MEDIUM_PCT
        ? CONFIDENCE_COLOR.medium
        : CONFIDENCE_COLOR.low;

  const copySnippet = () => {
    navigator.clipboard?.writeText(candidate.evidence_snippet).catch(() => {});
  };

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const hasRationaleRow = editing || !!candidate.rationale;
  // Decision column starts at the evidence row and spans to the last content row.
  const lastRowLine = hasRationaleRow ? 5 : 4;

  return (
    <div style={s.card(candidate.status)} data-testid={`convention-card-${candidate.id}`}>
      {editing ? (
        <TextInput
          value={rule}
          onChange={setRule}
          aria-label={t("card.ruleLabel")}
          style={s.ruleInput}
        />
      ) : (
        <span style={s.rule}>{candidate.rule}</span>
      )}
      <div style={s.actions}>
        <IconBtn
          icon="Edit"
          label={t("card.edit")}
          active={editing}
          onClick={editing ? save : startEdit}
        />
        <IconBtn icon="Trash" label={t("card.delete")} onClick={onDelete} danger />
      </div>

      <div style={s.decision(lastRowLine)}>
        <Button
          kind={accepted ? "primary" : "ghost"}
          icon="Check"
          full
          aria-pressed={accepted}
          onClick={onAccept}
          style={s.decisionBtn}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "secondary" : "ghost"}
          icon="X"
          full
          aria-pressed={rejected}
          onClick={onReject}
          style={s.decisionBtn}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>

      <div style={s.mainCol}>
        <div style={s.evidenceHeader}>
          {evidenceUrl ? (
            <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" style={s.evidencePath}>
              {location}
            </a>
          ) : (
            <span style={s.evidencePath}>{location}</span>
          )}
          <IconBtn icon="Copy" label={t("card.copySnippet")} size={20} onClick={copySnippet} />
        </div>
        <pre style={s.snippet}>
          <code>{candidate.evidence_snippet}</code>
        </pre>
      </div>

      {editing ? (
        <div style={s.editBlock}>
          <textarea
            style={s.rationaleInput}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder={t("card.rationalePlaceholder")}
            aria-label={t("card.rationaleLabel")}
            rows={2}
          />
          <div style={s.editRow}>
            <IconBtn icon="X" label={t("card.cancelEdit")} onClick={() => setEditing(false)} />
            <IconBtn icon="Check" label={t("card.saveEdit")} onClick={save} active />
          </div>
        </div>
      ) : (
        candidate.rationale && <div style={s.rationale}>{candidate.rationale}</div>
      )}

      <div style={s.bottomRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBarWrap}>
          <ProgressBar value={pct} color={color} />
        </div>
        <span style={s.confidencePct}>{pct}%</span>
        {saving && <span style={s.confidenceLabel}>{t("card.saving")}</span>}
      </div>
    </div>
  );
}

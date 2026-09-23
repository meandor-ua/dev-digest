/* ConfirmDialog — shared delete/destructive-action confirmation, styled like
   the rest of the app's popups (e.g. the agent trace/log Modal) instead of a
   native window.confirm(). `Cancel`, the header's close (X) button, and the
   backdrop all just dismiss without confirming; only `Ok` fires onConfirm.
   The dialog closes itself on every button press — callers don't need to. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button } from "@devdigest/ui";
import { s } from "./styles";

const WIDTH = 420;

export function ConfirmDialog({
  message,
  title,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  /** Same prompt text window.confirm() used to show — kept unchanged. */
  message: React.ReactNode;
  title?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");

  return (
    <Modal
      width={WIDTH}
      title={title ?? t("confirm.title")}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel ?? t("actions.ok")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{message}</div>
    </Modal>
  );
}

export default ConfirmDialog;

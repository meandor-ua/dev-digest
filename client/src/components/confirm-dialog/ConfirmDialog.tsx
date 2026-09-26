/* ConfirmDialog — shared delete/destructive-action confirmation, styled like
   the rest of the app's popups (e.g. the agent trace/log Modal) instead of a
   native window.confirm(). `Cancel`, the header's close (X) button, the
   backdrop and Escape all just dismiss without confirming; only the confirm
   button fires onConfirm. It's fully controlled: the caller unmounts it (in
   both callbacks). Keyboard parity with window.confirm: focus starts on
   Cancel (the safe choice), Tab stays inside the dialog, and focus returns to
   the trigger on close. */
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
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef(onCancel);
  cancelRef.current = pending ? () => {} : onCancel;

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    // Footer order is [Cancel, Confirm]; the header X comes first in the DOM.
    focusables().find((b) => b.dataset.confirmAction === "cancel")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  return (
    <Modal
      width={WIDTH}
      title={title ?? t("confirm.title")}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} disabled={pending} data-confirm-action="cancel">
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel ?? t("actions.delete")}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} style={s.body}>
        {message}
      </div>
    </Modal>
  );
}

export default ConfirmDialog;

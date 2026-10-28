import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";

export function PredictPackageNameDialog({
  open,
  title,
  initialName,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  initialName: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={onCancel}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-sm mat-panel p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-dialog-head">
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            <ModalCloseButton onClick={onCancel} />
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-foreground-muted">
              {t("predict.analysisPackage.nameLabel")}
            </span>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
              }}
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => onConfirm(name.trim())}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
            >
              {confirmLabel ?? t("predict.analysisPackage.save")}
            </button>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../api/models";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import type { PredictSettings } from "../workspace/predictSettings";
import type { PredictQueue } from "../workspace/predictQueue";
import { PredictProfileModelParamsFields } from "./PredictProfileModelParamsFields";

type Props = {
  open: boolean;
  queue: PredictQueue | null;
  models: OrcaiModel[];
  settings: PredictSettings;
  fieldsDisabled: boolean;
  readOnly?: boolean;
  onCancel: () => void;
  onSave: (settings: PredictSettings) => void;
};

export function PredictProfileModelParamsDialog({
  open,
  queue,
  models,
  settings,
  fieldsDisabled,
  readOnly,
  onCancel,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  const patch = (p: Partial<PredictSettings>) => {
    if (fieldsDisabled) return;
    setDraft((prev) => ({ ...prev, ...p }));
  };

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
          className="flex max-h-[min(48rem,calc(100vh-3rem))] w-full max-w-2xl flex-col mat-panel shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="modal-dialog-head shrink-0 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {t("predict.modelSettings")}
          </h2>
          <ModalCloseButton onClick={onCancel} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {readOnly ? (
            <p className="mb-4 text-sm text-foreground-muted">
              {t("predict.profile.modelParamsViewOnly")}
            </p>
          ) : null}
          <PredictProfileModelParamsFields
            queue={queue}
            models={models}
            settings={draft}
            fieldsDisabled={fieldsDisabled}
            onPatch={patch}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
          {readOnly ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              {t("predict.help.close")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={fieldsDisabled}
                onClick={() => onSave(draft)}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
              >
                {t("common.save")}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

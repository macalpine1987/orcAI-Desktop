import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import { PREDICT_CLI_KEYS } from "../lib/predictCliLine";
import { pickLabelOutputFile } from "../platform/dialog";
import { isTauri } from "../platform/tauri";
import type { PredictSettings } from "../workspace/predictSettings";

type Props = {
  open: boolean;
  settings: PredictSettings;
  disabled?: boolean;
  suggestedPath?: string;
  onCancel: () => void;
  onApply: (patch: Pick<PredictSettings, "outputPath" | "verbosity">) => void;
};

/** Output path (-o) + log verbosity (-v) — keeps Model & Input column compact. */
export function PredictAdvancedParamsDialog({
  open,
  settings,
  disabled,
  suggestedPath,
  onCancel,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [outputPath, setOutputPath] = useState(settings.outputPath);
  const [verbosity, setVerbosity] = useState(settings.verbosity);
  const [pickerHint, setPickerHint] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOutputPath(settings.outputPath.trim() || "default");
      setVerbosity(settings.verbosity);
      setPickerHint(null);
    }
  }, [open, settings.outputPath, settings.verbosity]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const apply = () =>
    onApply({
      outputPath: outputPath.trim() || "default",
      verbosity,
    });

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
          className="w-full max-w-lg mat-panel p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-dialog-head">
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {t("predict.run.advancedDialogTitle")}
            </h2>
            <ModalCloseButton disabled={disabled} onClick={onCancel} />
          </div>

          <label className="mt-3 block text-sm">
            <span className="mb-1 flex items-center gap-2 text-foreground-muted">
              {t("predict.outputPath")}
              <span className="font-mono text-[10px]">
                {PREDICT_CLI_KEYS.outputPath}
              </span>
            </span>
            <p className="mb-2 text-[11px] leading-snug text-foreground-muted">
              {t("predict.outputPathFieldHint")}
            </p>
            <input
              type="text"
              className="w-full rounded border border-border bg-muted px-3 py-2 font-mono text-xs"
              value={outputPath}
              disabled={disabled}
              autoFocus
              placeholder="default"
              onChange={(e) => setOutputPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ps-btn ps-btn-sm"
              disabled={disabled}
              onClick={() => {
                void pickLabelOutputFile(
                  t("predict.outputPathPickTitle"),
                  suggestedPath,
                ).then((p) => {
                  if (p) {
                    setOutputPath(p);
                    setPickerHint(null);
                  } else if (!isTauri()) {
                    setPickerHint(t("predict.browserPathHint"));
                  }
                });
              }}
            >
              {t("predict.outputPathBrowse")}
            </button>
            <button
              type="button"
              className="ps-btn ps-btn-sm"
              disabled={disabled || outputPath.trim() === "default"}
              onClick={() => setOutputPath("default")}
            >
              {t("predict.outputPathUseDefault")}
            </button>
          </div>
          {pickerHint ? (
            <p className="mt-2 text-[11px] text-foreground-muted">{pickerHint}</p>
          ) : null}

          <label className="mt-4 block text-sm">
            <span className="mb-1 flex items-center gap-2 text-foreground-muted">
              {t("predict.verbosity")}
              <span className="font-mono text-[10px]">
                {PREDICT_CLI_KEYS.verbosity}
              </span>
            </span>
            <select
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm"
              value={verbosity}
              disabled={disabled}
              onChange={(e) =>
                setVerbosity(
                  Number(e.target.value) as PredictSettings["verbosity"],
                )
              }
            >
              {[0, 1, 2, 3].map((v) => (
                <option key={v} value={v}>
                  {t(`predict.verbosityOption${v}`)}
                </option>
              ))}
            </select>
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
              disabled={disabled}
              onClick={apply}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
            >
              {t("predict.run.advancedDialogApply")}
            </button>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

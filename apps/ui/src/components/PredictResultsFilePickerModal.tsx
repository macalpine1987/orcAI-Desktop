import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  displayOrcaiViewSampleRateHz,
  formatBytes,
  formatDurationSec,
  formatSampleRateHz,
} from "../lib/formatAudio";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import type { PredictQueueFile } from "../workspace/predictQueue";

type Props = {
  open: boolean;
  files: PredictQueueFile[];
  activeFileName: string | null;
  onClose: () => void;
  onSelect: (name: string) => void;
};

export function PredictResultsFilePickerModal({
  open,
  files,
  activeFileName,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={`${PREDICT_APP_MODAL_OVERLAY_CLASS} predict-results-file-picker-overlay`}
        role="presentation"
        onClick={onClose}
      >
        <div
          className="predict-results-file-picker-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("predict.results.filePickerTitle")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="predict-results-file-picker-header">
            <div className="predict-results-file-picker-heading">
              <h2 className="predict-results-file-picker-title">
                {t("predict.results.filePickerTitle")}
              </h2>
              <p className="predict-results-file-picker-hint">
                {t("predict.results.filePickerHint")}
              </p>
            </div>
            <ModalCloseButton
              aria-label={t("predict.results.filePickerClose")}
              title={t("predict.results.filePickerClose")}
              onClick={onClose}
            />
          </div>

          {files.length === 0 ? (
            <p className="predict-results-file-picker-empty">
              {t("predict.results.noFiles")}
            </p>
          ) : (
            <div className="predict-results-file-picker-table-wrap">
              <div className="predict-results-file-picker-cols" aria-hidden>
                <span>{t("projects.recordingsTable.file")}</span>
                <span>{t("predict.queueDurationColumn")}</span>
                <span>{t("projects.recordingsTable.viewSampleRate")}</span>
                <span>{t("predict.results.filePickerColSize")}</span>
              </div>
              <ul className="predict-results-file-picker-list" role="listbox">
                {files.map((file) => {
                  const selected = file.name === activeFileName;
                  return (
                    <li key={file.name}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`predict-results-file-picker-item${
                          selected ? " is-active" : ""
                        }`}
                        title={file.name}
                        onClick={() => {
                          onSelect(file.name);
                          onClose();
                        }}
                      >
                        <span className="predict-results-file-picker-name">
                          {file.name}
                        </span>
                        <span className="predict-results-file-picker-duration">
                          {formatDurationSec(file.duration_sec)}
                        </span>
                        <span className="predict-results-file-picker-rate">
                          {formatSampleRateHz(
                            displayOrcaiViewSampleRateHz(file.sample_rate_hz),
                          )}
                        </span>
                        <span className="predict-results-file-picker-size">
                          {formatBytes(file.size_bytes)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

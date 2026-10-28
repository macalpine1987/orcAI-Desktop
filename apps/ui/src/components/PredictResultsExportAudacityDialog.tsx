import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import type { PredictQueueFile } from "../workspace/predictQueue";

type Props = {
  open: boolean;
  /** Recognized (done/filtered) WAV files available for export. */
  files: PredictQueueFile[];
  /** Current Results file — pre-checked when present in `files`. */
  activeFileName: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (selectedNames: string[]) => void;
};

function initialSelection(
  files: PredictQueueFile[],
  activeFileName: string | null,
): Set<string> {
  if (
    activeFileName &&
    files.some((f) => f.name === activeFileName)
  ) {
    return new Set([activeFileName]);
  }
  return new Set();
}

export function PredictResultsExportAudacityDialog({
  open,
  files,
  activeFileName,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const listId = useId();
  const [selected, setSelected] = useState<Set<string>>(() =>
    initialSelection(files, activeFileName),
  );

  const filesKey = useMemo(
    () => files.map((f) => f.name).join("\0"),
    [files],
  );

  useEffect(() => {
    if (!open) return;
    setSelected(initialSelection(files, activeFileName));
  }, [open, files, filesKey, activeFileName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  const allNames = useMemo(() => files.map((f) => f.name), [files]);
  const allSelected =
    allNames.length > 0 && allNames.every((n) => selected.has(n));
  const selectedCount = selected.size;

  const toggleName = (name: string) => {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (busy || allNames.length === 0) return;
    setSelected(allSelected ? new Set() : new Set(allNames));
  };

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={`${PREDICT_APP_MODAL_OVERLAY_CLASS} predict-results-export-overlay`}
        role="presentation"
        onClick={() => {
          if (!busy) onCancel();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="predict-results-export-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="predict-results-export-header">
            <div className="predict-results-export-heading">
              <h2 id={titleId} className="predict-results-export-title">
                {t("predict.results.exportDialogTitle")}
              </h2>
              <p className="predict-results-export-hint">
                {t("predict.results.exportDialogBody")}
              </p>
            </div>
            <ModalCloseButton disabled={busy} onClick={onCancel} />
          </div>

          {files.length === 0 ? (
            <p className="predict-results-export-empty">
              {t("predict.results.exportDialogEmpty")}
            </p>
          ) : (
            <>
              <div className="predict-results-export-toolbar">
                <button
                  type="button"
                  className="predict-results-export-select-all"
                  disabled={busy}
                  onClick={toggleSelectAll}
                >
                  {allSelected
                    ? t("predict.results.exportDialogDeselectAll")
                    : t("predict.results.exportDialogSelectAll")}
                </button>
                <span className="predict-results-export-count">
                  {t("predict.results.exportDialogSelectedCount", {
                    selected: selectedCount,
                    total: files.length,
                  })}
                </span>
              </div>

              <ul
                id={listId}
                className="predict-results-export-list"
                role="group"
                aria-label={t("predict.results.exportDialogTitle")}
              >
                {files.map((file) => {
                  const checked = selected.has(file.name);
                  const isCurrent = file.name === activeFileName;
                  return (
                    <li key={file.name}>
                      <label
                        className={`predict-results-export-item${
                          checked ? " is-checked" : ""
                        }${isCurrent ? " is-current" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggleName(file.name)}
                        />
                        <span className="predict-results-export-name" title={file.name}>
                          {file.name}
                        </span>
                        {isCurrent ? (
                          <span className="predict-results-export-badge">
                            {t("predict.results.exportDialogCurrentBadge")}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="predict-results-export-footer">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="predict-results-export-btn predict-results-export-btn--ghost"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy || selectedCount === 0}
              onClick={() => onConfirm(Array.from(selected))}
              className="predict-results-export-btn predict-results-export-btn--primary"
            >
              {busy
                ? t("common.loading")
                : t("predict.results.exportDialogConfirm", {
                    count: selectedCount,
                  })}
            </button>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

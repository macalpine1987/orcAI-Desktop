import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";

type Props = {
  open: boolean;
  /** Unique recordings from the current Results table, first-seen order. */
  recordings: string[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (selectedRecordings: string[]) => void;
};

export function ResultsAudacityExportDialog({
  open,
  recordings,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const listId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(recordings));

  const recordingsKey = useMemo(() => recordings.join("\0"), [recordings]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(recordings));
  }, [open, recordings, recordingsKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  const allSelected =
    recordings.length > 0 && recordings.every((name) => selected.has(name));
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
    if (busy || recordings.length === 0) return;
    setSelected(allSelected ? new Set() : new Set(recordings));
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
                {t("results.exportDialogTitle")}
              </h2>
              <p className="predict-results-export-hint">
                {t("results.exportDialogBody")}
              </p>
            </div>
            <ModalCloseButton disabled={busy} onClick={onCancel} />
          </div>

          {recordings.length === 0 ? (
            <p className="predict-results-export-empty">
              {t("results.exportDialogEmpty")}
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
                    ? t("results.exportDialogDeselectAll")
                    : t("results.exportDialogSelectAll")}
                </button>
                <span className="predict-results-export-count">
                  {t("results.exportDialogSelectedCount", {
                    selected: selectedCount,
                    total: recordings.length,
                  })}
                </span>
              </div>

              <ul
                id={listId}
                className="predict-results-export-list"
                role="group"
                aria-label={t("results.exportDialogTitle")}
              >
                {recordings.map((name) => {
                  const checked = selected.has(name);
                  return (
                    <li key={name}>
                      <label
                        className={`predict-results-export-item${
                          checked ? " is-checked" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggleName(name)}
                        />
                        <span
                          className="predict-results-export-name"
                          title={name}
                        >
                          {name}
                        </span>
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
                : t("results.exportDialogConfirm", {
                    count: selectedCount,
                  })}
            </button>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  colorForLabel,
  formatDetectionTypeLabel,
  formatDetectionTypeLabelWithCode,
  type LabelColorMap,
} from "../../lib/labelColors";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../../lib/predictAppModal";
import { ModalCloseButton } from "../ModalCloseButton";
import {
  ALL_COLUMNS,
  columnPickerKey,
  type DetectionColumnId,
} from "./detectionTableColumns";
import type { ListScope } from "./detectionTableTypes";

type TypeSummaryItem = { label: string; count: number };

type Props = {
  typesOpen: boolean;
  columnsOpen: boolean;
  setTypesOpen: (v: boolean) => void;
  setColumnsOpen: (v: boolean) => void;
  typesDialogRef: RefObject<HTMLDivElement | null>;
  columnsDialogRef: RefObject<HTMLDivElement | null>;
  effectiveScope: ListScope;
  typeSummary: TypeSummaryItem[];
  rowsLength: number;
  filteredByConfidence: boolean;
  colorMap?: LabelColorMap;
  publicationNames: Record<string, string>;
  visibleCols: Record<DetectionColumnId, boolean>;
  visibleCount: number;
  toggleColumn: (id: DetectionColumnId) => void;
};

export function DetectionsTableModals({
  typesOpen,
  columnsOpen,
  setTypesOpen,
  setColumnsOpen,
  typesDialogRef,
  columnsDialogRef,
  effectiveScope,
  typeSummary,
  rowsLength,
  filteredByConfidence,
  colorMap,
  publicationNames,
  visibleCols,
  visibleCount,
  toggleColumn,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      {typesOpen ? (
        <PredictAppModalPortal>
          <div
            className={PREDICT_APP_MODAL_OVERLAY_CLASS}
            role="presentation"
            onClick={() => setTypesOpen(false)}
          >
            <div
              ref={typesDialogRef}
              className="analysis-detections-types-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("spectrogram.detections.typesTitle")}
              data-detection-legend=""
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="analysis-detections-columns-header">
                <div className="min-w-0">
                  <h4 className="analysis-detections-columns-title">
                    {t("spectrogram.detections.typesTitle")}
                  </h4>
                  <p className="analysis-detections-columns-hint">
                    {effectiveScope === "segment"
                      ? t("spectrogram.detections.typesHintSegment")
                      : t("spectrogram.detections.typesHintFile")}
                  </p>
                </div>
                <ModalCloseButton
                  data-modal-initial-focus=""
                  aria-label={t("spectrogram.detections.columnsClose")}
                  title={t("spectrogram.detections.columnsClose")}
                  onClick={() => setTypesOpen(false)}
                />
              </div>
              {typeSummary.length === 0 ? (
                <p className="analysis-detections-types-empty">
                  {rowsLength === 0
                    ? filteredByConfidence
                      ? t("spectrogram.detections.emptyFiltered")
                      : t("spectrogram.detections.empty")
                    : t("spectrogram.detections.emptySegment")}
                </p>
              ) : (
                <ul className="analysis-detections-types-list">
                  {typeSummary.map((item) => {
                    const swatch = colorForLabel(item.label, colorMap);
                    const typeLabel = formatDetectionTypeLabel(
                      item.label,
                      publicationNames,
                    );
                    const typeTitle = formatDetectionTypeLabelWithCode(
                      item.label,
                      publicationNames,
                    );
                    return (
                      <li
                        key={item.label}
                        className="analysis-detections-types-item"
                      >
                        <span
                          className="analysis-detections-types-swatch"
                          style={{ backgroundColor: swatch }}
                          title={typeTitle}
                          aria-hidden
                        />
                        <span
                          className="analysis-detections-types-label"
                          title={typeTitle}
                        >
                          {typeLabel}
                        </span>
                        <span className="analysis-detections-types-count">
                          {t("spectrogram.detections.typesCount", {
                            count: item.count,
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </PredictAppModalPortal>
      ) : null}

      {columnsOpen ? (
        <PredictAppModalPortal>
          <div
            className={PREDICT_APP_MODAL_OVERLAY_CLASS}
            role="presentation"
            onClick={() => setColumnsOpen(false)}
          >
            <div
              ref={columnsDialogRef}
              className="analysis-detections-columns-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("spectrogram.detections.columnsTitle")}
              data-detection-columns=""
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="analysis-detections-columns-header">
                <div className="min-w-0">
                  <h4 className="analysis-detections-columns-title">
                    {t("spectrogram.detections.columnsTitle")}
                  </h4>
                  <p className="analysis-detections-columns-hint">
                    {t("spectrogram.detections.columnsHint")}
                  </p>
                </div>
                <ModalCloseButton
                  data-modal-initial-focus=""
                  aria-label={t("spectrogram.detections.columnsClose")}
                  title={t("spectrogram.detections.columnsClose")}
                  onClick={() => setColumnsOpen(false)}
                />
              </div>
              <ul className="analysis-detections-columns-list">
                {ALL_COLUMNS.map((id) => {
                  const checked = visibleCols[id];
                  const disableUncheck = checked && visibleCount <= 1;
                  return (
                    <li key={id}>
                      <label className="analysis-detections-columns-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableUncheck}
                          onChange={() => toggleColumn(id)}
                        />
                        <span>{t(columnPickerKey(id))}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </PredictAppModalPortal>
      ) : null}

    </>
  );
}

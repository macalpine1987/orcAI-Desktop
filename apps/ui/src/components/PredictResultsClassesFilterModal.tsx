import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LabelColorMap } from "../lib/labelColors";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import {
  PredictResultsClassSidebar,
  type ClassSidebarEntry,
} from "./PredictResultsClassSidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  entries: ClassSidebarEntry[];
  modelClasses?: readonly string[] | null;
  hidden: Set<string>;
  colorMap: LabelColorMap;
  totalCount: number;
  unfilteredCount?: number;
  probabilityFloor: number;
  onProbabilityFloorChange: (percent: number) => void;
  predictThreshold?: number | null;
  onToggle: (label: string) => void;
};

/**
 * Table-hero (spectrogram off): class + probability filter in a modal.
 * Display toggles (score labels / annotations) are spectrogram-only — omitted here.
 */
export function PredictResultsClassesFilterModal({
  open,
  onClose,
  entries,
  modelClasses = null,
  hidden,
  colorMap,
  totalCount,
  unfilteredCount,
  probabilityFloor,
  onProbabilityFloorChange,
  predictThreshold = null,
  onToggle,
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
        className={`${PREDICT_APP_MODAL_OVERLAY_CLASS} predict-results-classes-filter-overlay`}
        role="presentation"
        onClick={onClose}
      >
        <div
          className="predict-results-classes-filter-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("predict.results.classesFilterTitle")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="predict-results-classes-filter-header">
            <div className="predict-results-classes-filter-heading">
              <h2 className="predict-results-classes-filter-title">
                {t("predict.results.classesFilterTitle")}
              </h2>
              <p className="predict-results-classes-filter-hint">
                {t("predict.results.classesFilterHint")}
              </p>
            </div>
            <ModalCloseButton
              aria-label={t("predict.results.classesFilterClose")}
              title={t("predict.results.classesFilterClose")}
              onClick={onClose}
            />
          </div>
          <div className="predict-results-classes-filter-body">
            <PredictResultsClassSidebar
              entries={entries}
              modelClasses={modelClasses}
              hidden={hidden}
              colorMap={colorMap}
              totalCount={totalCount}
              unfilteredCount={unfilteredCount}
              probabilityFloor={probabilityFloor}
              predictThreshold={predictThreshold}
              onProbabilityFloorChange={onProbabilityFloorChange}
              showProbability
              showAnnotations={false}
              annotationsAvailable={false}
              onToggle={onToggle}
              onShowProbabilityChange={() => undefined}
              onShowAnnotationsChange={() => undefined}
              showDisplayControls={false}
            />
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

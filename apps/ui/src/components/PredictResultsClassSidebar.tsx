import { useTranslation } from "react-i18next";
import { classFilterRows } from "../lib/classFilterCatalog";
import {
  colorForLabel,
  formatDetectionClassCode,
  type LabelColorMap,
} from "../lib/labelColors";
import { IconCircularReset } from "./SpectrogramIcons";

export type ClassSidebarEntry = {
  /** Raw label key as used in segments / hiddenLabels. */
  label: string;
  count: number;
};

type Props = {
  entries: ClassSidebarEntry[];
  /**
   * Classes of the model selected for recognition.
   * `null` until that model is known — then only labels present in the file are shown.
   */
  modelClasses?: readonly string[] | null;
  hidden: Set<string>;
  colorMap: LabelColorMap;
  /** Total detections after the probability floor (header badge). */
  totalCount: number;
  /** Primary detections before the floor (shown as filtered / all). */
  unfilteredCount?: number;
  probabilityFloor: number;
  onProbabilityFloorChange: (percent: number) => void;
  /** Predict `-th` as 0–1. Visual tick only. */
  predictThreshold?: number | null;
  showProbability: boolean;
  showAnnotations: boolean;
  annotationsAvailable: boolean;
  onToggle: (label: string) => void;
  onShowProbabilityChange: (next: boolean) => void;
  onShowAnnotationsChange: (next: boolean) => void;
  /** When false, hide «Отображение» (labels / annotations) — unused without spectrogram. */
  showDisplayControls?: boolean;
};

/**
 * m04 right rail: «Классы» + probability floor (C) + «Отображение».
 */
export function PredictResultsClassSidebar({
  entries,
  modelClasses = null,
  hidden,
  colorMap,
  totalCount,
  unfilteredCount,
  probabilityFloor,
  onProbabilityFloorChange,
  predictThreshold = null,
  showProbability,
  showAnnotations,
  annotationsAvailable,
  onToggle,
  onShowProbabilityChange,
  onShowAnnotationsChange,
  showDisplayControls = true,
}: Props) {
  const { t } = useTranslation();

  const rows = classFilterRows(modelClasses, entries);

  return (
    <aside
      className="predict-results-class-sidebar"
      data-spectrogram-chrome=""
      data-detection-legend=""
      aria-label={t("predict.results.classSidebarAria")}
    >
      <div className="predict-results-class-sidebar-head">
        <h3 className="predict-results-class-sidebar-title">
          {t("predict.results.classesTitle")}
        </h3>
        <span className="predict-results-class-sidebar-count" aria-hidden>
          {probabilityFloor > 0 &&
          unfilteredCount != null &&
          unfilteredCount !== totalCount
            ? `${totalCount} / ${unfilteredCount}`
            : totalCount}
        </span>
      </div>

      <ul className="predict-results-class-list" role="list">
        {rows.map((entry) => {
          const visible = !hidden.has(entry.label);
          const empty = entry.count === 0;
          const color = colorForLabel(entry.label, colorMap);
          const code = formatDetectionClassCode(entry.label);
          return (
            <li
              key={entry.label}
              role="listitem"
              className={[
                "predict-results-class-row",
                empty ? "is-empty" : "",
                !visible && !empty ? "is-off" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <label className="predict-results-class-label">
                <input
                  type="checkbox"
                  className="predict-results-class-check"
                  checked={visible && !empty}
                  disabled={empty}
                  onChange={() => onToggle(entry.label)}
                />
                <span
                  className="predict-results-class-swatch"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="predict-results-class-code">{code}</span>
                <span className="predict-results-class-n">{entry.count}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="predict-results-prob-floor">
        <div className="predict-results-prob-floor-head">
          <h3 className="predict-results-class-sidebar-title">
            {t("predict.results.probFloorTitle")}
          </h3>
          <div className="predict-results-prob-floor-meta">
            <span className="predict-results-prob-floor-value" aria-hidden>
              {probabilityFloor <= 0
                ? t("predict.results.probFloorAll")
                : t("predict.results.probFloorValue", { n: probabilityFloor })}
            </span>
          </div>
        </div>
        <label className="predict-results-prob-floor-slider">
          <span className="sr-only">{t("predict.results.probFloorAria")}</span>
          {typeof predictThreshold === "number" &&
          Number.isFinite(predictThreshold) ? (
            <span
              className="predict-results-prob-floor-th"
              style={{
                left: `${Math.max(0, Math.min(100, predictThreshold * 100))}%`,
              }}
              title={t("predict.results.probFloorPredictTick", {
                n: predictThreshold.toFixed(2),
              })}
              aria-hidden
            />
          ) : null}
          <input
            type="range"
            className="predict-logic-range-input"
            min={0}
            max={100}
            value={probabilityFloor}
            onChange={(e) => onProbabilityFloorChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={probabilityFloor}
            aria-label={t("predict.results.probFloorAria")}
            title={t("predict.results.probFloorHint")}
            style={{ ["--slider-pct" as string]: `${probabilityFloor}%` }}
          />
        </label>
        <div className="predict-results-prob-floor-ticks" aria-hidden>
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
        <button
          type="button"
          className="predict-results-prob-floor-reset"
          aria-label={t("predict.results.probFloorReset")}
          title={t("predict.results.probFloorResetHint")}
          disabled={probabilityFloor <= 0}
          onClick={() => onProbabilityFloorChange(0)}
        >
          <IconCircularReset size={12} />
          {t("predict.results.probFloorResetShort")}
        </button>
      </div>

      {showDisplayControls ? (
        <div className="predict-results-display-block">
          <h3 className="predict-results-class-sidebar-title">
            {t("predict.results.displayTitle")}
          </h3>
          <label
            className="predict-results-display-row"
            title={t("predict.results.showProbabilityHint")}
          >
            <span>{t("predict.results.showProbability")}</span>
            <input
              type="checkbox"
              className="predict-results-display-switch"
              role="switch"
              checked={showProbability}
              aria-label={t("predict.results.showProbabilityHint")}
              onChange={(e) => onShowProbabilityChange(e.target.checked)}
            />
          </label>
          <label
            className={
              annotationsAvailable
                ? "predict-results-display-row"
                : "predict-results-display-row is-disabled"
            }
            title={t("predict.results.showAnnotationsHint")}
          >
            <span>{t("predict.results.showAnnotations")}</span>
            <input
              type="checkbox"
              className="predict-results-display-switch"
              role="switch"
              checked={showAnnotations && annotationsAvailable}
              disabled={!annotationsAvailable}
              aria-label={t("predict.results.showAnnotationsHint")}
              onChange={(e) => onShowAnnotationsChange(e.target.checked)}
            />
          </label>
        </div>
      ) : null}
    </aside>
  );
}

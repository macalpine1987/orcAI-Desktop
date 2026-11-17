import { useTranslation } from "react-i18next";
import { classFilterRows } from "../lib/classFilterCatalog";
import {
  colorForLabel,
  formatDetectionClassCode,
  type LabelColorMap,
} from "../lib/labelColors";
import type { ClassSidebarEntry } from "./PredictResultsClassSidebar";
import { IconCircularReset } from "./SpectrogramIcons";

type Props = {
  entries: ClassSidebarEntry[];
  modelClasses?: readonly string[] | null;
  hidden: Set<string>;
  colorMap: LabelColorMap;
  probabilityFloor: number;
  onProbabilityFloorChange: (percent: number) => void;
  showProbability: boolean;
  showAnnotations: boolean;
  annotationsAvailable: boolean;
  onToggle: (label: string) => void;
  onShowProbabilityChange: (next: boolean) => void;
  onShowAnnotationsChange: (next: boolean) => void;
  onResetAll: () => void;
};

/**
 * Analysis tools chrome in «Classes» mode — replaces transport / LCD / zoom.
 * Layout matches ``docs/mockups/analysis-classes-tools-panel-live.html``.
 */
export function PredictResultsClassesToolsPanel({
  entries,
  modelClasses = null,
  hidden,
  colorMap,
  probabilityFloor,
  onProbabilityFloorChange,
  showProbability,
  showAnnotations,
  annotationsAvailable,
  onToggle,
  onShowProbabilityChange,
  onShowAnnotationsChange,
  onResetAll,
}: Props) {
  const { t } = useTranslation();
  const rows = classFilterRows(modelClasses, entries);
  const classesDefault = rows.every(
    (row) => row.count === 0 || !hidden.has(row.label),
  );
  const displayDefault =
    showProbability && (!annotationsAvailable || showAnnotations);
  const atDefault =
    classesDefault && probabilityFloor <= 0 && displayDefault;

  return (
    <div
      className="predict-results-classes-tools"
      role="toolbar"
      aria-label={t("predict.results.classesToolsAria")}
      data-spectrogram-chrome=""
    >
      <div className="predict-results-classes-tools-chips-wrap">
        <div
          className="predict-results-classes-tools-chips"
          aria-label={t("predict.results.classSidebarAria")}
        >
          {rows.map((entry) => {
            const visible = !hidden.has(entry.label);
            const empty = entry.count === 0;
            const color = colorForLabel(entry.label, colorMap);
            const code = formatDetectionClassCode(entry.label);
            return (
              <button
                key={entry.label}
                type="button"
                className={[
                  "predict-results-classes-chip",
                  empty ? "is-empty" : "",
                  !visible && !empty ? "is-off" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={empty}
                aria-pressed={visible && !empty}
                title={code}
                onClick={() => onToggle(entry.label)}
              >
                <span className="predict-results-classes-chip-check" aria-hidden />
                <span
                  className="predict-results-classes-chip-swatch"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="predict-results-classes-chip-code">{code}</span>
                <span className="predict-results-classes-chip-n">{entry.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="predict-results-classes-tools-sep" aria-hidden />

      <div className="predict-results-classes-tools-prob">
        <div className="predict-results-classes-tools-prob-head">
          <span className="predict-results-classes-tools-label">
            {t("predict.results.probFloorTitle")}
          </span>
          <span className="predict-results-classes-tools-lcd" aria-hidden>
            {probabilityFloor <= 0
              ? t("predict.results.probFloorAll")
              : t("predict.results.probFloorValue", { n: probabilityFloor })}
          </span>
        </div>
        <label className="predict-results-classes-tools-prob-slider">
          <span className="sr-only">{t("predict.results.probFloorAria")}</span>
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
          <span className="predict-results-classes-tools-prob-ticks" aria-hidden>
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </span>
        </label>
      </div>

      <div className="predict-results-classes-tools-sep" aria-hidden />

      <div
        className="predict-results-classes-tools-display"
        role="group"
        aria-label={t("predict.results.displayTitle")}
      >
        <span className="predict-results-classes-tools-label">
          {t("predict.results.displayTitle")}
        </span>
        <div className="predict-results-classes-tools-display-rows">
          <label
            className="predict-results-classes-tools-display-row"
            title={t("predict.results.showProbabilityHint")}
          >
            <span>{t("predict.results.showProbability")}</span>
            <input
              type="checkbox"
              className="predict-results-classes-tools-switch"
              role="switch"
              checked={showProbability}
              aria-label={t("predict.results.showProbabilityHint")}
              onChange={(e) => onShowProbabilityChange(e.target.checked)}
            />
          </label>
          <label
            className={
              annotationsAvailable
                ? "predict-results-classes-tools-display-row"
                : "predict-results-classes-tools-display-row is-disabled"
            }
            title={t("predict.results.showAnnotationsHint")}
          >
            <span>{t("predict.results.showAnnotations")}</span>
            <input
              type="checkbox"
              className="predict-results-classes-tools-switch"
              role="switch"
              checked={showAnnotations && annotationsAvailable}
              disabled={!annotationsAvailable}
              aria-label={t("predict.results.showAnnotationsHint")}
              onChange={(e) => onShowAnnotationsChange(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        className="predict-results-classes-tools-reset"
        disabled={atDefault}
        aria-label={t("predict.results.classesToolsReset")}
        title={t("predict.results.classesToolsResetHint")}
        onClick={onResetAll}
      >
        <IconCircularReset size={22} />
      </button>
    </div>
  );
}

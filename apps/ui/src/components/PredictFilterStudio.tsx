import { useTranslation } from "react-i18next";
import { colorForLabel } from "../lib/labelColors";
import { formatHistSeconds } from "../lib/callDurationLimits";
import { basename } from "../platform/dialog";
import { PredictFilterHistogram } from "./PredictFilterHistogram";
import { PredictFilterLimitsSection } from "./PredictFilterLimitsSection";
import { PredictFilterTrackToolbar } from "./PredictFilterTrackToolbar";
import type { FilterSettings } from "../workspace/predictSettings";
import {
  FilterSwitch,
  predictedDisplayName,
} from "./predictFilter/filterStudioControls";
import {
  usePredictFilterStudioModel,
  type PredictedFilterSource,
} from "../hooks/usePredictFilterStudioModel";

export type { PredictedFilterSource };

type Props = {
  sources: PredictedFilterSource[];
  activePredictedPath: string;
  onSelectPredictedPath: (path: string) => void;
  limitsPath: string;
  labelSuffix: string;
  filterSettings: FilterSettings;
  onFilterSettingsChange: (next: FilterSettings) => void;
  orcaiReady: boolean;
  batchRunning: boolean;
  filterSubmitting: boolean;
  onApply: (predictedPaths: string[], limitsPath: string) => void;
  /** WAV channel for the track chrome above the preview column. */
  channel?: number;
};

export function PredictFilterStudio({
  sources,
  activePredictedPath,
  onSelectPredictedPath,
  limitsPath,
  labelSuffix,
  filterSettings,
  onFilterSettingsChange,
  orcaiReady,
  batchRunning,
  filterSubmitting,
  onApply,
  channel = 1,
}: Props) {
  const m = usePredictFilterStudioModel({
    sources,
    activePredictedPath,
    onSelectPredictedPath,
    limitsPath,
    labelSuffix,
    filterSettings,
    onFilterSettingsChange,
    orcaiReady,
    batchRunning,
    filterSubmitting,
    onApply,
  });
  const { t } = useTranslation();

  return (
    <div className="predict-filter-m05-shell">
      <div className="predict-filter-m05">
      {m.noOp ? (
        <p className="predict-filter-m05-warn" role="status">
          {t("predict.filterStudio.defaultWarn")}
        </p>
      ) : null}
      {m.limitsInverted || m.selectedInverted ? (
        <p className="predict-filter-m05-error" role="alert">
          {t("predict.filterStudio.durationMinGtMax")}
        </p>
      ) : null}
      {m.previewError ? (
        <p className="predict-filter-m05-error" role="alert">
          {m.previewError}
        </p>
      ) : null}
      {m.publicationNote ? (
        <p className="predict-filter-m05-warn" role="status">
          {t("predict.filterStudio.publicationNeedsBuiltin")}
        </p>
      ) : null}

      <div className="predict-filter-m05-grid">
        <PredictFilterLimitsSection
          t={t}
          busy={m.busy}
          limitsLabel={m.limitsLabel}
          limits={m.limits}
          setLimits={m.setLimits}
          tableRows={m.tableRows}
          selectedClass={m.selectedClass}
          setSelectedClass={m.setSelectedClass}
          countsFor={m.countsFor}
          setBound={m.setBound}
          onLoad={m.onLoad}
          onSave={m.onSave}
          onPublicationExample={m.onPublicationExample}
        />

        <div className="predict-filter-m05-right">
          <PredictFilterTrackToolbar
            sources={sources}
            activePredictedPath={activePredictedPath}
            channel={channel}
            disabled={m.busy}
            onSelectPredictedPath={onSelectPredictedPath}
          />
        <aside className="predict-filter-m05-side">
          <h3>
            {t("predict.filterStudio.previewTitle", {
              klass: m.selectedClass,
            })}
          </h3>
          {m.selectedClass === "default" && m.defaultUsers.length > 1 ? (
            <p className="predict-filter-m05-shared-note">
              {t("predict.filterStudio.histDefaultShared")}
            </p>
          ) : null}
          {m.selectedClass === "default" &&
          m.defaultUsers.length === 0 &&
          m.preview.classes.some((row) => row.found > 0) ? (
            <p className="predict-filter-m05-shared-note">
              {t("predict.filterStudio.histDefaultEmpty")}
            </p>
          ) : null}
          <PredictFilterHistogram
            bins={m.hist.bins}
            tails={m.hist.tails}
            min={m.selectedPair[0] ?? null}
            max={m.selectedPair[1] ?? null}
            span={m.hist.span}
            binWidth={m.hist.binWidth}
            color={colorForLabel(m.selectedClass === "default" ? "WHISTLE" : m.selectedClass)}
            disabled={m.busy}
            minLabel={(n) => t("predict.filterStudio.histMin", { n })}
            maxLabel={(n) => t("predict.filterStudio.histMax", { n })}
            axisLabel={t("predict.filterStudio.histAxis")}
            countAxisLabel={t("predict.filterStudio.histCount")}
            formatSeconds={formatHistSeconds}
            scaleLabel={(n) => t("predict.filterStudio.histScale", { n })}
            tailRangeLabel={(from, to) =>
              t("predict.filterStudio.histTailRange", { from, to })
            }
            tailOpenLabel={(from) => t("predict.filterStudio.histTail", { n: from })}
            binTip={(bin) => {
              const range = t("predict.filterStudio.histBin", {
                count: bin.count,
                from: formatHistSeconds(bin.start),
                to: formatHistSeconds(bin.end),
              });
              if (bin.count === 0) return range;
              const fate =
                bin.keep === bin.count
                  ? t("predict.filterStudio.histFateKeep")
                  : bin.keep === 0
                    ? t("predict.filterStudio.histFateDrop")
                    : t("predict.filterStudio.histFateMixed", { keep: bin.keep });
              return `${range}. ${fate}`;
            }}
            legendKeep={t("predict.filterStudio.histLegendKeep")}
            legendDrop={t("predict.filterStudio.histLegendDrop")}
            hint={t("predict.filterStudio.histHint")}
            brushLabel={t("predict.filterStudio.histBrush")}
            onChange={(min, max) => m.setPair(m.selectedClass, min, max)}
            onGesture={(active) => m.setPinnedSpan(active ? m.hist.span : null)}
          />

          <div className="predict-filter-m05-source">
            <h3>{t("predict.filterStudio.source")}</h3>
            <select
              value={activePredictedPath}
              disabled={m.busy || sources.length === 0}
              title={
                activePredictedPath ? basename(activePredictedPath) : undefined
              }
              onChange={(e) => onSelectPredictedPath(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s.predictedPath} value={s.predictedPath}>
                  {predictedDisplayName(s.predictedPath)}
                </option>
              ))}
            </select>
            <p className="predict-filter-m05-source-n">
              {t("predict.filterStudio.sourceCount", { count: sources.length })}
            </p>
          </div>

          <FilterSwitch
            checked={m.applyAll}
            disabled={m.busy}
            label={t("predict.filterStudio.applyAll")}
            onChange={m.setApplyAll}
          />
          <FilterSwitch
            checked={filterSettings.overwrite}
            disabled={m.busy}
            label={t("predict.filterStudio.overwriteFiltered")}
            onChange={(next) =>
              onFilterSettingsChange({
                ...filterSettings,
                overwrite: next,
              })
            }
          />
          <p className="predict-filter-m05-note">{t("predict.filterStudio.originalUntouched")}</p>
        </aside>
        </div>
      </div>
      </div>

      <footer className="pp-footer predict-filter-m05-foot">
        <div className="pp-footer-main">
          <div className="pp-footer-cmd">
            <p className="pp-cmd-label">
              {t("predict.run.cliTitle")}
              {m.applyAll && m.previewPaths.length > 1
                ? ` ${t("predict.filterStudio.cliTimes", { count: m.previewPaths.length })}`
                : ""}
            </p>
            <div className="pp-cmd-row">
              <pre
                className={m.commandLine ? "pp-cmd-lcd" : "pp-cmd-lcd is-empty"}
                title={m.commandLine || undefined}
                aria-label={
                  m.commandLine
                    ? t("predict.run.cliTitle")
                    : t("predict.run.cliEmpty")
                }
              >
                {m.commandLine || t("predict.run.cliEmpty")}
              </pre>
              <button
                type="button"
                className="pp-btn pp-btn-preset pp-cmd-copy"
                disabled={m.busy || !m.commandLine.trim()}
                onClick={() => void m.onCopyCli()}
              >
                {m.cliCopied
                  ? t("predict.run.cliCopied")
                  : t("predict.run.cliCopy")}
              </button>
            </div>
          </div>
          <div className="pp-footer-side">
            <span className="pp-footer-count">
              {t("predict.filterStudio.remainOf", {
                keep: m.preview.total.keep,
                found: m.preview.total.found,
              })}
            </span>
            <div className="pp-footer-btns">
              <button
                type="button"
                className="pp-btn pp-btn-primary predict-filter-apply-btn"
                disabled={
                  m.busy ||
                  m.previewPaths.length === 0 ||
                  !limitsPath ||
                  m.limitsInverted
                }
                onClick={() => void m.onApplyClick()}
              >
                {filterSubmitting
                  ? t("predict.running")
                  : t("predict.filterStudio.apply")}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

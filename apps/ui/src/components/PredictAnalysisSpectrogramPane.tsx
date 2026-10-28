import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { patchPredictQueueFile, type PredictQueueFile } from "../workspace/predictQueue";
import type { PredictQueue } from "../workspace/predictQueue";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import { PredictSpectrogramPanel } from "./PredictSpectrogramPanel";

type Props = {
  queue: PredictQueue;
  activeInPackage: PredictQueueFile | null;
  canViewSpectrogram: boolean;
  spectrogramBlockedByLabels: boolean;
  resolvedLabelPath: string;
  predictThreshold?: number | null;
  modelClasses?: readonly string[] | null;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  onLabelOverride: (path: string | null) => void;
  onQueueChange: (next: PredictQueue) => void;
  layout?: "proLab" | "scientific";
  /** Variant A studio: spectrogram shows plot + transport only (toolbar is on the page). */
  studioChrome?: boolean;
  /** When false (studio), hide plot/transport/classes; expand detections table. Default true. */
  showSpectrogram?: boolean;
  transportSlot?: HTMLElement | null;
  toolsSlot?: HTMLElement | null;
  lcdSlot?: HTMLElement | null;
  zoomSlot?: HTMLElement | null;
  /** Portal studio segment rail between toolbar and spectrogram. */
  segmentSlot?: HTMLElement | null;
  studioFilePicker?: {
    open: boolean;
    onToggle: () => void;
    disabled?: boolean;
    canPrev?: boolean;
    canNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
  } | null;
  onDetectionTotalChange?: (total: number | null) => void;
  /** Queue / strip files for ±1 neighbor spectrogram warm. */
  neighborFiles?: { path: string; kind?: string }[] | null;
  /** Predict `-c` — spectrogram tiles and audio must match label `*_cN_*`. */
  channel?: number;
  focusNav?: DetectionFocusNav | null;
};

export function PredictAnalysisSpectrogramPane({
  queue,
  activeInPackage,
  canViewSpectrogram,
  spectrogramBlockedByLabels,
  resolvedLabelPath,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  onLabelOverride,
  onQueueChange,
  layout = "proLab",
  studioChrome = false,
  showSpectrogram = true,
  transportSlot = null,
  toolsSlot = null,
  lcdSlot = null,
  zoomSlot = null,
  segmentSlot = null,
  studioFilePicker = null,
  onDetectionTotalChange = undefined,
  neighborFiles = null,
  channel = 1,
  focusNav = null,
}: Props) {
  const { t } = useTranslation();
  const activeIsCsv = activeInPackage?.kind === "csv_table";

  useEffect(() => {
    if (!activeInPackage || activeIsCsv) {
      onDetectionTotalChange?.(null);
    }
  }, [activeInPackage, activeIsCsv, onDetectionTotalChange]);

  if (!activeInPackage) {
    return (
      <p className="rounded-xl border border-dashed border-border/80 bg-subtle/40 px-4 py-16 text-center text-sm text-foreground-muted">
        {t("predict.analysis.spectrogram.pickFileHint")}
      </p>
    );
  }

  if (activeIsCsv) {
    return (
      <p className="mat-card px-4 py-8 text-sm text-foreground-muted">
        {t("predict.csvNoSpectrogram")}
      </p>
    );
  }

  return (
    <>
      {spectrogramBlockedByLabels &&
      !canViewSpectrogram &&
      !resolvedLabelPath.trim() ? (
        <p className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t("predict.analysis.spectrogram.labelsMissingHint")}
        </p>
      ) : null}
      <PredictSpectrogramPanel
        layout={layout}
        studioChrome={studioChrome}
        showSpectrogram={showSpectrogram}
        transportSlot={transportSlot}
        toolsSlot={toolsSlot}
        lcdSlot={lcdSlot}
        zoomSlot={zoomSlot}
        segmentSlot={segmentSlot}
        studioFilePicker={studioFilePicker}
        wavPath={activeInPackage.path}
        labelPath={resolvedLabelPath}
        neighborFiles={neighborFiles}
        onLabelPathChange={(p) => {
          onLabelOverride(p);
          if (activeInPackage.name && p.trim()) {
            const next = patchPredictQueueFile(
              activeInPackage.name,
              { labelPath: p.trim() },
              queue,
            );
            if (next) onQueueChange(next);
          }
        }}
        compareLabelPath={activeInPackage.compareLabelPath ?? ""}
        onCompareLabelPathChange={(p) => {
          const next = patchPredictQueueFile(
            activeInPackage.name,
            { compareLabelPath: p },
            queue,
          );
          if (next) onQueueChange(next);
        }}
        onDetectionTotalChange={onDetectionTotalChange}
        predictChannel={channel}
        predictThreshold={predictThreshold}
        modelClasses={modelClasses}
        labelSource={labelSource}
        focusNav={focusNav}
      />
    </>
  );
}

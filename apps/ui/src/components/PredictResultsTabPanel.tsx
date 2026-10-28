import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePredictResultFiles } from "../lib/predictResultFiles";
import { canOpenSpectrogramForFile } from "../lib/predictQueueUi";
import { usePreferences } from "../preferences/PreferencesContext";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";
import { PredictAnalysisSpectrogramPane } from "./PredictAnalysisSpectrogramPane";
import { PredictResultsFilePickerModal } from "./PredictResultsFilePickerModal";
import { PredictResultsToolbar } from "./PredictResultsToolbar";
import {
  analysisRunBannerI18nKey,
  analysisRunBannerTone,
  type AnalysisRunSummary,
} from "../lib/analysisRunSummary";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import clsx from "clsx";

type Props = {
  queue: PredictQueue;
  batchRunning: boolean;
  runSummary: AnalysisRunSummary | null;
  active: PredictQueueFile | null;
  channel: number;
  modelId: string;
  modelLabelName?: string;
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
  onDismissRunBanner: () => void;
  onSelectActive: (name: string) => void;
  onLabelOverride: (path: string | null) => void;
  onQueueChange: (next: PredictQueue) => void;
  onDetectionTotalChange?: (total: number | null) => void;
  focusNav?: DetectionFocusNav | null;
};

export function PredictResultsTabPanel({
  queue,
  batchRunning,
  runSummary,
  active,
  channel,
  modelId,
  modelLabelName,
  resolvedLabelPath,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  onDismissRunBanner,
  onSelectActive,
  onLabelOverride,
  onQueueChange,
  onDetectionTotalChange,
  focusNav = null,
}: Props) {
  const { t } = useTranslation();
  const { showSpectrogram } = usePreferences();
  const toolsSlotRef = useRef<HTMLDivElement>(null);
  const transportSlotRef = useRef<HTMLDivElement>(null);
  const lcdSlotRef = useRef<HTMLDivElement>(null);
  const segmentSlotRef = useRef<HTMLDivElement>(null);
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null);
  const [transportSlot, setTransportSlot] = useState<HTMLElement | null>(null);
  const [lcdSlot, setLcdSlot] = useState<HTMLElement | null>(null);
  const [segmentSlot, setSegmentSlot] = useState<HTMLElement | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  useEffect(() => {
    setToolsSlot(toolsSlotRef.current);
    setTransportSlot(transportSlotRef.current);
    setLcdSlot(lcdSlotRef.current);
    setSegmentSlot(segmentSlotRef.current);
  }, [showSpectrogram]);

  const filesState = usePredictResultFiles(queue, active, onSelectActive);
  const activeFile = filesState.activeFile;

  const toggleFilePicker = useCallback(() => {
    setFilePickerOpen((open) => !open);
  }, []);

  const closeFilePicker = useCallback(() => {
    setFilePickerOpen(false);
  }, []);

  return (
    <div
      className={clsx(
        "predict-results-studio",
        !showSpectrogram && "is-table-hero",
      )}
    >
      {runSummary ? (
        <div
          className={`predict-results-toast is-${analysisRunBannerTone(runSummary)}`}
        >
          <p>
            {t(analysisRunBannerI18nKey(runSummary), {
              succeeded: runSummary.succeeded,
              failed: runSummary.failed,
              total: runSummary.total,
              preexisting: runSummary.preexisting ?? 0,
            })}
          </p>
          <button
            type="button"
            onClick={onDismissRunBanner}
            aria-label={t("predict.analysis.dismissBanner")}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="predict-results-stage">
        {showSpectrogram ? (
          <PredictResultsToolbar
            toolsSlotRef={toolsSlotRef}
            transportSlotRef={transportSlotRef}
            lcdSlotRef={lcdSlotRef}
          />
        ) : null}
        <div
          ref={segmentSlotRef}
          className="predict-results-segment-panel"
          data-spectrogram-chrome=""
        />
        <PredictAnalysisSpectrogramPane
          layout="scientific"
          studioChrome
          showSpectrogram={showSpectrogram}
          toolsSlot={showSpectrogram ? toolsSlot : null}
          transportSlot={showSpectrogram ? transportSlot : null}
          lcdSlot={showSpectrogram ? lcdSlot : null}
          segmentSlot={segmentSlot}
          studioFilePicker={{
            open: filePickerOpen,
            onToggle: toggleFilePicker,
            disabled: batchRunning && filesState.visibleFiles.length === 0,
            canPrev: filesState.canPrev,
            canNext: filesState.canNext,
            onPrev: () => filesState.goRelative(-1),
            onNext: () => filesState.goRelative(1),
          }}
          queue={queue}
          activeInPackage={activeFile}
          canViewSpectrogram={
            activeFile != null &&
            canOpenSpectrogramForFile(
              activeFile,
              channel,
              modelId,
              modelLabelName,
            )
          }
          spectrogramBlockedByLabels={
            activeFile != null &&
            activeFile.kind === "wav" &&
            (activeFile.status === "done" || activeFile.status === "filtered") &&
            !canOpenSpectrogramForFile(
              activeFile,
              channel,
              modelId,
              modelLabelName,
            )
          }
          resolvedLabelPath={resolvedLabelPath}
          predictThreshold={predictThreshold}
          modelClasses={modelClasses}
          labelSource={labelSource}
          onLabelOverride={onLabelOverride}
          onQueueChange={onQueueChange}
          onDetectionTotalChange={onDetectionTotalChange}
          neighborFiles={filesState.visibleFiles}
          channel={channel}
          focusNav={focusNav}
        />
      </div>

      <PredictResultsFilePickerModal
        open={filePickerOpen}
        files={filesState.visibleFiles}
        activeFileName={queue.activeFileName}
        onClose={closeFilePicker}
        onSelect={onSelectActive}
      />
    </div>
  );
}

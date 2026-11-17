import { useCallback, useEffect, useRef, useState } from "react";
import { usePredictResultFiles } from "../lib/predictResultFiles";
import { canOpenSpectrogramForFile } from "../lib/predictQueueUi";
import { usePreferences } from "../preferences/PreferencesContext";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";
import { PredictAnalysisSpectrogramPane } from "./PredictAnalysisSpectrogramPane";
import { PredictResultsToolbar } from "./PredictResultsToolbar";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import clsx from "clsx";

type Props = {
  queue: PredictQueue;
  batchRunning: boolean;
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
  onSelectActive: (name: string) => void;
  onLabelOverride: (path: string | null) => void;
  onQueueChange: (next: PredictQueue) => void;
  onDetectionTotalChange?: (total: number | null) => void;
  focusNav?: DetectionFocusNav | null;
};

export function PredictResultsTabPanel({
  queue,
  batchRunning,
  active,
  channel,
  modelId,
  modelLabelName,
  resolvedLabelPath,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  onSelectActive,
  onLabelOverride,
  onQueueChange,
  onDetectionTotalChange,
  focusNav = null,
}: Props) {
  const { showSpectrogram } = usePreferences();
  const toolsSlotRef = useRef<HTMLDivElement>(null);
  const transportSlotRef = useRef<HTMLDivElement>(null);
  const lcdSlotRef = useRef<HTMLDivElement>(null);
  const classesToolsSlotRef = useRef<HTMLDivElement>(null);
  const segmentSlotRef = useRef<HTMLDivElement>(null);
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null);
  const [transportSlot, setTransportSlot] = useState<HTMLElement | null>(null);
  const [lcdSlot, setLcdSlot] = useState<HTMLElement | null>(null);
  const [classesToolsSlot, setClassesToolsSlot] = useState<HTMLElement | null>(
    null,
  );
  const [segmentSlot, setSegmentSlot] = useState<HTMLElement | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [classesToolsOpen, setClassesToolsOpen] = useState(false);

  useEffect(() => {
    setToolsSlot(toolsSlotRef.current);
    setTransportSlot(transportSlotRef.current);
    setLcdSlot(lcdSlotRef.current);
    setClassesToolsSlot(classesToolsSlotRef.current);
    setSegmentSlot(segmentSlotRef.current);
  }, [showSpectrogram, classesToolsOpen]);

  useEffect(() => {
    if (!showSpectrogram) setClassesToolsOpen(false);
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
      <div className="predict-results-stage">
        {showSpectrogram ? (
          <PredictResultsToolbar
            toolsSlotRef={toolsSlotRef}
            transportSlotRef={transportSlotRef}
            lcdSlotRef={lcdSlotRef}
            classesToolsSlotRef={classesToolsSlotRef}
            classesMode={classesToolsOpen}
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
          classesToolsSlot={showSpectrogram ? classesToolsSlot : null}
          classesToolsOpen={classesToolsOpen}
          onClassesToolsOpenChange={setClassesToolsOpen}
          segmentSlot={segmentSlot}
          studioFilePicker={{
            open: filePickerOpen,
            onToggle: toggleFilePicker,
            onClose: closeFilePicker,
            disabled: batchRunning && filesState.visibleFiles.length === 0,
            canPrev: filesState.canPrev,
            canNext: filesState.canNext,
            onPrev: () => filesState.goRelative(-1),
            onNext: () => filesState.goRelative(1),
            files: filesState.visibleFiles,
            activeFileName: queue.activeFileName,
            onSelect: onSelectActive,
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

    </div>
  );
}

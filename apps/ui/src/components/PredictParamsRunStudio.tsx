import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../api/models";
import { pickJsonFile } from "../platform/dialog";
import { predictFilesToRun } from "../lib/predictBatch";
import { inferPredictedLabelPath } from "../lib/predictLabels";
import { PREDICT_CLI_KEYS } from "../lib/predictCliLine";
import { copyText } from "../lib/jobLogExport";
import {
  channelMapFromRecordingTableRows,
  estimatePredictEtaSeconds,
  filterPredictQueueFiles,
  formatPredictEta,
  formatPredictQueueHours,
  type PredictQueueViewFilter,
} from "../lib/predictQueueStudio";
import {
  batchSelectedNames,
  predictQueueAudioFiles,
  type PredictQueue,
} from "../workspace/predictQueue";
import type { PredictSettings } from "../workspace/predictSettings";
import { projectCallDurationLimitsPath } from "../workspace/predictSettings";
import { defaultRecordingsDir } from "../workspace/project";
import {
  type PredictQueueUnavailableReason,
} from "../lib/predictQueueUi";
import { useSaveNotice } from "../ui/saveNotice";
import { PredictAdvancedParamsDialog } from "./PredictAdvancedParamsDialog";
import {
  BUILTIN_MODEL_CLASSES,
  channelForQueueFile,
} from "./predictParams/predictParamsHelpers";
import { PredictParamsQueuePanel } from "./predictParams/PredictParamsQueuePanel";
import { PredictParamsLaunchPanel } from "./predictParams/PredictParamsLaunchPanel";
import { COPY_FEEDBACK_MS } from "../lib/timeouts";

type Props = {
  queue: PredictQueue | null;
  queueUnavailable?: PredictQueueUnavailableReason | null;
  queueLoading?: boolean;
  orcaiReady: boolean;
  batchRunning: boolean;
  models: OrcaiModel[];
  settings: PredictSettings;
  onSettingsChange: (settings: PredictSettings) => void;
  viewFilter: PredictQueueViewFilter;
  onFilterChange: (f: PredictQueueViewFilter) => void;
  commandLine: string;
  channelCollision: boolean;
  sharedOutputWarn?: boolean;
  runnableCount: number;
  tableBlocked?: boolean;
  batchProgress: { done: number; total: number } | null;
  canManageFiles: boolean;
  busy?: boolean;
  runningFileName?: string | null;
  activeFileName?: string | null;
  /** Channels from project recording_table.csv (stem / name → channel). */
  recordingTableRows?: Array<{ recording: string; channel: number | null }>;
  onSelectActive: (name: string) => void;
  onToggleBatchSelect: (name: string) => void;
  onAddWavs: () => void;
  onRunBatch: () => void;
  onBatchCancel: () => void;
};

export function PredictParamsRunStudio({
  queue,
  queueUnavailable,
  queueLoading,
  orcaiReady,
  batchRunning,
  models,
  settings,
  onSettingsChange,
  viewFilter,
  onFilterChange,
  commandLine,
  channelCollision,
  sharedOutputWarn = false,
  runnableCount,
  tableBlocked = false,
  batchProgress,
  canManageFiles,
  busy,
  runningFileName,
  activeFileName,
  recordingTableRows = [],
  onSelectActive,
  onToggleBatchSelect,
  onAddWavs,
  onRunBatch,
  onBatchCancel,
}: Props) {
  const { t } = useTranslation();
  const { notifyHeaderError } = useSaveNotice();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [batchCancelling, setBatchCancelling] = useState(false);
  useEffect(() => {
    if (!batchRunning) setBatchCancelling(false);
  }, [batchRunning]);
  useEffect(() => {
    const el = scrollRef.current;
    const root = el?.closest(".predict-studio");
    if (!el || !(root instanceof HTMLElement)) return;
    const apply = () => {
      const gutter = Math.max(0, el.offsetWidth - el.clientWidth);
      root.style.setProperty("--pp-params-scrollbar", `${gutter}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--pp-params-scrollbar");
    };
  }, []);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [cliCopied, setCliCopied] = useState(false);
  const cliCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (cliCopiedTimerRef.current) clearTimeout(cliCopiedTimerRef.current);
    };
  }, []);
  const fieldsDisabled = !orcaiReady || batchRunning;

  const patch = (p: Partial<PredictSettings>) => {
    if (fieldsDisabled) return;
    onSettingsChange({ ...settings, ...p });
  };

  const selectedModel = models.find((m) => m.id === settings.model);
  const isBuiltin = !selectedModel || selectedModel.kind !== "trained";
  const modelCliKey = isBuiltin
    ? PREDICT_CLI_KEYS.model
    : PREDICT_CLI_KEYS.modelDir;
  const fromApi = selectedModel?.calls?.filter((c) => Boolean(c?.trim())) ?? [];
  const classes =
    (fromApi.length ? fromApi : null) ??
    BUILTIN_MODEL_CLASSES[settings.model] ??
    BUILTIN_MODEL_CLASSES[selectedModel?.id ?? ""] ??
    null;

  const allAudio = queue ? predictQueueAudioFiles(queue) : [];
  const visible = filterPredictQueueFiles(queue, viewFilter);
  const selectedNames = queue ? batchSelectedNames(queue) : [];
  const selectedCount = selectedNames.length;
  const etaLabel = formatPredictEta(
    estimatePredictEtaSeconds(
      queue ? predictFilesToRun(queue, selectedNames) : [],
    ),
  );
  const channelMap = useMemo(
    () => channelMapFromRecordingTableRows(recordingTableRows),
    [recordingTableRows],
  );
  const hoursLabel = formatPredictQueueHours(
    allAudio,
    t("predict.run.unitHours"),
    t("predict.run.unitMinutes"),
  );
  const cdlOn = settings.callDurationFilter === true;
  const projectDir = queue?.projectDir ?? settings.callDurationLimitsProjectDir;
  const hasCsvInQueue =
    queue?.files.some((f) => f.kind === "csv_table") ?? false;

  const onCopyCli = async () => {
    if (!commandLine.trim()) return;
    const ok = await copyText(commandLine);
    if (!ok) {
      notifyHeaderError(t("predict.run.cliCopyFailed"));
      return;
    }
    setCliCopied(true);
    if (cliCopiedTimerRef.current) clearTimeout(cliCopiedTimerRef.current);
    cliCopiedTimerRef.current = setTimeout(() => setCliCopied(false), COPY_FEEDBACK_MS);
  };

  useEffect(() => {
    if (!hasCsvInQueue || !queue) return;
    const expected = defaultRecordingsDir(queue.projectDir);
    const current = settings.baseDirRecording.trim();
    if (
      !current ||
      (current !== expected &&
        !current.startsWith(queue.projectDir.replace(/[/\\]+$/, "")))
    ) {
      onSettingsChange({ ...settings, baseDirRecording: expected });
    }
    // Only react to project / CSV presence — not every settings keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [hasCsvInQueue, queue?.projectDir]);

  const setCdlEnabled = (on: boolean) => {
    if (fieldsDisabled) return;
    if (!on) {
      patch({
        callDurationFilter: false,
        callDurationLimits: "",
        callDurationLimitsProjectDir: projectDir ?? null,
      });
      return;
    }
    if (projectDir) {
      const orcaiName =
        queue?.projectName ??
        projectDir.split(/[/\\]/).filter(Boolean).pop() ??
        "project";
      patch({
        callDurationFilter: true,
        callDurationLimits: projectCallDurationLimitsPath(
          projectDir,
          orcaiName,
        ),
        callDurationLimitsProjectDir: projectDir,
      });
      return;
    }
    void pickJsonFile(t("predict.callDurationLimitsPickTitle")).then((p) => {
      if (p) {
        onSettingsChange({
          ...settings,
          callDurationFilter: true,
          callDurationLimits: p,
          callDurationLimitsProjectDir: projectDir ?? null,
        });
      }
    });
  };

  return (
    <div className="pp-params-layout">
      {channelCollision ? (
        <p className="pp-warn" role="status">
          {t("predict.run.channelCollisionWarn")}
        </p>
      ) : null}
      {sharedOutputWarn ? (
        <p className="pp-warn" role="status">
          {t("predict.run.sharedOutputWarn")}
        </p>
      ) : null}

      <div className="pp-params-scroll" ref={scrollRef}>
        <div className="pp-params-grid">
          <PredictParamsLaunchPanel
            models={models}
            settings={settings}
            fieldsDisabled={fieldsDisabled}
            isBuiltin={isBuiltin}
            modelCliKey={modelCliKey}
            classes={classes}
            selectedModel={selectedModel}
            cdlOn={cdlOn}
            projectDir={projectDir}
            patch={patch}
            setCdlEnabled={setCdlEnabled}
            setAdvancedOpen={setAdvancedOpen}
            notifyHeaderError={notifyHeaderError}
          />

          <PredictParamsQueuePanel
            queue={queue}
            queueUnavailable={queueUnavailable}
            queueLoading={queueLoading}
            batchRunning={batchRunning}
            busy={busy}
            canManageFiles={canManageFiles}
            viewFilter={viewFilter}
            onFilterChange={onFilterChange}
            allAudio={allAudio}
            visible={visible}
            selectedCount={selectedCount}
            hoursLabel={hoursLabel}
            etaLabel={etaLabel}
            channelMap={channelMap}
            settingsChannel={settings.channel}
            activeFileName={activeFileName}
            runningFileName={runningFileName}
            onSelectActive={onSelectActive}
            onToggleBatchSelect={onToggleBatchSelect}
            onAddWavs={onAddWavs}
          />
        </div>
      </div>

      {/* —— Footer: КОМАНДА orcAI (m03) —— */}
      <footer className="pp-footer">
        <div className="pp-footer-main">
          <div className="pp-footer-cmd">
            <p className="pp-cmd-label">{t("predict.run.cliTitle")}</p>
            <div className="pp-cmd-row">
              <pre
                className={commandLine ? "pp-cmd-lcd" : "pp-cmd-lcd is-empty"}
                title={commandLine || undefined}
                aria-label={
                  commandLine
                    ? t("predict.run.cliTitle")
                    : t("predict.run.cliEmpty")
                }
              >
                {commandLine || t("predict.run.cliEmpty")}
              </pre>
              <button
                type="button"
                className="pp-btn pp-btn-preset pp-cmd-copy"
                disabled={batchRunning || !commandLine.trim()}
                onClick={() => void onCopyCli()}
              >
                {cliCopied
                  ? t("predict.run.cliCopied")
                  : t("predict.run.cliCopy")}
              </button>
            </div>
          </div>
          <div className="pp-footer-side">
            <span className="pp-footer-count">
              {t("predict.run.willProcess", { count: runnableCount })}
            </span>
            <div className="pp-footer-btns">
              {batchRunning ? (
                <button
                  type="button"
                  className="pp-btn pp-btn-preset"
                  disabled={batchCancelling}
                  onClick={() => {
                    setBatchCancelling(true);
                    onBatchCancel();
                  }}
                >
                  {t("predict.batchCancel")}
                </button>
              ) : null}
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                disabled={
                  !orcaiReady ||
                  batchRunning ||
                  runnableCount === 0 ||
                  tableBlocked
                }
                title={
                  tableBlocked
                    ? t("projects.studio.table.predictBlockedStale")
                    : undefined
                }
                onClick={onRunBatch}
              >
                {batchRunning && batchProgress
                  ? t("predict.batchRunning", {
                      done: Math.min(
                        batchProgress.total,
                        Math.floor(batchProgress.done),
                      ),
                      total: batchProgress.total,
                    })
                  : t("predict.run.startRecognition")}
              </button>
            </div>
          </div>
        </div>
      </footer>

      <PredictAdvancedParamsDialog
        open={advancedOpen}
        settings={settings}
        disabled={fieldsDisabled}
        suggestedPath={(() => {
          const activeFile = queue?.files.find(
            (f) => f.name === queue.activeFileName && f.kind === "wav",
          );
          return activeFile != null
            ? inferPredictedLabelPath(
                activeFile.path,
                channelForQueueFile(
                  activeFile.name,
                  channelMap,
                  settings.channel,
                ),
                settings.model,
              )
            : undefined;
        })()}
        onCancel={() => setAdvancedOpen(false)}
        onApply={(next) => {
          patch(next);
          setAdvancedOpen(false);
        }}
      />
    </div>
  );
}


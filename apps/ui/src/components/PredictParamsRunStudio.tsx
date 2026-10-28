import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../api/models";
import { pickJsonFile } from "../platform/dialog";
import { predictFilesToRun, predictRecordingStem } from "../lib/predictBatch";
import { inferPredictedLabelPath } from "../lib/predictLabels";
import { PREDICT_CLI_KEYS } from "../lib/predictCliLine";
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
  isFileSelectedForPredict,
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
  type PredictQueueFileStatus,
} from "../workspace/predictQueue";
import type { PredictSettings } from "../workspace/predictSettings";
import { projectCallDurationLimitsPath } from "../workspace/predictSettings";
import { defaultRecordingsDir } from "../workspace/project";
import type { PredictQueueUnavailableReason } from "../lib/predictQueueUi";
import { PredictAdvancedParamsDialog } from "./PredictAdvancedParamsDialog";

function channelForQueueFile(
  fileName: string,
  channelMap: Record<string, number>,
  fallback: number,
): number {
  return (
    channelMap[fileName] ??
    channelMap[predictRecordingStem(fileName)] ??
    fallback
  );
}

function StudioSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="pp-switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="pp-switch-knob" aria-hidden />
    </button>
  );
}

/** Known builtin class lists for m03 class strip (orcAI parameter.json). */
const BUILTIN_MODEL_CLASSES: Record<string, string[]> = {
  "orcai-isl-v1": [
    "BR",
    "BUZZ",
    "HERDING",
    "PHS",
    "SS",
    "TAILSLAP",
    "WHISTLE",
  ],
  "orcai-nor-v1": [
    "BR",
    "BUZZ",
    "HERDING",
    "PHS",
    "SS",
    "TAILSLAP",
    "WHISTLE",
  ],
};

function statusTone(status: PredictQueueFileStatus): string {
  switch (status) {
    case "done":
    case "filtered":
      return "pp-status--done";
    case "failed":
      return "pp-status--failed";
    case "running":
      return "pp-status--running";
    default:
      return "pp-status--pending";
  }
}

function statusKey(status: PredictQueueFileStatus): string {
  switch (status) {
    case "done":
      return "predict.run.statusDone";
    case "filtered":
      return "predict.run.statusFiltered";
    case "failed":
      return "predict.run.statusFailed";
    case "running":
      return "predict.run.statusRunning";
    default:
      return "predict.run.statusPending";
  }
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
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
    try {
      await navigator.clipboard.writeText(commandLine);
      setCliCopied(true);
      window.setTimeout(() => setCliCopied(false), 1600);
    } catch {
      /* ignore */
    }
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
        {/* —— Left: ПАРАМЕТРЫ ЗАПУСКА —— */}
        <section className="pp-col pp-col--model" aria-labelledby="pp-model-input-label">
          <h2 id="pp-model-input-label" className="pp-col-label">
            {t("predict.run.modelInputTitle")}
          </h2>

          <div className="pp-field">
            <span className="pp-label">
              {t("predict.model")}{" "}
              <span className="pp-cli-key" aria-hidden>
                {modelCliKey}
              </span>
            </span>
            <div className="pp-field-row">
              <select
                className="pp-select pp-select-model"
                value={settings.model}
                disabled={fieldsDisabled}
                onChange={(e) => {
                  const id = e.target.value;
                  const entry = models.find((m) => m.id === id);
                  patch({
                    model: id,
                    modelDir: entry?.kind === "trained" ? entry.path : undefined,
                  });
                }}
              >
                {models.length === 0 ? (
                  <option value="orcai-isl-v1">orcai-isl-v1</option>
                ) : (
                  models.map((m) => (
                    <option key={m.path} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
              {isBuiltin ? (
                <span className="pp-builtin">{t("predict.run.builtinBadge")}</span>
              ) : (
                <span className="pp-builtin">{t("predict.trainedModel")}</span>
              )}
            </div>
            {classes ? (
              <p className="pp-classes">
                {t("predict.run.classCount", { count: classes.length })}:{" "}
                {classes.join(" · ")}
              </p>
            ) : selectedModel?.kind === "trained" ? (
              <p className="pp-classes text-foreground-muted">
                {t("predict.run.classesUnknown")}
              </p>
            ) : null}
          </div>

          <div className="pp-field">
            <span className="pp-label">
              {t("predict.channel")}{" "}
              <span className="pp-cli-key" aria-hidden>
                {PREDICT_CLI_KEYS.channel}
              </span>
            </span>
            <div className="pp-field-row pp-field-row--channel">
              <input
                type="number"
                min={1}
                className="pp-input pp-input-sm"
                value={settings.channel}
                disabled={fieldsDisabled}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch({
                    channel: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
                  });
                }}
              />
              <span className="pp-hint">{t("predict.run.channelHint")}</span>
              <button
                type="button"
                className="ps-btn ps-btn-sm pp-channel-advanced"
                disabled={fieldsDisabled}
                title={
                  settings.outputPath.trim() &&
                  settings.outputPath.trim() !== "default"
                    ? `${PREDICT_CLI_KEYS.outputPath} ${settings.outputPath}`
                    : `${PREDICT_CLI_KEYS.outputPath} · ${PREDICT_CLI_KEYS.verbosity} ${settings.verbosity}`
                }
                onClick={() => setAdvancedOpen(true)}
              >
                {t("predict.advancedOpen")}
              </button>
            </div>
          </div>

          <div className="pp-field">
            <span className="pp-label">{t("predict.run.thresholdTitle")}</span>
            <div className="pp-threshold">
              <div className="pp-threshold-lcd" aria-live="polite">
                <span className="pp-threshold-lcd-cap">
                  {t("predict.run.thresholdLcdCap")}
                </span>
                <span className="pp-threshold-lcd-val">
                  {settings.threshold.toFixed(2)}
                </span>
              </div>
              <div className="pp-threshold-slider-wrap">
                <div className="pp-threshold-scale">
                  <span>0.00</span>
                  <span>1.00</span>
                </div>
                <input
                  type="range"
                  className="pp-threshold-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.threshold}
                  disabled={fieldsDisabled}
                  tabIndex={fieldsDisabled ? -1 : 0}
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={settings.threshold}
                  aria-valuetext={settings.threshold.toFixed(2)}
                  style={
                    {
                      "--pp-th-pct": `${Math.round(settings.threshold * 100)}%`,
                    } as CSSProperties
                  }
                  onChange={(e) =>
                    patch({ threshold: Number(e.target.value) })
                  }
                  onInput={(e) =>
                    patch({
                      threshold: Number(
                        (e.target as HTMLInputElement).value,
                      ),
                    })
                  }
                  aria-label={t("predict.run.thresholdTitle")}
                />
              </div>
              <span className="pp-threshold-flag" aria-hidden>
                {PREDICT_CLI_KEYS.threshold}
              </span>
            </div>
          </div>

          <div className="pp-field">
            <span className="pp-label">
              {t("predict.labelSuffix")}{" "}
              <span className="pp-cli-key" aria-hidden>
                {PREDICT_CLI_KEYS.labelSuffix}
              </span>
            </span>
            <div className="pp-field-row">
              <input
                type="text"
                className="pp-input pp-input-sm"
                value={settings.labelSuffix}
                disabled={fieldsDisabled}
                onChange={(e) => patch({ labelSuffix: e.target.value })}
              />
              <span className="pp-hint">{t("predict.run.labelSuffixHint")}</span>
            </div>
          </div>

          <div className="pp-toggles">
            <div className="pp-toggle-row">
              <StudioSwitch
                checked={settings.saveProbabilities}
                disabled={fieldsDisabled}
                label={t("predict.run.toggleSpTitle")}
                onChange={(v) => patch({ saveProbabilities: v })}
              />
              <div className="pp-toggle-copy">
                <span className="pp-toggle-title">
                  {t("predict.run.toggleSpTitle")}
                </span>
                <span className="pp-toggle-sub">
                  {PREDICT_CLI_KEYS.saveProbabilities} ·{" "}
                  {t("predict.run.toggleSpHint")}
                </span>
              </div>
            </div>

            <div className="pp-toggle-row">
              <StudioSwitch
                checked={settings.overwrite}
                disabled={fieldsDisabled}
                label={t("predict.run.toggleOwTitle")}
                onChange={(v) => patch({ overwrite: v })}
              />
              <div className="pp-toggle-copy">
                <span className="pp-toggle-title">
                  {t("predict.run.toggleOwTitle")}
                </span>
                <span className="pp-toggle-sub">
                  {PREDICT_CLI_KEYS.overwrite} · {t("predict.run.toggleOwHint")}
                </span>
              </div>
            </div>

            <div className="pp-toggle-row pp-toggle-row--cdl">
              <StudioSwitch
                checked={cdlOn}
                disabled={fieldsDisabled}
                label={t("predict.run.toggleCdlTitle")}
                onChange={setCdlEnabled}
              />
              <div className="pp-toggle-copy">
                <span className="pp-toggle-title">
                  {t("predict.run.toggleCdlTitle")}
                </span>
                <span className="pp-toggle-sub">
                  {PREDICT_CLI_KEYS.callDurationLimits} ·{" "}
                  {cdlOn && settings.callDurationLimits.trim()
                    ? settings.callDurationLimits.split(/[/\\]/).pop()
                    : "call_duration_limits.json"}
                </span>
              </div>
              <div className="pp-toggle-actions">
                <button
                  type="button"
                  className="ps-btn ps-btn-sm"
                  disabled={fieldsDisabled}
                  onClick={() =>
                    void pickJsonFile(
                      t("predict.callDurationLimitsPickTitle"),
                    ).then((p) => {
                      if (p) {
                        patch({
                          callDurationFilter: true,
                          callDurationLimits: p,
                          callDurationLimitsProjectDir: projectDir ?? null,
                        });
                      }
                    })
                  }
                >
                  {t("predict.run.pickJson")}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* —— Right: ОЧЕРЕДЬ ЗАПУСКА —— */}
        <section className="pp-col pp-col--queue" aria-labelledby="pp-queue-label">
          <div className="pp-col-head">
            <h2 id="pp-queue-label" className="pp-col-label">
              {t("predict.run.queueStudioTitle")}
            </h2>
            <span className="pp-col-meta">
              {hoursLabel != null
                ? t("predict.run.queueMeta", {
                    count: allAudio.length,
                    hours: hoursLabel,
                  })
                : t("predict.run.queueMetaCountOnly", {
                    count: allAudio.length,
                  })}
            </span>
          </div>
          <p className="pp-queue-hint">{t("predict.run.queueStudioHint")}</p>

          <div
            className="pp-filter-seg"
            role="group"
            aria-label={t("predict.run.filterAria")}
          >
            {(
              [
                ["all", t("predict.run.filterAll")],
                ["new", t("predict.run.filterNew")],
                ["failed", t("predict.run.filterFailed")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={viewFilter === id}
                disabled={!queue || batchRunning}
                onClick={() => onFilterChange(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pp-queue-run-meta">
            <span>
              {t("predict.run.selectedCount", {
                selected: selectedCount,
                visible: visible.length,
              })}
            </span>
            <span title={t("predict.run.etaHint")}>
              {t("predict.run.etaLabel", { eta: etaLabel })}
            </span>
          </div>

          <div className="pp-queue-table-wrap">
            {queueUnavailable ? (
              <p className="pp-empty">{t("predict.queueBlockedNoProject")}</p>
            ) : queueLoading ? (
              <p className="pp-empty">{t("shellMeta.loading")}</p>
            ) : !queue || allAudio.length === 0 ? (
              <div className="pp-empty">
                <p>{t("predict.queueEmpty")}</p>
                {canManageFiles ? (
                  <button
                    type="button"
                    className="ps-btn mt-2"
                    disabled={busy || batchRunning}
                    onClick={onAddWavs}
                  >
                    {t("predict.queueAddWavs")}
                  </button>
                ) : null}
              </div>
            ) : visible.length === 0 ? (
              <p className="pp-empty">
                {viewFilter === "failed"
                  ? t("predict.run.queueFilterEmptyFailed")
                  : viewFilter === "new"
                    ? t("predict.run.queueFilterEmptyNew")
                    : t("predict.queueEmpty")}
              </p>
            ) : (
              <table className="pp-queue-table">
                <thead>
                  <tr>
                    <th scope="col" className="pp-queue-th-check">
                      <span className="sr-only">{t("predict.run.colSelect")}</span>
                    </th>
                    <th scope="col" className="pp-queue-th-file">
                      {t("predict.run.colFile")}
                    </th>
                    <th scope="col" className="pp-queue-th-ch">
                      {t("predict.run.colChannel")}
                    </th>
                    <th scope="col" className="pp-queue-th-status">
                      {t("predict.run.colStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((file) => (
                    <QueueRow
                      key={file.name}
                      file={file}
                      channel={channelForQueueFile(
                        file.name,
                        channelMap,
                        settings.channel,
                      )}
                      selected={isFileSelectedForPredict(queue, file.name)}
                      active={
                        file.name === activeFileName ||
                        file.name === runningFileName
                      }
                      disabled={batchRunning}
                      onSelectActive={onSelectActive}
                      onToggleBatchSelect={onToggleBatchSelect}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
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
                disabled={!commandLine.trim()}
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
                  onClick={onBatchCancel}
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

function QueueRow({
  file,
  channel,
  selected,
  active,
  disabled,
  onSelectActive,
  onToggleBatchSelect,
}: {
  file: PredictQueueFile;
  channel: number;
  selected: boolean;
  active: boolean;
  disabled?: boolean;
  onSelectActive: (name: string) => void;
  onToggleBatchSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      className={
        active
          ? "is-active"
          : file.status === "running"
            ? "is-running"
            : undefined
      }
      onClick={() => onSelectActive(file.name)}
    >
      <td className="pp-queue-td-check" onClick={(e) => e.stopPropagation()}>
        <label className="pp-queue-check">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggleBatchSelect(file.name)}
            aria-label={file.name}
          />
          <span className="pp-queue-check-box" aria-hidden />
        </label>
      </td>
      <td className="pp-queue-td-file" title={file.path}>
        <span className="pp-queue-file-name">{file.name}</span>
      </td>
      <td className="pp-queue-td-ch">{channel}</td>
      <td className="pp-queue-td-status">
        <span className={`pp-status ${statusTone(file.status)}`}>
          <span className="pp-status-dot" aria-hidden />
          {t(statusKey(file.status))}
        </span>
      </td>
    </tr>
  );
}

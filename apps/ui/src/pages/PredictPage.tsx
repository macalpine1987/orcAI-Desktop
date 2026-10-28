import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cancelJob, createJob, createPredictJob, type JobRecord } from "../api/jobs";
import { pathExists } from "../api/fs";
import { fetchModels, type OrcaiModel } from "../api/models";
import { PageHelpButton } from "../components/PageHelpButton";
import { PredictParamsRunStudio } from "../components/PredictParamsRunStudio";
import { PredictProfileSaveAsDialog } from "../components/PredictProfileSaveAsDialog";
import { PredictProjectPresetsBar } from "../components/PredictProjectPresetsBar";
import { PredictResultsExportAudacityDialog } from "../components/PredictResultsExportAudacityDialog";
import { PredictResultsModelSettingsModal } from "../components/PredictResultsModelSettingsModal";
import { PredictFilterTabPanel } from "../components/PredictFilterTabPanel";
import type { PredictedFilterSource } from "../components/PredictFilterStudio";
import { PredictResultsTabPanel } from "../components/PredictResultsTabPanel";
import { PredictTabPanel, PredictTabs, type PredictTabId } from "../components/PredictTabs";
import { resolveFilterJobOutputPath } from "../lib/callDurationLimits";
import {
  shouldKeepNavLabelOverride,
  type DetectionFocusNav,
} from "../lib/resultsStudio";
import { callsForSelectedModel } from "../lib/classFilterCatalog";
import { buildPredictCliLine } from "../lib/predictCliLine";
import { exportPackageFilesToAudacity } from "../lib/exportAnalysisAudacity";
import { joinFsPath } from "../lib/joinFsPath";
import { IconExport } from "../components/SpectrogramIcons";
import { NavIcon } from "../components/NavIcon";
import { useSaveNotice } from "../ui/saveNotice";
import {
  canUseCsvPredictBatch,
  csvPredictCliRecordingPath,
  countPredictRunnable,
  matchPredictBatchResultToQueueFile,
  parsePredictFileLogLine,
  predictBatchProgressUnits,
  predictFileNeedsOverwrite,
  predictFileQueuePatchesFromLog,
  predictRecordingStem,
  resolveFilterOverwrite,
  resolvePredictOverwrite,
  predictFilesToRun,
  selectedFileNamesForRun,
  type PredictBatchFileResult,
} from "../lib/predictBatch";
import {
  channelForQueueFile,
  collisionEntriesFromTableSelection,
  hasSharedOutputChannelCollision,
  hasSharedOutputMultiFileRisk,
  type PredictQueueViewFilter,
} from "../lib/predictQueueStudio";
import { fetchProjectRecordingTable } from "../api/projects";
import {
  createModelProfile,
  draftSettingsForActiveProfile,
  getModelProfile,
  isProfileDirty,
  loadActiveModelProfileId,
  loadModelProfiles,
  persistModelProfiles,
  profileSettingsToPredictSettings,
  profileWithSavedSettings,
  profilesForProject,
  settingsFromPredictSettings,
  upsertModelProfile,
  type ModelProfile,
} from "../workspace/predictModelProfiles";
import {
  loadPredictActiveTab,
  normalizePredictNavTab,
  resolvePredictActiveTab,
  savePredictActiveTab,
} from "../lib/predictPageSession";
import {
  expectedPredictOutputPath,
  isAnnotationExistsError,
  parseAnnotationExistsPath,
} from "../lib/predictOverwrite";
import { useJobPoller } from "../hooks/useJobPoller";
import { usePredictOverwriteDialog } from "../hooks/usePredictOverwriteDialog";
import { usePredictQueue } from "../hooks/usePredictQueue";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { isRecordingTableBlockingPredict } from "../lib/recordingTableGate";
import { usePredictBatch } from "../predict/PredictBatchContext";
import {
  defaultAnalysisLabelKind,
  filteredLabelPathForQueueFile,
  originalLabelPathForQueueFile,
  predictResultsTabEnabled,
  resolveAnalysisLabelPath,
  resolveModelLabelName,
  type AnalysisLabelKind,
} from "../lib/predictQueueUi";
import type { AnalysisRunSummary } from "../lib/analysisRunSummary";
import { basename } from "../platform/dialog";
import {
  clearShellMetaFramesBridge,
  setShellMetaFramesBridge,
} from "../lib/shellMetaFrames";
import { waitForJobTerminal } from "../lib/waitForJob";
import { loadWorkspace, saveWorkspace, WORKSPACE_CHANGED_EVENT } from "../workspace/storage";
import {
  applyProjectCallDurationLimits,
  buildPredictJobParams,
  loadFilterSettings,
  loadPredictSettings,
  saveFilterSettings,
  savePredictSettings,
  projectCallDurationLimitsPath,
  type FilterSettings,
  type PredictSettings,
} from "../workspace/predictSettings";
import { persistActiveProjectPredictModel } from "../workspace/project";
import {
  batchSelectedNames,
  dropCompletedFromPredictSelection,
  ensurePredictSelectionForOverwrite,
  finalizePredictSelectionAfterRun,
  patchPredictQueueFile,
  persistPredictQueue,
  resolveFilterPredictedPath,
  runningPredictFile,
  setQueueSelection,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";

function samePresetModel(
  draft: { model: string; modelDir?: string | null },
  preset: { model: string; modelDir?: string | null },
): boolean {
  return (
    draft.model === preset.model &&
    (draft.modelDir?.trim() || undefined) === (preset.modelDir?.trim() || undefined)
  );
}

type PredictLocationState = {
  tab?: string;
  wavPath?: string;
  labelPath?: string;
  compareLabelPath?: string;
  model?: string;
  modelDir?: string;
  focusStartSec?: number;
  focusEndSec?: number;
  focusLabel?: string;
};

export function PredictPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifySaved } = useSaveNotice();
  const trackJobInLab = useTrackJobInLab();
  const { engineReady, online, capabilities } = useSidecarStatus();
  const location = useLocation();
  const navState = (location.state ?? {}) as PredictLocationState;
  const [exportingResults, setExportingResults] = useState(false);
  const [exportAudacityOpen, setExportAudacityOpen] = useState(false);
  const [resultsDetectionCount, setResultsDetectionCount] = useState<
    number | null
  >(null);

  const {
    queue,
    setQueue,
    syncQueue,
    queueLoading,
    importingWavs,
    error,
    setError,
    workspace,
    active,
    activeProject,
    queueUnavailable,
    onSelectActive: selectActiveInQueue,
    onAddWavs,
  } = usePredictQueue();

  const { summary: projectSummary } = useProjectSummary(workspace.activeProjectId);
  const predictTableBlocked = isRecordingTableBlockingPredict({
    syncStatus: projectSummary?.recording_table.sync_status,
    wavCount:
      projectSummary?.readiness_lines.recordings.wav_count ??
      activeProject?.wav_count ??
      0,
    autoSync:
      projectSummary?.auto_sync_recording_table ??
      activeProject?.auto_sync_recording_table ??
      true,
  });

  const [activeTab, setActiveTabState] = useState<PredictTabId>(loadPredictActiveTab);

  const setActiveTab = (tab: PredictTabId) => {
    setActiveTabState(tab);
    savePredictActiveTab(tab);
  };

  const [draftSettings, setDraftSettings] = useState<PredictSettings>(() =>
    draftSettingsForActiveProfile(
      navState.model !== undefined
        ? { model: navState.model, modelDir: navState.modelDir }
        : undefined,
    ),
  );
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [queueViewFilter, setQueueViewFilter] =
    useState<PredictQueueViewFilter>("all");
  const [profiles, setProfiles] = useState<ModelProfile[]>(() =>
    loadModelProfiles(),
  );
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() =>
    loadActiveModelProfileId(),
  );
  const draftSettingsRef = useRef(draftSettings);
  const profilesRef = useRef(profiles);
  const activeProfileIdRef = useRef(activeProfileId);
  const presetModelGuardRef = useRef(
    navState.model === undefined && activeProfileId != null,
  );
  const seenProjectIdRef = useRef<string | null | undefined>(undefined);
  draftSettingsRef.current = draftSettings;
  profilesRef.current = profiles;
  activeProfileIdRef.current = activeProfileId;
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [recordingTableRows, setRecordingTableRows] = useState<
    Array<{ recording: string; channel: number | null }>
  >([]);

  useEffect(() => {
    const projectId = activeProject?.id ?? workspace.activeProjectId;
    if (!projectId || !online) {
      setRecordingTableRows([]);
      return;
    }
    let cancelled = false;
    void fetchProjectRecordingTable(projectId)
      .then((table) => {
        if (cancelled) return;
        setRecordingTableRows(
          table.rows.map((r) => ({
            recording: r.recording,
            channel: r.channel,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRecordingTableRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, workspace.activeProjectId, online]);

  useEffect(() => {
    if (activeTab === "run") setModelSettingsOpen(false);
  }, [activeTab]);

  const [runSummary, setRunSummary] = useState<AnalysisRunSummary | null>(null);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(() =>
    loadFilterSettings(),
  );
  const [models, setModels] = useState<OrcaiModel[]>([]);
  const {
    batchRunning,
    batchProgress,
    startBatch,
    updateBatchProgress,
    endBatch,
  } = usePredictBatch();
  const batchCancelRef = useRef(false);
  const predictMountedRef = useRef(true);
  const currentBatchJobIdRef = useRef<string | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const lastLimitsProjectRef = useRef<string | null>(null);
  const filterTargetFileRef = useRef<string | null>(null);
  const navWavMatchedRef = useRef(false);

  const [filterJob, setFilterJob] = useState<JobRecord | null>(null);
  const [filterSubmitting, setFilterSubmitting] = useState(false);
  const [spectrogramLabelOverride, setSpectrogramLabelOverride] = useState<
    string | null
  >(null);
  const [analysisLabelKind, setAnalysisLabelKind] =
    useState<AnalysisLabelKind>("filtered");
  const [analysisFocus, setAnalysisFocus] = useState<DetectionFocusNav | null>(
    null,
  );

  const { dialog: overwriteDialog, askFileOverwrite, askBatchOverwrite } =
    usePredictOverwriteDialog();

  const running = runningPredictFile(queue);
  const orcaiReady = engineReady;

  useEffect(() => {
    if (!queue?.projectDir) return;
    if (queue.projectDir === lastLimitsProjectRef.current) return;
    lastLimitsProjectRef.current = queue.projectDir;
    const orcaiName =
      workspace.projectDir === queue.projectDir ? workspace.projectName : null;
    setDraftSettings((prev) =>
      applyProjectCallDurationLimits(prev, queue.projectDir, orcaiName),
    );
  }, [queue?.projectDir, workspace.projectDir, workspace.projectName]);

  useEffect(() => {
    navWavMatchedRef.current = false;
    const st = (location.state ?? {}) as PredictLocationState;
    const tab = normalizePredictNavTab(st.tab);
    if (tab) {
      setActiveTabState(tab);
      savePredictActiveTab(tab);
    }
    const label = st.labelPath?.trim();
    if (label) {
      setSpectrogramLabelOverride(label);
      const lower = label.toLowerCase();
      if (lower.endsWith("_predicted_filtered.txt")) {
        setAnalysisLabelKind("filtered");
      } else if (lower.endsWith("_predicted.txt")) {
        setAnalysisLabelKind("original");
      }
    }
    if (
      st.focusStartSec != null &&
      Number.isFinite(st.focusStartSec) &&
      st.focusEndSec != null &&
      Number.isFinite(st.focusEndSec)
    ) {
      setAnalysisFocus({
        t0: st.focusStartSec,
        t1: st.focusEndSec,
        label: st.focusLabel,
        nonce: location.key,
      });
    }
  }, [location.state, location.key]);

  useEffect(() => {
    const st = (location.state ?? {}) as PredictLocationState;
    const decision = shouldKeepNavLabelOverride({
      navLabel: st.labelPath?.trim() || undefined,
      navWav: st.wavPath?.trim() || undefined,
      activeWav: active?.path,
      matchedNavWav: navWavMatchedRef.current,
    });
    if (decision.matched) navWavMatchedRef.current = true;
    if (decision.keep) return;
    setSpectrogramLabelOverride(null);
  }, [active?.name, active?.path, location.state, location.key]);

  useEffect(() => {
    const st = (location.state ?? {}) as PredictLocationState;
    if (st.model === undefined) return;
    presetModelGuardRef.current = false;
    const next: PredictSettings = {
      ...draftSettingsRef.current,
      model: st.model,
      modelDir: st.modelDir?.trim() || undefined,
    };
    draftSettingsRef.current = next;
    setDraftSettings(next);
    void persistActiveProjectPredictModel(st.model, st.modelDir ?? null);
  }, [location.state]);

  const modelsAvailable = online && capabilities?.orcai_installed === true;

  useEffect(() => {
    if (!modelsAvailable) return;
    void fetchModels(workspace.projectDir ?? undefined)
      .then(setModels)
      .catch(() => {
        setModels(capabilities?.builtin_models ?? []);
      });
  }, [modelsAvailable, workspace.projectDir, capabilities?.builtin_models]);

  useJobPoller(filterJob, setFilterJob);

  useEffect(() => {
    if (!filterJob) return;
    if (filterJob.status === "completed" && filterJob.result?.label_path) {
      const path = String(filterJob.result.label_path);
      const name = filterTargetFileRef.current;
      if (name) {
        const next = patchPredictQueueFile(
          name,
          { status: "filtered", filteredPath: path },
          queueRef.current,
        );
        if (next) setQueue(next);
      }
      saveWorkspace({ lastLabelPath: path });
      return;
    }
    if (filterJob.status === "failed" || filterJob.status === "cancelled") {
      setError(
        filterJob.error ??
          (filterJob.status === "cancelled"
            ? t("predict.filterCancelled")
            : t("predict.filterFailed")),
      );
      setFilterJob(null);
    }
  }, [filterJob, setQueue, setError, t]);

  useEffect(() => {
    predictMountedRef.current = true;
    return () => {
      predictMountedRef.current = false;
      // Sidecar jobs and batch loop continue in background (dock / Задачи).
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (active.kind === "wav") {
      saveWorkspace({ lastWavPath: active.path });
    }
    if (active.labelPath) {
      saveWorkspace({ lastLabelPath: active.labelPath });
    }
  }, [active?.name, active?.path, active?.labelPath, active?.filteredPath, active?.kind]);

  useEffect(() => {
    setAnalysisLabelKind(defaultAnalysisLabelKind(active));
  }, [active?.name, Boolean(active?.filteredPath?.trim())]);

  const onSelectActive = (name: string) => {
    selectActiveInQueue(name);
  };

  const applyDraftChange = (next: PredictSettings, prev: PredictSettings) => {
    draftSettingsRef.current = next;
    setDraftSettings(next);
    savePredictSettings(next);
    if (next.overwrite && !prev.overwrite) {
      const q = queueRef.current;
      if (q) syncQueue(ensurePredictSelectionForOverwrite(q));
    } else if (!next.overwrite && prev.overwrite) {
      const q = queueRef.current;
      if (q) syncQueue(dropCompletedFromPredictSelection(q));
    }
    if (!samePresetModel(next, prev)) {
      void persistActiveProjectPredictModel(next.model, next.modelDir ?? null);
    }
  };

  const handleSettingsChange = (next: PredictSettings) => {
    applyDraftChange(next, draftSettingsRef.current);
  };

  useEffect(() => {
    if (!draftSettings.overwrite) return;
    const q = queue;
    if (!q) return;
    const next = ensurePredictSelectionForOverwrite(q);
    if (next === q) return;
    syncQueue(next);
  }, [draftSettings.overwrite, queue, syncQueue]);

  const runBatchRecognition = async () => {
    if (!queue || !orcaiReady) return;
    if (predictTableBlocked) {
      setError(t("projects.studio.table.predictBlockedStale"));
      return;
    }

    const fileNames = selectedFileNamesForRun(queue);
    const pending = predictFilesToRun(queue, fileNames);
    if (!pending.length) {
      setError(t("predict.run.nothingToRun"));
      return;
    }

    const rerunCount = pending.filter((f) => predictFileNeedsOverwrite(f)).length;
    if (!draftSettings.overwrite && rerunCount > 0) {
      const confirmed = await askBatchOverwrite(rerunCount, pending.length);
      if (!confirmed) return;
    }

    batchCancelRef.current = false;
    currentBatchJobIdRef.current = null;
    setRunSummary(null);
    startBatch(pending.length);
    setError(null);

    const modelLabel = resolveModelLabelName(
      models,
      draftSettings.model,
      draftSettings.modelDir,
    );
    const channel = Math.max(1, Math.floor(draftSettings.channel) || 1);
    const tablePath =
      activeProject?.recording_table_path?.trim() ||
      projectSummary?.recording_table.path?.trim() ||
      "";
    const useCsvBatch = canUseCsvPredictBatch(pending, tablePath);

    let done = 0;
    let succeeded = 0;
    let failed = 0;
    let preexisting = 0;
    let currentQueue: PredictQueue | null = queue;

    const publishQueue = (next: PredictQueue | null) => {
      if (!next) return;
      currentQueue = next;
      persistPredictQueue(next);
      if (predictMountedRef.current) setQueue(next);
    };

    const publishQueueAfterBatch = (next: PredictQueue | null) => {
      if (!next) return;
      publishQueue(
        finalizePredictSelectionAfterRun(next, draftSettings.overwrite),
      );
    };

    const markPendingRunning = () => {
      let next = currentQueue;
      for (const file of pending) {
        next = patchPredictQueueFile(
          file.name,
          { status: "running", error: undefined },
          next,
        );
      }
      if (next) publishQueue(next);
    };

    const applyBatchFileResults = (
      results: PredictBatchFileResult[],
      jobStatus: JobRecord["status"],
    ) => {
      let next = currentQueue;
      for (const file of pending) {
        const row = matchPredictBatchResultToQueueFile(file, results);
        if (jobStatus === "cancelled" && (!row || row.status !== "completed")) {
          next = patchPredictQueueFile(
            file.name,
            {
              status: predictFileNeedsOverwrite(file) ? "done" : "pending",
              error: undefined,
            },
            next,
          );
          continue;
        }
        if (row?.status === "completed" && row.label_path) {
          succeeded += 1;
          next = patchPredictQueueFile(
            file.name,
            {
              status: "done",
              labelPath: row.label_path,
              // The filtered file was built from the previous predictions.
              filteredPath: undefined,
              error: undefined,
            },
            next,
          );
          if (currentQueue?.activeFileName === file.name) {
            saveWorkspace({
              lastLabelPath: row.label_path,
              lastWavPath: row.wav_path || file.path,
            });
          }
        } else if (row?.status === "preexisting" && row.label_path) {
          preexisting += 1;
          next = patchPredictQueueFile(
            file.name,
            {
              status: "done",
              labelPath: row.label_path,
              error: undefined,
            },
            next,
          );
        } else {
          failed += 1;
          next = patchPredictQueueFile(
            file.name,
            {
              status: "failed",
              error: t("predict.queueStatusFailed"),
            },
            next,
          );
        }
      }
      done = pending.length;
      updateBatchProgress(done, pending.length);
      if (next) publishQueueAfterBatch(next);
    };

    if (useCsvBatch) {
      markPendingRunning();
      const overwriteFlag =
        draftSettings.overwrite ||
        pending.some((f) => predictFileNeedsOverwrite(f));
      const stems = pending.map((f) => predictRecordingStem(f.name));
      try {
        const job = await createPredictJob(
          buildPredictJobParams(
            { ...draftSettings, overwrite: overwriteFlag },
            tablePath,
            currentQueue?.projectDir ?? queue.projectDir,
            draftSettings.model,
            models,
            draftSettings.modelDir,
            { recordingNames: stems },
          ),
        );
        trackJobInLab(job);
        currentBatchJobIdRef.current = job.id;

        const finished = await waitForJobTerminal(
          job.id,
          () => batchCancelRef.current,
          {
            onUpdate: (live) => {
              const parsed = parsePredictFileLogLine(live.log);
              if (parsed) {
                updateBatchProgress(
                  predictBatchProgressUnits(parsed, live.progress),
                  pending.length,
                );
                const patches = predictFileQueuePatchesFromLog(
                  pending,
                  parsed,
                  (file) =>
                    expectedPredictOutputPath(
                      file.path,
                      channelForQueueFile(file, recordingTableRows, channel),
                      draftSettings.model,
                      modelLabel,
                      draftSettings.outputPath,
                      { csvBatch: true },
                    ),
                );
                let next: PredictQueue | null = currentQueue;
                for (const patch of patches) {
                  next = patchPredictQueueFile(
                    patch.name,
                    {
                      status: patch.status,
                      ...(patch.labelPath
                        ? { labelPath: patch.labelPath, error: undefined }
                        : { error: undefined }),
                    },
                    next,
                  );
                }
                if (next) publishQueue(next);
              } else if (typeof live.progress === "number" && live.progress >= 0) {
                updateBatchProgress(
                  Math.min(pending.length, live.progress * pending.length),
                  pending.length,
                );
              }
            },
          },
        );
        currentBatchJobIdRef.current = null;

        const rawFiles = finished.result?.files;
        const results: PredictBatchFileResult[] = Array.isArray(rawFiles)
          ? (rawFiles as PredictBatchFileResult[])
          : [];

        if (finished.status === "completed" || results.length > 0) {
          applyBatchFileResults(results, finished.status);
        } else if (finished.status === "cancelled") {
          applyBatchFileResults(results, "cancelled");
        } else {
          failed = pending.length;
          let next: PredictQueue | null = currentQueue;
          for (const file of pending) {
            next = patchPredictQueueFile(
              file.name,
              {
                status: "failed",
                error: finished.error ?? t("predict.queueStatusFailed"),
              },
              next,
            );
          }
          if (next) publishQueueAfterBatch(next);
          done = pending.length;
          updateBatchProgress(done, pending.length);
        }
      } catch (err) {
        failed = pending.length;
        let next: PredictQueue | null = currentQueue;
        for (const file of pending) {
          next = patchPredictQueueFile(
            file.name,
            {
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            },
            next,
          );
        }
        if (next) publishQueueAfterBatch(next);
        done = pending.length;
        updateBatchProgress(done, pending.length);
      }

      endBatch();
      currentBatchJobIdRef.current = null;
      if (!predictMountedRef.current) return;
      if (succeeded > 0 || failed > 0 || preexisting > 0) {
        setRunSummary({
          succeeded,
          failed,
          total: pending.length,
          preexisting,
        });
        if (succeeded > 0 || preexisting > 0) {
          setActiveTab("results");
        }
      }
      return;
    }

    const runPredictJob = async (
      file: PredictQueueFile,
      q: PredictQueue,
      overwrite: boolean,
    ) => {
      const runSettings = { ...draftSettings, overwrite };
      const job = await createPredictJob(
        buildPredictJobParams(
          runSettings,
          file.path,
          q?.projectDir ?? queue.projectDir,
          runSettings.model,
          models,
          runSettings.modelDir,
        ),
      );
      trackJobInLab(job);
      currentBatchJobIdRef.current = job.id;
      const finished = await waitForJobTerminal(
        job.id,
        () => batchCancelRef.current,
        {
          onUpdate: (live) => {
            const parsed = parsePredictFileLogLine(live.log);
            const units =
              parsed != null
                ? predictBatchProgressUnits(parsed, live.progress)
                : typeof live.progress === "number"
                  ? live.progress
                  : 0;
            updateBatchProgress(
              Math.min(pending.length, done + units),
              pending.length,
            );
          },
        },
      );
      currentBatchJobIdRef.current = null;
      return finished;
    };

    for (const file of pending) {
      if (batchCancelRef.current) break;

      let next = patchPredictQueueFile(
        file.name,
        { status: "running", error: undefined },
        currentQueue,
      );
      if (next) {
        publishQueue(next);
      }

      try {
        let overwriteFlag = resolvePredictOverwrite(file, draftSettings.overwrite);
        if (!overwriteFlag) {
          const expectedLabel = expectedPredictOutputPath(
            file.path,
            channel,
            draftSettings.model,
            modelLabel,
            draftSettings.outputPath,
          );
          try {
            if (await pathExists(expectedLabel)) {
              if (!predictMountedRef.current) {
                done += 1;
                updateBatchProgress(done, pending.length);
                continue;
              }
              const confirmed = await askFileOverwrite(file.name, expectedLabel);
              if (!confirmed) {
                next = patchPredictQueueFile(
                  file.name,
                  { status: "pending", error: undefined },
                  currentQueue,
                );
                if (next) {
                  publishQueue(next);
                }
                done += 1;
                updateBatchProgress(done, pending.length);
                continue;
              }
              overwriteFlag = true;
            }
          } catch {
            /* path check unavailable — run and handle error if needed */
          }
        }

        let finished = await runPredictJob(file, currentQueue!, overwriteFlag);

        if (
          finished.status === "failed" &&
          isAnnotationExistsError(finished.error)
        ) {
          const labelPath =
            parseAnnotationExistsPath(finished.error) ??
            expectedPredictOutputPath(
              file.path,
              channel,
              draftSettings.model,
              modelLabel,
              draftSettings.outputPath,
            );
          if (predictMountedRef.current) {
            const confirmed = await askFileOverwrite(file.name, labelPath);
            if (confirmed) {
              finished = await runPredictJob(file, currentQueue!, true);
            }
          }
        }

        if (finished.status === "completed") {
          succeeded += 1;
          const labelPath =
            typeof finished.result?.label_path === "string"
              ? finished.result.label_path
              : undefined;
          const wavPath =
            typeof finished.result?.wav_path === "string"
              ? finished.result.wav_path
              : file.path;
          next = patchPredictQueueFile(
            file.name,
            {
              status: "done",
              labelPath,
              // The filtered file was built from the previous predictions.
              filteredPath: undefined,
              error: undefined,
            },
            currentQueue,
          );
          if (currentQueue?.activeFileName === file.name && labelPath) {
            saveWorkspace({ lastLabelPath: labelPath, lastWavPath: wavPath });
          }
        } else if (finished.status === "cancelled") {
          next = patchPredictQueueFile(
            file.name,
            {
              status: predictFileNeedsOverwrite(file) ? "done" : "pending",
              error: undefined,
            },
            currentQueue,
          );
        } else if (
          finished.status === "failed" &&
          isAnnotationExistsError(finished.error)
        ) {
          next = patchPredictQueueFile(
            file.name,
            { status: "pending", error: undefined },
            currentQueue,
          );
        } else {
          failed += 1;
          next = patchPredictQueueFile(
            file.name,
            {
              status: "failed",
              error: finished.error ?? t("predict.queueStatusFailed"),
            },
            currentQueue,
          );
        }
      } catch (err) {
        failed += 1;
        next = patchPredictQueueFile(
          file.name,
          {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          },
          currentQueue,
        );
      }
      if (next) {
        publishQueue(next);
      }
      done += 1;
      updateBatchProgress(done, pending.length);
    }

    if (currentQueue) {
      publishQueueAfterBatch(currentQueue);
    }

    endBatch();
    currentBatchJobIdRef.current = null;
    if (!predictMountedRef.current) return;
    if (succeeded > 0 || failed > 0 || preexisting > 0) {
      setRunSummary({
        succeeded,
        failed,
        total: pending.length,
        preexisting,
      });
      if (succeeded > 0 || preexisting > 0) {
        setActiveTab("results");
      }
    }
  };

  const onBatchCancel = () => {
    batchCancelRef.current = true;
    const jobId = currentBatchJobIdRef.current;
    if (jobId) {
      void cancelJob(jobId).catch(() => undefined);
    }
  };

  const onRunFilter = async (predictedPaths: string[], limitsJsonPath: string) => {
    if (!queue || predictedPaths.length === 0) return;
    setFilterSubmitting(true);
    setError(null);
    try {
      for (const predicted of predictedPaths) {
        const file =
          queueRef.current?.files.find((row) => {
            const path = resolveFilterPredictedPath(
              row,
              channelForQueueFile(row, recordingTableRows, predictChannel),
              modelId,
              modelLabelName,
            );
            return path === predicted;
          }) ?? null;
        filterTargetFileRef.current = file?.name ?? null;
        let overwrite = file
          ? resolveFilterOverwrite(file, filterSettings.overwrite)
          : filterSettings.overwrite;
        const outputFile =
          predictedPaths.length > 1
            ? "default"
            : filterSettings.outputFile.trim() || "default";
        if (!overwrite) {
          try {
            const filteredPath = resolveFilterJobOutputPath(predicted, outputFile);
            if (await pathExists(filteredPath)) {
              const label = file?.name ?? filteredPath.split(/[/\\]/).pop() ?? predicted;
              const confirmed = await askFileOverwrite(label, filteredPath);
              if (!confirmed) {
                continue;
              }
              overwrite = true;
            }
          } catch {
            /* path check unavailable — run and handle job error if needed */
          }
        }
        const job = await createJob("filter-predictions", {
          predicted_labels: predicted,
          project_dir: queue.projectDir,
          output_file: outputFile,
          overwrite,
          label_suffix: draftSettings.labelSuffix.trim(),
          call_duration_limits: limitsJsonPath,
        });
        setFilterJob(job);
        trackJobInLab(job);
        const finished = await waitForJobTerminal(job.id);
        if (finished.status !== "completed") {
          setError(
            finished.error ??
              (finished.status === "cancelled"
                ? t("predict.filterCancelled")
                : t("predict.filterFailed")),
          );
          break;
        }
        const outPath = finished.result?.label_path
          ? String(finished.result.label_path)
          : null;
        if (file && outPath) {
          const next = patchPredictQueueFile(
            file.name,
            { status: "filtered", filteredPath: outPath },
            queueRef.current,
          );
          if (next) setQueue(next);
          saveWorkspace({ lastLabelPath: outPath });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFilterSubmitting(false);
      setFilterJob(null);
    }
  };

  const modelId = draftSettings.model;
  const predictChannel = Math.max(1, Math.floor(draftSettings.channel) || 1);
  const channelForFile = (file: PredictQueueFile) =>
    channelForQueueFile(file, recordingTableRows, predictChannel);
  const activeChannel = active ? channelForFile(active) : predictChannel;
  const modelLabelName = resolveModelLabelName(
    models,
    modelId,
    draftSettings.modelDir,
  );
  const modelClasses = useMemo(
    () => callsForSelectedModel(models, modelId, draftSettings.modelDir),
    [models, modelId, draftSettings.modelDir],
  );
  const orcaiParameter =
    workspace.projectDir && workspace.projectName
      ? joinFsPath(
          workspace.projectDir,
          `${workspace.projectName}_orcai_parameter.json`,
        )
      : null;

  const filterSourcePath =
    active != null
      ? resolveFilterPredictedPath(
          active,
          channelForFile(active),
          modelId,
          modelLabelName,
        ) ?? ""
      : "";

  const filterSources = useMemo(() => {
    if (!queue) return [];
    const out: PredictedFilterSource[] = [];
    const seen = new Set<string>();
    for (const file of queue.files) {
      const path = resolveFilterPredictedPath(
        file,
        channelForFile(file),
        modelId,
        modelLabelName,
      );
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ file, predictedPath: path });
    }
    return out;
  }, [queue, recordingTableRows, predictChannel, modelId, modelLabelName]);

  const filterTrackSource = filterSources.find(
    (s) => s.predictedPath === filterSourcePath,
  );
  const filterTrackChannel = filterTrackSource
    ? channelForFile(filterTrackSource.file)
    : activeChannel;

  const filterLimitsPath =
    draftSettings.callDurationLimits.trim() ||
    (queue
      ? projectCallDurationLimitsPath(
          queue.projectDir,
          workspace.projectDir === queue.projectDir
            ? workspace.projectName
            : null,
        )
      : "");

  const onSelectPredictedPath = (path: string) => {
    const hit = filterSources.find((s) => s.predictedPath === path);
    if (hit) onSelectActive(hit.file.name);
  };

  const selectedFileNames = queue ? selectedFileNamesForRun(queue) : [];
  const runnableCount =
    queue && selectedFileNames.length > 0
      ? countPredictRunnable(queue, selectedFileNames)
      : 0;

  const projectProfiles = useMemo(
    () => profilesForProject(profiles, workspace.activeProjectId),
    [profiles, workspace.activeProjectId],
  );
  const presetDirty = useMemo(() => {
    if (!activeProfileId) return false;
    return isProfileDirty(
      profiles,
      activeProfileId,
      settingsFromPredictSettings(draftSettings),
    );
  }, [profiles, activeProfileId, draftSettings]);
  const runnableFiles =
    queue && selectedFileNames.length > 0
      ? predictFilesToRun(queue, selectedFileNames)
      : [];
  const queueReady = Boolean(queue) && !queueUnavailable && !queueLoading;
  const channelCollision =
    queueReady &&
    hasSharedOutputChannelCollision({
      outputPath: draftSettings.outputPath,
      entries: collisionEntriesFromTableSelection(
        selectedFileNames,
        recordingTableRows,
        draftSettings.channel,
      ),
    });
  // Same WAV listed twice with different channels is rare in Desktop queue;
  // also warn when shared -o is a non-default path and selection implies multi-run overwrite risk
  // via duplicate stems in the full audio list with mixed table channels (passed empty map → same channel).
  const sharedOutputMultiFile =
    queueReady &&
    hasSharedOutputMultiFileRisk({
      outputPath: draftSettings.outputPath,
      fileCount: runnableFiles.length,
    });

  const cliPreviewLine = useMemo(() => {
    if (!queueReady || !queue || !orcaiReady) return "";
    const pending = predictFilesToRun(queue, selectedFileNames);
    if (!pending.length) return "";
    const tablePath =
      activeProject?.recording_table_path?.trim() ||
      projectSummary?.recording_table.path?.trim() ||
      "";
    const useCsv = canUseCsvPredictBatch(pending, tablePath);
    const recordingPath =
      useCsv && tablePath
        ? csvPredictCliRecordingPath({
            tablePath,
            projectDir: queue.projectDir,
            pending,
            tableRows: recordingTableRows,
          })
        : pending[0].path;
    const extras = useCsv
      ? { recordingNames: pending.map((f) => predictRecordingStem(f.name)) }
      : undefined;
    // Preview must match run: re-running done/filtered files forces -ow.
    const effectiveOverwrite =
      draftSettings.overwrite ||
      pending.some((f) => predictFileNeedsOverwrite(f));
    const params = buildPredictJobParams(
      { ...draftSettings, overwrite: effectiveOverwrite },
      recordingPath,
      queue.projectDir,
      modelId,
      models,
      draftSettings.modelDir,
      extras,
    );
    return buildPredictCliLine(params);
  }, [
    queueReady,
    queue,
    orcaiReady,
    selectedFileNames,
    activeProject?.recording_table_path,
    projectSummary?.recording_table.path,
    recordingTableRows,
    draftSettings,
    modelId,
    models,
  ]);

  const queueBusy = batchRunning || importingWavs || queueLoading;
  const resultsEnabled =
    predictResultsTabEnabled(queue, queueReady) && orcaiReady;
  const filterTabEnabled =
    queueReady &&
    orcaiReady &&
    Boolean(
      queue?.files.some(
        (f) =>
          f.kind === "wav" &&
          (f.status === "done" ||
            f.status === "filtered" ||
            Boolean(f.labelPath?.trim() || f.filteredPath?.trim())),
      ),
    );

  const resultsSpectrogramResolvedLabel =
    spectrogramLabelOverride ??
    (active
      ? (resolveAnalysisLabelPath(
          active,
          analysisLabelKind,
          activeChannel,
          modelId,
          modelLabelName,
        ) ??
          (navState.wavPath === active.path ? navState.labelPath : undefined) ??
          "")
      : "");

  const analysisLabelSource =
    active && active.kind === "wav"
      ? {
          kind: analysisLabelKind,
          originalAvailable: Boolean(
            originalLabelPathForQueueFile(
              active,
              activeChannel,
              modelId,
              modelLabelName,
            ),
          ),
          filteredAvailable: Boolean(filteredLabelPathForQueueFile(active)),
          fileName: resultsSpectrogramResolvedLabel
            ? basename(resultsSpectrogramResolvedLabel)
            : "",
          onChange: (kind: AnalysisLabelKind) => {
            setSpectrogramLabelOverride(null);
            setAnalysisLabelKind(kind);
          },
        }
      : null;

  const onResultsDetectionTotalChange = useCallback((total: number | null) => {
    setResultsDetectionCount(total);
  }, []);

  useEffect(() => {
    setResultsDetectionCount(null);
  }, [active?.name, resultsSpectrogramResolvedLabel]);

  const resultsExportableFiles = useMemo(
    () =>
      queue?.files.filter(
        (f) =>
          f.kind === "wav" && (f.status === "done" || f.status === "filtered"),
      ) ?? [],
    [queue],
  );

  const resultsDoneFileCount = resultsExportableFiles.length;

  const runAudacityExport = useCallback(
    (selectedNames: string[]) => {
      if (!queue || exportingResults) return;
      const names = new Set(selectedNames);
      if (names.size === 0) {
        setError(t("predict.analysis.toolbar.exportNothing"));
        setExportAudacityOpen(false);
        return;
      }
      setExportAudacityOpen(false);
      setExportingResults(true);
      setError(null);
      void exportPackageFilesToAudacity({
        files: queue.files,
        selectedNames: names,
        channel: predictChannel,
        modelId,
        modelLabelName,
        orcaiParameter,
        directoryTitle: t("predict.results.exportPickFolder"),
      })
        .then((result) => {
          if (result.cancelled) return;
          if (result.exported > 0) {
            notifySaved(
              t("predict.analysis.toolbar.exportDone", {
                exported: result.exported,
                skipped: result.skipped + result.empty,
              }),
            );
          }
          if (result.errors.length > 0) {
            setError(
              t("predict.analysis.toolbar.exportPartialError", {
                count: result.errors.length,
                first: result.errors[0]?.fileName ?? "",
              }),
            );
          } else if (
            result.exported === 0 &&
            (result.skipped > 0 || result.empty > 0)
          ) {
            setError(
              result.empty > 0
                ? t("predict.analysis.toolbar.exportEmpty")
                : t("predict.analysis.toolbar.exportNothing"),
            );
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          setExportingResults(false);
        });
    },
    [
      exportingResults,
      modelId,
      modelLabelName,
      notifySaved,
      orcaiParameter,
      predictChannel,
      queue,
      t,
    ],
  );

  // Badge shows detections only once labels are loaded (avoid file-count jump).
  const resultsTabBadgeCount =
    resultsDetectionCount != null && resultsDetectionCount > 0
      ? resultsDetectionCount
      : null;
  const projectDisplayName =
    queue?.projectName ?? workspace.projectName ?? null;

  useEffect(() => {
    const modelId = draftSettings.model;
    setShellMetaFramesBridge({
      projectNameOverride: projectDisplayName,
      // Keep header model frame in sync with Parameters (draft), not only
      // persisted workspace — default builtin may never have been saved yet.
      modelIdOverride: modelId?.trim() || null,
      modelSettingsOpen,
      onToggleModelSettings:
        activeTab !== "run" && modelId
          ? () => setModelSettingsOpen((open) => !open)
          : null,
    });
    return () => clearShellMetaFramesBridge();
  }, [
    activeTab,
    draftSettings.model,
    modelSettingsOpen,
    projectDisplayName,
  ]);

  // Persist default/draft model once so shell + other pages see it without re-pick.
  useEffect(() => {
    const model = draftSettings.model?.trim();
    if (!model) return;
    const stored = loadPredictSettings();
    if (stored.model === model && (stored.modelDir ?? undefined) === (draftSettings.modelDir ?? undefined)) {
      // Ensure workspace actually holds predictSettings (not just DEFAULT fallback).
      const ws = loadWorkspace();
      if (ws.predictSettings != null) return;
    }
    savePredictSettings({
      model,
      modelDir: draftSettings.modelDir,
    });
  }, [draftSettings.model, draftSettings.modelDir]);

  useEffect(() => {
    const nextId = workspace.activeProjectId ?? null;
    if (seenProjectIdRef.current === undefined) {
      seenProjectIdRef.current = nextId;
      return;
    }
    if (seenProjectIdRef.current === nextId) return;
    seenProjectIdRef.current = nextId;
    const visible = profilesForProject(profilesRef.current, nextId);
    const selected = activeProfileIdRef.current
      ? getModelProfile(profilesRef.current, activeProfileIdRef.current)
      : undefined;
    if (selected && visible.some((profile) => profile.id === selected.id)) {
      const next = profileSettingsToPredictSettings(
        selected.settings,
        draftSettingsRef.current,
      );
      presetModelGuardRef.current = true;
      draftSettingsRef.current = next;
      setDraftSettings(next);
      savePredictSettings(next);
      if (nextId) {
        void persistActiveProjectPredictModel(next.model, next.modelDir ?? null);
      }
      return;
    }
    presetModelGuardRef.current = false;
    const stored = loadPredictSettings();
    const next: PredictSettings = {
      ...draftSettingsRef.current,
      model: stored.model,
      modelDir: stored.modelDir?.trim() || undefined,
    };
    draftSettingsRef.current = next;
    setDraftSettings(next);
  }, [workspace.activeProjectId]);

  useEffect(() => {
    const syncModelFromWorkspace = () => {
      const stored = loadPredictSettings();
      const draft = draftSettingsRef.current;
      const selected = activeProfileIdRef.current
        ? getModelProfile(profilesRef.current, activeProfileIdRef.current)
        : undefined;
      const presetStillVisible =
        selected != null &&
        profilesForProject(
          profilesRef.current,
          loadWorkspace().activeProjectId,
        ).some((profile) => profile.id === selected.id);
      if (
        presetModelGuardRef.current &&
        selected &&
        presetStillVisible &&
        samePresetModel(draft, selected.settings)
      ) {
        const presetDir = selected.settings.modelDir?.trim() || undefined;
        const storedDir = stored.modelDir?.trim() || undefined;
        if (stored.model !== selected.settings.model || storedDir !== presetDir) {
          void persistActiveProjectPredictModel(
            selected.settings.model,
            presetDir ?? null,
          );
        }
        return;
      }
      setDraftSettings((prev) => {
        const prevDir = prev.modelDir ?? undefined;
        const nextDir = stored.modelDir ?? undefined;
        if (prev.model === stored.model && prevDir === nextDir) return prev;
        const next = { ...prev, model: stored.model, modelDir: stored.modelDir };
        draftSettingsRef.current = next;
        return next;
      });
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncModelFromWorkspace);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncModelFromWorkspace);
    };
  }, []);

  useEffect(() => {
    setActiveTabState((tab) => {
      const next = resolvePredictActiveTab(tab, {
        queueReady,
        resultsEnabled,
        filterEnabled: filterTabEnabled,
        queueLoading,
      });
      if (next !== tab) savePredictActiveTab(next);
      return next;
    });
  }, [queueReady, resultsEnabled, filterTabEnabled, queueLoading]);

  const onToggleBatchSelect = (name: string) => {
    const q = queueRef.current;
    if (!q) return;
    const selected = new Set(batchSelectedNames(q));
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    syncQueue(setQueueSelection(q, selected));
  };

  const tabs: {
    id: PredictTabId;
    label: string;
    badge?: string;
    badgeTitle?: string;
    disabled?: boolean;
    disabledTitle?: string;
  }[] = [
    {
      id: "run",
      label: t("predict.tabs.run"),
    },
    {
      id: "results",
      label: t("predict.tabs.results"),
      badge:
        resultsEnabled && resultsTabBadgeCount != null
          ? String(resultsTabBadgeCount)
          : undefined,
      badgeTitle:
        resultsEnabled && resultsTabBadgeCount != null
          ? t("predict.tabs.resultsBadgeDetections", {
              count: resultsTabBadgeCount,
            })
          : undefined,
      disabled: !resultsEnabled,
      disabledTitle: !orcaiReady
        ? t("predict.tabs.resultsNeedEngine")
        : t("predict.tabs.resultsDisabled"),
    },
    {
      id: "filter",
      label: t("predict.tabs.filter"),
      disabled: !filterTabEnabled,
      disabledTitle: !orcaiReady
        ? t("predict.tabs.filterDisabled")
        : t("predict.tabs.filterNeedsLabels"),
    },
  ];

  const savePreset = () => {
    if (
      activeProfileId &&
      projectProfiles.some((p) => p.id === activeProfileId)
    ) {
      const current = getModelProfile(profiles, activeProfileId);
      if (!current) {
        setSaveAsOpen(true);
        return;
      }
      const nextProfiles = upsertModelProfile(
        profiles,
        profileWithSavedSettings(
          current,
          settingsFromPredictSettings(draftSettings),
        ),
      );
      profilesRef.current = nextProfiles;
      setProfiles(nextProfiles);
      persistModelProfiles(nextProfiles, activeProfileId);
      return;
    }
    setSaveAsOpen(true);
  };

  const onSelectPreset = (id: string) => {
    const profile = getModelProfile(profiles, id);
    if (!profile) return;
    const prev = draftSettingsRef.current;
    const next = profileSettingsToPredictSettings(profile.settings, prev);
    activeProfileIdRef.current = id;
    profilesRef.current = profiles;
    draftSettingsRef.current = next;
    presetModelGuardRef.current = true;
    setActiveProfileId(id);
    persistModelProfiles(profiles, id);
    applyDraftChange(next, prev);
  };

  return (
    <div className="predict-studio">
      <div className="studio-panel predict-work-panel">
        <div className="predict-page-header">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.predict.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {t("pages.predict.analysisGuide")}
            </p>
          </div>
          <div className="predict-page-header-actions">
            <span className="predict-page-crumb" aria-hidden={false}>
              {t("pages.predict.title")}
              <span className="predict-page-crumb-sep"> / </span>
              {activeTab === "run"
                ? t("predict.tabs.run")
                : activeTab === "results"
                  ? t("predict.tabs.results")
                  : t("predict.tabs.filter")}
            </span>
            <PageHelpButton
              topic={
                activeTab === "results"
                  ? "scope.studio"
                  : activeTab === "filter"
                    ? "scope.filter"
                    : "scope.params"
              }
              hint={
                activeTab === "results"
                  ? t("help.hint.predictResults")
                  : activeTab === "filter"
                    ? t("help.hint.predictFilter")
                    : t("help.hint.predictParams")
              }
            />
          </div>
        </div>

        <div className="predict-panel-body">
          <PredictResultsModelSettingsModal
            open={modelSettingsOpen}
            settings={draftSettings}
            models={models}
            onClose={() => setModelSettingsOpen(false)}
          />

          <PredictResultsExportAudacityDialog
            open={exportAudacityOpen}
            files={resultsExportableFiles}
            activeFileName={active?.name ?? null}
            busy={exportingResults}
            onCancel={() => setExportAudacityOpen(false)}
            onConfirm={runAudacityExport}
          />

          {!online && (
            <p className="pp-warn" role="status">
              {t("predict.importSidecarRequired")}
            </p>
          )}

          {!orcaiReady && online && (
            <p className="pp-warn" role="status">
              {t("predict.engineRequiredForPredict")}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="predict-tabs-toolbar">
            <PredictTabs
              active={activeTab}
              onChange={setActiveTab}
              tabs={tabs}
              disabled={queueLoading && !queue}
              ariaLabel={t("predict.tabs.ariaLabel")}
              className="predict-tabs-m03"
            />
            {activeTab === "run" ? (
              <PredictProjectPresetsBar
                toolbar
                profiles={projectProfiles}
                activeProfileId={activeProfileId}
                dirty={presetDirty}
                disabled={batchRunning}
                onSelect={onSelectPreset}
                onSave={savePreset}
                onSaveAs={() => setSaveAsOpen(true)}
              />
            ) : null}
            {activeTab === "results" || activeTab === "filter" ? (
              <div className="predict-results-page-actions">
                {activeTab === "results" ? (
                  <button
                    type="button"
                    className="predict-results-page-btn predict-results-page-btn--filled"
                    title={t("predict.results.exportHint")}
                    disabled={
                      !queueReady ||
                      !queue ||
                      !orcaiReady ||
                      !online ||
                      batchRunning ||
                      exportingResults ||
                      resultsDoneFileCount === 0
                    }
                    onClick={() => setExportAudacityOpen(true)}
                  >
                    <span className="predict-results-page-btn__icon" aria-hidden>
                      <IconExport />
                    </span>
                    {exportingResults
                      ? t("common.loading")
                      : t("predict.results.export")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="predict-results-page-btn predict-results-page-btn--filled"
                  title={t("predict.results.toTableHint")}
                  disabled={
                    !queueReady ||
                    !orcaiReady ||
                    !online ||
                    resultsDoneFileCount === 0
                  }
                  onClick={() => navigate("/results")}
                >
                  <span className="predict-results-page-btn__icon" aria-hidden>
                    <NavIcon id="results" />
                  </span>
                  {t("predict.results.toTable")}
                </button>
              </div>
            ) : null}
          </div>

          <PredictTabPanel id="run" active={activeTab}>
            <PredictParamsRunStudio
              queue={queueReady ? queue : null}
              queueUnavailable={queueUnavailable}
              queueLoading={queueLoading}
              orcaiReady={orcaiReady}
              batchRunning={batchRunning}
              models={models}
              settings={draftSettings}
              onSettingsChange={handleSettingsChange}
              viewFilter={queueViewFilter}
              onFilterChange={setQueueViewFilter}
              commandLine={cliPreviewLine}
              channelCollision={channelCollision}
              sharedOutputWarn={sharedOutputMultiFile}
              runnableCount={queueReady ? runnableCount : 0}
              tableBlocked={predictTableBlocked}
              batchProgress={batchProgress}
              canManageFiles={
                online && queueReady && Boolean(activeProject?.initialized)
              }
              busy={queueBusy}
              runningFileName={running?.name ?? null}
              activeFileName={queue?.activeFileName ?? null}
              onSelectActive={onSelectActive}
              onToggleBatchSelect={onToggleBatchSelect}
              onAddWavs={() => void onAddWavs()}
              onRunBatch={() => void runBatchRecognition()}
              onBatchCancel={onBatchCancel}
              recordingTableRows={recordingTableRows}
            />
          </PredictTabPanel>

          <PredictTabPanel id="results" active={activeTab}>
            {queueReady && queue ? (
              <PredictResultsTabPanel
                queue={queue}
                batchRunning={batchRunning}
                runSummary={runSummary}
                active={active}
                channel={activeChannel}
                modelId={modelId}
                modelLabelName={modelLabelName}
                modelClasses={modelClasses}
                resolvedLabelPath={resultsSpectrogramResolvedLabel}
                predictThreshold={draftSettings.threshold}
                labelSource={analysisLabelSource}
                onDismissRunBanner={() => setRunSummary(null)}
                onSelectActive={onSelectActive}
                onLabelOverride={setSpectrogramLabelOverride}
                onQueueChange={setQueue}
                onDetectionTotalChange={onResultsDetectionTotalChange}
                focusNav={
                  analysisFocus &&
                  (!navState.wavPath || navState.wavPath === active?.path)
                    ? analysisFocus
                    : null
                }
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                {t("predict.tabs.needQueue")}
              </p>
            )}
          </PredictTabPanel>

          <PredictTabPanel id="filter" active={activeTab}>
            {queueReady && queue ? (
              <PredictFilterTabPanel
                sources={filterSources}
                activePredictedPath={filterSourcePath}
                onSelectPredictedPath={onSelectPredictedPath}
                limitsPath={filterLimitsPath}
                labelSuffix={draftSettings.labelSuffix.trim()}
                filterSettings={filterSettings}
                filterSubmitting={filterSubmitting}
                orcaiReady={orcaiReady}
                batchRunning={batchRunning}
                channel={filterTrackChannel}
                onFilterSettingsChange={(next) => {
                  setFilterSettings(next);
                  saveFilterSettings(next);
                }}
                onApply={onRunFilter}
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                {t("predict.tabs.needQueue")}
              </p>
            )}
          </PredictTabPanel>

          <PredictProfileSaveAsDialog
            open={saveAsOpen}
            initialName={
              workspace.projectName ? `${workspace.projectName}` : "Preset"
            }
            onCancel={() => setSaveAsOpen(false)}
            onConfirm={(name) => {
              const { profiles: next, profile } = createModelProfile(
                profiles,
                name,
                settingsFromPredictSettings(draftSettings),
                "",
                workspace.activeProjectId,
              );
              setProfiles(next);
              setActiveProfileId(profile.id);
              persistModelProfiles(next, profile.id);
              setSaveAsOpen(false);
            }}
          />
          {overwriteDialog}
        </div>
      </div>
    </div>
  );
}

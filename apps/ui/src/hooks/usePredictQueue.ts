import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import {
  fetchProject,
  fetchProjectRecordingTable,
  fetchProjectRecordings,
  type ImportedRecordingRow,
  type ProjectRecord,
} from "../api/projects";
import { useTrackJobInLab } from "./useTrackJobInLab";
import { useSidecarStatus } from "./useSidecarStatus";
import {
  formatPartialImportError,
  recordingsMatchingImport,
  runProjectAudioImportJob,
} from "../lib/importProjectAudio";
import { recordingTableSyncModeAfterAdd } from "../lib/recordingTableSync";
import { runProjectRecordingTableSync } from "../lib/runProjectRecordingTableSync";
import {
  filterWavImportPaths,
  formatWavOnlyImportError,
} from "../lib/wizardImportFiles";
import { pickAudioFiles } from "../platform/dialog";
import type { RecordingPickKind } from "../platform/dialog";
import { useWorkspace } from "./useWorkspace";
import { saveWorkspace } from "../workspace/storage";
import { applyActiveProject } from "../workspace/project";
import { canModifyProjectRecordings } from "../lib/projectRecordings";
import { resolveQueueUnavailable } from "../lib/predictQueueUi";
import {
  activateQueueByWavPath,
  activePredictFile,
  adoptPendingPredictQueue,
  appendImportedToQueue,
  appendRecordingsToQueue,
  applyPredictHintsToQueue,
  loadPredictQueue,
  persistPredictQueue,
  preserveExplicitPredictSelection,
  queueFromNavigation,
  syncQueueWithProjectRecordings,
  type PredictQueue,
} from "../workspace/predictQueue";

export type { PredictQueueUnavailableReason } from "../lib/predictQueueUi";

export type PredictQueueLocationState = {
  wavPath?: string;
  labelPath?: string;
  compareLabelPath?: string;
  recordingPath?: string;
  recordingKind?: RecordingPickKind;
};

async function withPredictHintsFromProject(
  projectId: string,
  queue: PredictQueue,
): Promise<PredictQueue> {
  try {
    const table = await fetchProjectRecordingTable(projectId);
    return applyPredictHintsToQueue(
      queue,
      table.rows.map((row) => ({
        recording: row.recording,
        predict_status: row.predict_status,
        predicted_path: row.predicted_path,
      })),
    );
  } catch {
    return queue;
  }
}

export function usePredictQueue() {
  const { t } = useTranslation();
  const { online: sidecarOnline, engineReady } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const location = useLocation();
  const navAppliedKeyRef = useRef<string | null>(null);
  const importingWavsRef = useRef(false);

  const [queue, setQueue] = useState<PredictQueue | null>(null);
  const queueRef = useRef<PredictQueue | null>(null);
  queueRef.current = queue;
  const [queueLoading, setQueueLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [projectLoadFailed, setProjectLoadFailed] = useState(false);
  const [importingWavs, setImportingWavs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingPredictTableSyncRef = useRef<Set<string>>(new Set());
  const [pendingPredictTableSyncTick, setPendingPredictTableSyncTick] =
    useState(0);

  const workspace = useWorkspace();
  const activeProjectIdRef = useRef(workspace.activeProjectId);
  activeProjectIdRef.current = workspace.activeProjectId;
  const active = activePredictFile(queue);
  const hasActiveProject = Boolean(workspace.activeProjectId);

  const syncQueue = useCallback((next: PredictQueue | null) => {
    persistPredictQueue(next);
    setQueue(next);
  }, []);

  const applyImportedToQueue = useCallback(
    async (
      projectId: string,
      imported: ImportedRecordingRow[],
      currentQueue: PredictQueue | null,
    ) => {
      if (!imported.length) return;
      const project = await fetchProject(projectId);
      const recs = await fetchProjectRecordings(projectId);
      const matched = recordingsMatchingImport(recs, imported);
      if (!matched.length) {
        setError(t("predict.importMatchFailed"));
        return;
      }

      const stored = loadPredictQueue(projectId);
      let prev: PredictQueue | null =
        stored && stored.projectId === project.id ? stored : null;
      if (!prev && currentQueue?.projectId === project.id) {
        prev = currentQueue;
      }
      prev = adoptPendingPredictQueue(project, prev);

      const next = appendImportedToQueue(project, prev, matched);
      syncQueue(next);
    },
    [syncQueue, t],
  );

  const refreshQueueFromServer = useCallback(async () => {
    const projectId = workspace.activeProjectId;
    if (!projectId) return;
    try {
      const project = await fetchProject(projectId);
      const recs = await fetchProjectRecordings(projectId);
      const prev = queueRef.current ?? loadPredictQueue(projectId);
      const prevPaths = new Set(
        (prev?.projectId === project.id ? prev.files : [])
          .filter((f) => f.kind === "wav")
          .map((f) => f.path),
      );
      const newOnServer = recs.filter((r) => !prevPaths.has(r.path));
      let next = syncQueueWithProjectRecordings(project, recs, prev);
      if (prev && newOnServer.length) {
        next = appendRecordingsToQueue(next, newOnServer);
      }
      next = await withPredictHintsFromProject(projectId, next);
      if (activeProjectIdRef.current !== projectId) return;
      next = preserveExplicitPredictSelection(next, queueRef.current);
      syncQueue(next);
    } catch {
      /* ignore transient fetch errors on focus */
    }
  }, [workspace.activeProjectId, syncQueue]);

  useEffect(() => {
    if (!engineReady || pendingPredictTableSyncRef.current.size === 0) return;
    const projectId = workspace.activeProjectId;
    if (!projectId || !pendingPredictTableSyncRef.current.has(projectId)) {
      return;
    }
    pendingPredictTableSyncRef.current.delete(projectId);
    void (async () => {
      try {
        const project = await fetchProject(projectId);
        if (!(project.auto_sync_recording_table ?? true)) {
          return;
        }
        await runProjectRecordingTableSync(
          projectId,
          recordingTableSyncModeAfterAdd(project),
          { onJobCreated: trackJobInLab, t },
        );
        await refreshQueueFromServer();
        setError((prev) =>
          prev?.includes(t("projects.tableSyncPending")) ? null : prev,
        );
      } catch (syncErr) {
        setError(syncErr instanceof Error ? syncErr.message : String(syncErr));
      }
    })();
  }, [
    pendingPredictTableSyncTick,
    engineReady,
    t,
    trackJobInLab,
    refreshQueueFromServer,
    workspace.activeProjectId,
  ]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshQueueFromServer();
      }
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshQueueFromServer]);

  useEffect(() => {
    const st = (location.state ?? {}) as PredictQueueLocationState;
    const key = `${workspace.activeProjectId ?? ""}:${JSON.stringify(st)}`;
    if (navAppliedKeyRef.current === key) return;
    navAppliedKeyRef.current = key;

    const merged = queueFromNavigation(st, {
      activeProjectId: workspace.activeProjectId,
      projectDir: workspace.projectDir,
      projectName: workspace.projectName,
    });
    if (!merged) return;

    let next = merged;
    if (st.wavPath) {
      next = activateQueueByWavPath(next, st.wavPath, st.labelPath);
    }
    syncQueue(next);
    const wav =
      st.wavPath ??
      (st.recordingPath && !st.recordingPath.toLowerCase().endsWith(".csv")
        ? st.recordingPath
        : undefined);
    if (wav) {
      saveWorkspace({
        lastWavPath: wav,
        ...(st.labelPath ? { lastLabelPath: st.labelPath } : {}),
      });
    }
  }, [
    location.state,
    syncQueue,
    workspace.activeProjectId,
    workspace.projectDir,
    workspace.projectName,
  ]);

  useEffect(() => {
    const projectId = workspace.activeProjectId;
    if (!projectId) {
      setQueue(null);
      setActiveProject(null);
      setProjectLoadFailed(false);
      setQueueLoading(false);
      return;
    }

    let cancelled = false;
    setQueueLoading(true);
    setActiveProject(null);
    setProjectLoadFailed(false);
    const prevLoaded = loadPredictQueue(projectId) ?? queueRef.current;
    if (prevLoaded?.projectId === projectId) {
      setQueue(prevLoaded);
    } else {
      setQueue(null);
    }
    void fetchProject(projectId)
      .then(async (project) => {
        const recs = await fetchProjectRecordings(projectId);
        if (cancelled) return;
        setActiveProject(project);
        setProjectLoadFailed(false);
        let prev = queueRef.current ?? loadPredictQueue(projectId);
        prev = adoptPendingPredictQueue(project, prev);
        let next = syncQueueWithProjectRecordings(project, recs, prev);
        const st = (location.state ?? {}) as PredictQueueLocationState;
        if (st.wavPath) {
          next = activateQueueByWavPath(next, st.wavPath, st.labelPath);
        }
        next = await withPredictHintsFromProject(projectId, next);
        if (cancelled) return;
        next = preserveExplicitPredictSelection(next, queueRef.current);
        syncQueue(next);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveProject(null);
        setProjectLoadFailed(true);
        const stored = loadPredictQueue(projectId);
        if (stored?.projectId === projectId) {
          setQueue(stored);
        }
      })
      .finally(() => {
        if (!cancelled) setQueueLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace.activeProjectId, syncQueue, location.state]);

  const onSelectActive = useCallback(
    (name: string) => {
      if (!queueRef.current) return;
      syncQueue({ ...queueRef.current, activeFileName: name });
    },
    [syncQueue],
  );

  const onAddWavs = useCallback(async () => {
    const projectId = workspace.activeProjectId;
    if (!projectId || !sidecarOnline || importingWavsRef.current) return;
    if (!canModifyProjectRecordings(activeProject)) {
      setError(t("projects.recordingsRequireInit"));
      return;
    }
    const picked = await pickAudioFiles(t("predict.queueAddAudioPickTitle"));
    if (!picked.length) return;
    const { wavPaths, rejected } = filterWavImportPaths(picked);
    const formatError = formatWavOnlyImportError(t, rejected);
    if (formatError && !wavPaths.length) {
      setError(formatError);
      return;
    }
    importingWavsRef.current = true;
    setImportingWavs(true);
    setError(formatError ?? null);
    try {
      const result = await runProjectAudioImportJob(projectId, wavPaths, {
        onJobCreated: trackJobInLab,
        t,
      });
      let project = await fetchProject(projectId);
      if (engineReady && (project.auto_sync_recording_table ?? true)) {
        try {
          await runProjectRecordingTableSync(
            projectId,
            recordingTableSyncModeAfterAdd(project),
            { onJobCreated: trackJobInLab, t },
          );
          project = await fetchProject(projectId);
        } catch (syncErr) {
          setError(
            syncErr instanceof Error ? syncErr.message : String(syncErr),
          );
        }
      } else if (!engineReady && (project.auto_sync_recording_table ?? true)) {
        pendingPredictTableSyncRef.current.add(projectId);
        setPendingPredictTableSyncTick((n) => n + 1);
        setError((prev) =>
          prev
            ? `${prev}\n${t("projects.tableSyncPending")}`
            : t("projects.tableSyncPending"),
        );
      }
      setActiveProject(project);
      applyActiveProject(project);
      await applyImportedToQueue(
        projectId,
        result.imported,
        queueRef.current,
      );
      if (result.failed?.length) {
        const partial = formatPartialImportError(result.failed, t);
        setError((prev) => {
          const base = prev?.trim() ?? "";
          return base ? `${base}\n${partial}` : partial;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      importingWavsRef.current = false;
      setImportingWavs(false);
    }
  }, [
    workspace.activeProjectId,
    activeProject,
    sidecarOnline,
    engineReady,
    importingWavs,
    trackJobInLab,
    applyImportedToQueue,
    t,
  ]);

  const onRemoveActive = useCallback(() => {
    if (!queue?.activeFileName) return;
    const name = queue.activeFileName;
    const files = queue.files.filter((f) => f.name !== name);
    const selectedNames = queue.selectedNames.filter((n) =>
      files.some((f) => f.name === n),
    );
    syncQueue({
      ...queue,
      files,
      selectedNames,
      activeFileName: files[0]?.name ?? null,
    });
  }, [queue, syncQueue]);

  const queueUnavailable = resolveQueueUnavailable({
    hasActiveProject,
    queueLoading,
    projectLoadFailed,
    projectInitialized: activeProject?.initialized,
  });

  return {
    queue,
    setQueue,
    syncQueue,
    queueLoading,
    activeProject,
    projectLoadFailed,
    queueUnavailable,
    importingWavs,
    error,
    setError,
    workspace,
    active,
    hasActiveProject,
    sidecarOnline,
    onSelectActive,
    onAddWavs,
    onRemoveActive,
    refreshQueueFromServer,
  };
}

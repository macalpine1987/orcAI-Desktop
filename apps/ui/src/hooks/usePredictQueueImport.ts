import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import type { JobRecord } from "../api/jobs";
import {
  fetchProject,
  fetchProjectRecordings,
  type ImportedRecordingRow,
  type ProjectRecord,
} from "../api/projects";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
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
import { useSaveNotice } from "../ui/saveNotice";
import { applyActiveProject } from "../workspace/project";
import { canModifyProjectRecordings } from "../lib/projectRecordings";
import {
  adoptPendingPredictQueue,
  appendImportedToQueue,
  loadPredictQueue,
  type PredictQueue,
} from "../workspace/predictQueue";

type Args = {
  workspaceActiveProjectId: string | null;
  activeProject: ProjectRecord | null;
  setActiveProject: Dispatch<SetStateAction<ProjectRecord | null>>;
  sidecarOnline: boolean;
  engineReady: boolean;
  queueRef: MutableRefObject<PredictQueue | null>;
  syncQueue: (next: PredictQueue | null) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  trackJobInLab: (job: JobRecord) => void;
  refreshQueueFromServer: () => Promise<void>;
};

/** WAV pick → import job → optional recording_table sync → queue append. */
export function usePredictQueueImport({
  workspaceActiveProjectId,
  activeProject,
  setActiveProject,
  sidecarOnline,
  engineReady,
  queueRef,
  syncQueue,
  setError,
  trackJobInLab,
  refreshQueueFromServer,
}: Args) {
  const { t } = useTranslation();
  const { notifyHeaderError } = useSaveNotice();
  const importingWavsRef = useRef(false);
  const [importingWavs, setImportingWavs] = useState(false);
  const pendingPredictTableSyncRef = useRef<Set<string>>(new Set());
  const [pendingPredictTableSyncTick, setPendingPredictTableSyncTick] =
    useState(0);

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
    [syncQueue, setError, t],
  );

  useEffect(() => {
    if (!engineReady || pendingPredictTableSyncRef.current.size === 0) return;
    const projectId = workspaceActiveProjectId;
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
        setError(formatUserFacingErrorRequired(syncErr, t));
      }
    })();
  }, [
    pendingPredictTableSyncTick,
    engineReady,
    t,
    trackJobInLab,
    refreshQueueFromServer,
    workspaceActiveProjectId,
    setError,
  ]);

  const onAddWavs = useCallback(async () => {
    const projectId = workspaceActiveProjectId;
    if (!projectId || !sidecarOnline || importingWavsRef.current) return;
    if (!canModifyProjectRecordings(activeProject)) {
      setError(t("projects.recordingsRequireInit"));
      return;
    }
    const picked = await pickAudioFiles(t("predict.queueAddAudioPickTitle"));
    if (!picked.length) return;
    const { wavPaths, rejected } = filterWavImportPaths(picked);
    const formatError = formatWavOnlyImportError(t, rejected);
    if (formatError) notifyHeaderError(formatError);
    if (!wavPaths.length) {
      if (formatError) setError(formatError);
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
          setError(formatUserFacingErrorRequired(syncErr, t));
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
      setError(formatUserFacingErrorRequired(err, t));
    } finally {
      importingWavsRef.current = false;
      setImportingWavs(false);
    }
  }, [
    workspaceActiveProjectId,
    activeProject,
    sidecarOnline,
    engineReady,
    trackJobInLab,
    applyImportedToQueue,
    t,
    notifyHeaderError,
    queueRef,
    setActiveProject,
    setError,
  ]);

  return { importingWavs, onAddWavs };
}

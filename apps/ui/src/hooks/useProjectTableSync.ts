import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import type { JobRecord } from "../api/jobs";
import {
  fetchProject,
  type ProjectRecord,
  type ProjectRecordingTable,
  type ProjectSummary,
} from "../api/projects";
import type { RefreshTableConfirm } from "../components/projects/ProjectDialogs";
import {
  callsMissingFromClassColumns,
  recordingTableSyncModeAfterAdd,
  type RecordingTableSyncMode,
} from "../lib/recordingTableSync";
import {
  isRecordingTableBlockingPredict,
  shouldHighlightRefreshTable,
} from "../lib/recordingTableGate";
import { runProjectRecordingTableSync } from "../lib/runProjectRecordingTableSync";
import { applyActiveProject } from "../workspace/project";

type Options = {
  detail: ProjectRecord | null;
  summary: ProjectSummary | null;
  table: ProjectRecordingTable | null;
  engineReady: boolean;
  workspaceActiveProjectId: string | null | undefined;
  trackJobInLab: (job: JobRecord) => void;
  loadDetail: (id: string) => Promise<ProjectRecord>;
  refreshProjectData: (id: string) => Promise<void>;
  setBusy: (busy: boolean) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setRefreshOpen: (open: boolean) => void;
  formatError: (err: unknown) => string;
};

export type ProjectTableSyncAfterChange = {
  project: ProjectRecord;
  mode: RecordingTableSyncMode;
  /** When false, skip auto-sync path entirely. Default true. */
  wantSync?: boolean;
  /** Refresh callback when sync is deferred/skipped. Default refreshProjectData. */
  onDeferRefresh?: (project: ProjectRecord) => Promise<void>;
  /** Queue pending sync when engine is down. Default true when wantSync. */
  queuePending?: boolean;
  /** Set stale notice when engine is down. Default false. */
  markStaleNotice?: boolean;
  /** Apply active project after defer path. Default false (runTableSync applies). */
  applyActiveOnDefer?: boolean;
};

/**
 * Recording-table sync/refresh for Projects studio: derived stale/block flags,
 * pending auto-sync when the engine is offline, confirm-refresh, and the
 * shared post-mutation sync-or-defer helper.
 */
export function useProjectTableSync({
  detail,
  summary,
  table,
  engineReady,
  workspaceActiveProjectId,
  trackJobInLab,
  loadDetail,
  refreshProjectData,
  setBusy,
  setError,
  setRefreshOpen,
  formatError,
}: Options) {
  const { t } = useTranslation();
  const pendingTableSyncRef = useRef<Set<string>>(new Set());
  const [pendingTableSyncTick, setPendingTableSyncTick] = useState(0);

  const wavCount = table
    ? table.rows.filter((r) => r.wav_exists).length
    : detail?.wav_count ?? 0;
  const autoSyncCsv = detail?.auto_sync_recording_table ?? true;
  // Without summary, never assume CSV is current (BUG-P-05).
  const tableSyncStatus =
    summary?.recording_table.sync_status ??
    (detail?.recording_table_path ? "stale" : "missing");
  const callsColumnsMissing = Boolean(
    table?.table_exists &&
      callsMissingFromClassColumns(table.calls, table.class_columns),
  );
  const tableNeedsRefresh = shouldHighlightRefreshTable({
    syncStatus: tableSyncStatus,
    wavCount,
    autoSync: autoSyncCsv,
    callsColumnsMissing,
  });
  const predictBlocked = isRecordingTableBlockingPredict({
    syncStatus: tableSyncStatus,
    wavCount,
    autoSync: autoSyncCsv,
  });

  const runTableSync = useCallback(
    async (id: string, syncMode: RecordingTableSyncMode) => {
      await runProjectRecordingTableSync(id, syncMode, {
        onJobCreated: trackJobInLab,
        t,
      });
      const project = await loadDetail(id);
      if (project.id === workspaceActiveProjectId) applyActiveProject(project);
      await refreshProjectData(id);
    },
    [
      loadDetail,
      refreshProjectData,
      t,
      trackJobInLab,
      workspaceActiveProjectId,
    ],
  );

  useEffect(() => {
    if (!engineReady || pendingTableSyncRef.current.size === 0) return;
    const projectId = detail?.id ?? workspaceActiveProjectId;
    if (!projectId || !pendingTableSyncRef.current.has(projectId)) return;
    pendingTableSyncRef.current.delete(projectId);
    void (async () => {
      try {
        const project = await fetchProject(projectId);
        if (!(project.auto_sync_recording_table ?? true)) return;
        await runTableSync(projectId, recordingTableSyncModeAfterAdd(project));
      } catch {
        pendingTableSyncRef.current.add(projectId);
      }
    })();
  }, [
    engineReady,
    pendingTableSyncTick,
    detail?.id,
    workspaceActiveProjectId,
    runTableSync,
  ]);

  const onConfirmRefresh = useCallback(
    async (choice: RefreshTableConfirm) => {
      if (!detail) return;
      setRefreshOpen(false);
      setBusy(true);
      setError(null);
      try {
        await runProjectRecordingTableSync(detail.id, choice.mode, {
          onJobCreated: trackJobInLab,
          t,
          extras: choice.extras,
        });
        const project = await loadDetail(detail.id);
        if (project.id === workspaceActiveProjectId) applyActiveProject(project);
        await refreshProjectData(detail.id);
      } catch (err) {
        setError(formatError(err));
      } finally {
        setBusy(false);
      }
    },
    [
      detail,
      formatError,
      loadDetail,
      refreshProjectData,
      setBusy,
      setError,
      setRefreshOpen,
      t,
      trackJobInLab,
      workspaceActiveProjectId,
    ],
  );

  const syncAfterChange = useCallback(
    async ({
      project,
      mode,
      wantSync = true,
      onDeferRefresh,
      queuePending = true,
      markStaleNotice = false,
      applyActiveOnDefer = false,
    }: ProjectTableSyncAfterChange) => {
      const shouldAutoSync =
        wantSync && (project.auto_sync_recording_table ?? true);
      if (engineReady && shouldAutoSync) {
        await runTableSync(project.id, mode);
        return;
      }
      if (applyActiveOnDefer && project.id === workspaceActiveProjectId) {
        applyActiveProject(project);
      }
      if (onDeferRefresh) {
        await onDeferRefresh(project);
      } else {
        await refreshProjectData(project.id);
      }
      if (shouldAutoSync && !engineReady) {
        if (queuePending) {
          pendingTableSyncRef.current.add(project.id);
          setPendingTableSyncTick((n) => n + 1);
        }
        if (markStaleNotice) {
          setError((prev) => prev ?? t("projects.studio.table.tableStale"));
        }
      }
    },
    [
      engineReady,
      refreshProjectData,
      runTableSync,
      setError,
      t,
      workspaceActiveProjectId,
    ],
  );

  return {
    autoSyncCsv,
    tableSyncStatus,
    callsColumnsMissing,
    tableNeedsRefresh,
    predictBlocked,
    wavCount,
    runTableSync,
    onConfirmRefresh,
    syncAfterChange,
  };
}

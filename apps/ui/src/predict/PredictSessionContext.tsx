import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router-dom";
import {
  fetchProject,
  fetchProjectRecordingTable,
  fetchProjectRecordings,
  type ProjectRecord,
} from "../api/projects";
import {
  rememberedQueueForProject,
  resolveQueueUnavailable,
  type PredictQueueUnavailableReason,
} from "../lib/predictQueueUi";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  WORKSPACE_CHANGED_EVENT,
  saveWorkspace,
} from "../workspace/storage";
import {
  activateQueueByWavPath,
  adoptPendingPredictQueue,
  appendRecordingsToQueue,
  applyPredictHintsToQueue,
  loadPredictQueue,
  persistPredictQueue,
  preserveExplicitPredictSelection,
  queueFromNavigation,
  syncQueueWithProjectRecordings,
  type PredictQueue,
} from "../workspace/predictQueue";
import type { RecordingPickKind } from "../platform/dialog";
import { isPredictPath } from "../layout/labKeepAlivePaths";

export type PredictQueueLocationState = {
  wavPath?: string;
  labelPath?: string;
  compareLabelPath?: string;
  recordingPath?: string;
  recordingKind?: RecordingPickKind;
};

/** Dedupe key for Results→Analysis wav handoff (projectId + location.state). */
export function predictSessionNavHandoffKey(
  projectId: string | null | undefined,
  state: unknown,
): string {
  return `${projectId ?? ""}:${JSON.stringify(state ?? {})}`;
}

export type HydrateFromProjectArgs = {
  project: ProjectRecord;
  /** When omitted, only the ProjectRecord gate is updated (queue unchanged). */
  queue?: PredictQueue | null;
};

type PredictSessionContextValue = {
  queue: PredictQueue | null;
  setQueue: Dispatch<SetStateAction<PredictQueue | null>>;
  syncQueue: (next: PredictQueue | null) => void;
  queueLoading: boolean;
  activeProject: ProjectRecord | null;
  setActiveProject: Dispatch<SetStateAction<ProjectRecord | null>>;
  projectLoadFailed: boolean;
  queueUnavailable: PredictQueueUnavailableReason | null;
  hydrateFromProject: (args: HydrateFromProjectArgs) => void;
  refreshQueueFromServer: () => Promise<void>;
  queueRef: MutableRefObject<PredictQueue | null>;
};

const PredictSessionContext = createContext<PredictSessionContextValue | null>(
  null,
);

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

function queueSnapshotKey(queue: PredictQueue | null): string {
  if (!queue) return "";
  return `${queue.projectId}\0${queue.files.length}\0${queue.activeFileName ?? ""}\0${queue.selectedNames.join(",")}\0${queue.files
    .map((f) => `${f.name}:${f.status}:${f.labelPath ?? ""}`)
    .join("|")}`;
}

/**
 * Single React source of truth for the Predict queue (keep-alive safe).
 * Projects call hydrateFromProject; storage stays the persistence layer.
 */
export function PredictSessionProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const { engineReady } = useSidecarStatus();
  const location = useLocation();
  const locationStateRef = useRef(location.state);
  locationStateRef.current = location.state;

  const [queue, setQueueState] = useState<PredictQueue | null>(() =>
    workspace.activeProjectId
      ? loadPredictQueue(workspace.activeProjectId)
      : null,
  );
  const queueRef = useRef<PredictQueue | null>(null);
  queueRef.current = queue;

  const [queueLoading, setQueueLoading] = useState(
    () =>
      !workspace.activeProjectId ||
      loadPredictQueue(workspace.activeProjectId) == null,
  );
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [projectLoadFailed, setProjectLoadFailed] = useState(false);

  const activeProjectIdRef = useRef(workspace.activeProjectId);
  activeProjectIdRef.current = workspace.activeProjectId;
  const skipWorkspaceQueueEventRef = useRef(false);
  const navAppliedKeyRef = useRef<string | null>(null);
  const onPredictRoute = isPredictPath(location.pathname);

  const syncQueue = useCallback((next: PredictQueue | null) => {
    skipWorkspaceQueueEventRef.current = true;
    persistPredictQueue(next);
    setQueueState(next);
  }, []);

  const setQueue = useCallback(
    (next: SetStateAction<PredictQueue | null>) => {
      const resolved =
        typeof next === "function" ? next(queueRef.current) : next;
      syncQueue(resolved);
    },
    [syncQueue],
  );

  const hydrateFromProject = useCallback(
    ({ project, queue: nextQueue }: HydrateFromProjectArgs) => {
      setActiveProject(project);
      setProjectLoadFailed(false);
      setQueueLoading(false);
      if (nextQueue !== undefined) {
        syncQueue(nextQueue);
      }
    },
    [syncQueue],
  );

  const refreshQueueFromServer = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
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
      setActiveProject(project);
      setProjectLoadFailed(false);
      next = preserveExplicitPredictSelection(next, queueRef.current);
      syncQueue(next);
    } catch {
      /* ignore transient fetch errors on focus */
    }
  }, [syncQueue]);

  // Soft disk refresh only while Predict is the visible route and the engine is up
  // (avoid Home/Projects focus chatter from the app-global session provider).
  useEffect(() => {
    if (!engineReady || !onPredictRoute) return;
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
  }, [refreshQueueFromServer, engineReady, onPredictRoute]);

  // Wav/label handoff from Results→Analysis etc. (not tab-only Projects nav).
  useEffect(() => {
    const st = (location.state ?? {}) as PredictQueueLocationState;
    const key = predictSessionNavHandoffKey(workspace.activeProjectId, st);
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

  // Server load: project change or engine becoming ready (retry after early fail).
  useEffect(() => {
    const projectId = workspace.activeProjectId;
    if (!projectId) {
      setQueueState(null);
      setActiveProject(null);
      setProjectLoadFailed(false);
      setQueueLoading(false);
      return;
    }

    let cancelled = false;
    setActiveProject((prev) => (prev?.id === projectId ? prev : null));
    setProjectLoadFailed(false);
    const prevLoaded =
      rememberedQueueForProject(loadPredictQueue(projectId), projectId) ??
      rememberedQueueForProject(queueRef.current, projectId);
    if (prevLoaded) {
      setQueueState(prevLoaded);
      setQueueLoading(false);
    } else {
      setQueueState(null);
      setQueueLoading(true);
    }

    if (!engineReady) {
      setQueueLoading(false);
      return;
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
        const st = (locationStateRef.current ?? {}) as PredictQueueLocationState;
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
        setProjectLoadFailed(true);
        setActiveProject((prev) => (prev?.id === projectId ? prev : null));
        const stored = loadPredictQueue(projectId);
        if (stored?.projectId === projectId) {
          setQueueState(stored);
        }
      })
      .finally(() => {
        if (!cancelled) setQueueLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace.activeProjectId, engineReady, syncQueue]);

  // Safety net: external persistPredictQueue (or other writers) → React state.
  useEffect(() => {
    const pull = () => {
      if (skipWorkspaceQueueEventRef.current) {
        skipWorkspaceQueueEventRef.current = false;
        return;
      }
      const id = activeProjectIdRef.current;
      const stored = loadPredictQueue(id);
      if (queueSnapshotKey(stored) === queueSnapshotKey(queueRef.current)) {
        return;
      }
      setQueueState(stored);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, pull);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, pull);
  }, []);

  const hasActiveProject = Boolean(workspace.activeProjectId);
  const queueUnavailable = resolveQueueUnavailable({
    hasActiveProject,
    queueLoading,
    projectLoadFailed,
    projectInitialized: activeProject?.initialized,
  });

  const value = useMemo(
    () => ({
      queue,
      setQueue,
      syncQueue,
      queueLoading,
      activeProject,
      setActiveProject,
      projectLoadFailed,
      queueUnavailable,
      hydrateFromProject,
      refreshQueueFromServer,
      queueRef,
    }),
    [
      queue,
      setQueue,
      syncQueue,
      queueLoading,
      activeProject,
      projectLoadFailed,
      queueUnavailable,
      hydrateFromProject,
      refreshQueueFromServer,
    ],
  );

  return (
    <PredictSessionContext.Provider value={value}>
      {children}
    </PredictSessionContext.Provider>
  );
}

export function usePredictSession(): PredictSessionContextValue {
  const ctx = useContext(PredictSessionContext);
  if (!ctx) {
    throw new Error("usePredictSession requires PredictSessionProvider");
  }
  return ctx;
}

export function usePredictSessionOptional(): PredictSessionContextValue | null {
  return useContext(PredictSessionContext);
}

/** Test helper: compare queue identity for WORKSPACE_CHANGED sync. */
export function predictSessionQueueSnapshotKeyForTests(
  queue: PredictQueue | null,
): string {
  return queueSnapshotKey(queue);
}

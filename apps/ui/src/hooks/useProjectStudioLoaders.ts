import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import {
  fetchProject,
  fetchProjectAnnotations,
  fetchProjectArtifacts,
  fetchProjectParameters,
  fetchProjectRecordingTable,
  fetchProjects,
  type ProjectAnnotations,
  type ProjectArtifacts,
  type ProjectParameters,
  type ProjectRecord,
  type ProjectRecordingTable,
} from "../api/projects";
import {
  formatProjectError,
  isProjectNotFoundError,
} from "../lib/projectErrors";
import {
  applyActiveProject,
  clearActiveProjectIf,
  reconcileWorkspaceWithProjects,
} from "../workspace/project";
import { loadWorkspace } from "../workspace/storage";

export type ProjectStudioSnapshot = {
  detail: ProjectRecord | null;
  table: ProjectRecordingTable | null;
  annotations: ProjectAnnotations | null;
  artifacts: ProjectArtifacts | null;
  parameters: ProjectParameters | null;
};

const projectStudioById = new Map<string, ProjectStudioSnapshot>();
/** Soft cap so studio snapshots cannot grow without bound across project switches. */
const PROJECT_STUDIO_CACHE_MAX = 12;

function emptyProjectStudio(): ProjectStudioSnapshot {
  return {
    detail: null,
    table: null,
    annotations: null,
    artifacts: null,
    parameters: null,
  };
}

export function forgetProjectStudio(id: string): void {
  projectStudioById.delete(id);
}

export function getProjectStudioSnapshot(
  id: string,
): ProjectStudioSnapshot | undefined {
  return projectStudioById.get(id);
}

export function rememberProjectStudio(
  id: string,
  patch: Partial<ProjectStudioSnapshot>,
): void {
  const prev = projectStudioById.get(id) ?? emptyProjectStudio();
  // Refresh insertion order (LRU) on touch.
  if (projectStudioById.has(id)) projectStudioById.delete(id);
  projectStudioById.set(id, { ...prev, ...patch });
  while (projectStudioById.size > PROJECT_STUDIO_CACHE_MAX) {
    const oldest = projectStudioById.keys().next().value;
    if (oldest == null || oldest === id) break;
    projectStudioById.delete(oldest);
  }
}

type Options = {
  t: TFunction;
  tab: string;
  selectedIdRef: MutableRefObject<string | null>;
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setDetail: Dispatch<SetStateAction<ProjectRecord | null>>;
  setTable: Dispatch<SetStateAction<ProjectRecordingTable | null>>;
  setTableLoading: Dispatch<SetStateAction<boolean>>;
  setAnnotations: Dispatch<SetStateAction<ProjectAnnotations | null>>;
  setAnnotationsLoading: Dispatch<SetStateAction<boolean>>;
  setArtifacts: Dispatch<SetStateAction<ProjectArtifacts | null>>;
  setArtifactsLoading: Dispatch<SetStateAction<boolean>>;
  setParameters: Dispatch<SetStateAction<ProjectParameters | null>>;
  setParametersLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedRows: Dispatch<SetStateAction<Set<string>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshSummary: () => Promise<unknown> | unknown;
};

export function useProjectStudioLoaders({
  t,
  tab,
  selectedIdRef,
  setProjects,
  setSelectedId,
  setDetail,
  setTable,
  setTableLoading,
  setAnnotations,
  setAnnotationsLoading,
  setArtifacts,
  setArtifactsLoading,
  setParameters,
  setParametersLoading,
  setSelectedRows,
  setError,
  refreshSummary,
}: Options) {
  const refreshList = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
    reconcileWorkspaceWithProjects(list);
    const ws = loadWorkspace();
    // Never auto-activate list[0] when active was cleared (P2-01 / variant A).
    let nextId: string | null = null;
    if (ws.activeProjectId && list.some((p) => p.id === ws.activeProjectId)) {
      nextId = ws.activeProjectId;
    }
    setSelectedId(nextId);
    return list;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const project = await fetchProject(id);
    if (selectedIdRef.current !== id) return project;
    setDetail(project);
    rememberProjectStudio(id, { detail: project });
    if (loadWorkspace().activeProjectId !== project.id) {
      applyActiveProject(project);
    }
    return project;
  }, []);

  /** Folder vanished from disk (sidecar pruned registry) — drop selection quietly. */
  const clearGoneProject = useCallback(
    (id: string) => {
      forgetProjectStudio(id);
      clearActiveProjectIf(id, { notice: true });
      setSelectedId((prev) => (prev === id ? null : prev));
      setDetail((prev) => (prev?.id === id ? null : prev));
      setTable(null);
      setAnnotations(null);
      setArtifacts(null);
      setParameters(null);
      setSelectedRows(new Set());
      setError(null);
      void refreshList().catch((err) => setError(formatProjectError(err, t)));
    },
    [refreshList, t],
  );

  const loadTable = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setTableLoading(true);
    try {
      const data = await fetchProjectRecordingTable(id);
      if (selectedIdRef.current !== id) return;
      setTable(data);
      rememberProjectStudio(id, { table: data });
      setSelectedRows((prev) => {
        const names = new Set(data.rows.map((r) => r.recording));
        return new Set([...prev].filter((n) => names.has(n)));
      });
    } catch (err) {
      if (selectedIdRef.current !== id) return;
      if (!opts?.silent) setError(formatProjectError(err, t));
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setTableLoading(false);
    }
  }, [t]);

  const loadAnnotations = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setAnnotationsLoading(true);
    try {
      const data = await fetchProjectAnnotations(id);
      rememberProjectStudio(id, { annotations: data });
      if (selectedIdRef.current !== id) return;
      setAnnotations(data);
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setAnnotationsLoading(false);
    }
  }, []);

  const loadArtifacts = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setArtifactsLoading(true);
    try {
      const data = await fetchProjectArtifacts(id);
      rememberProjectStudio(id, { artifacts: data });
      if (selectedIdRef.current !== id) return;
      setArtifacts(data);
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setArtifactsLoading(false);
    }
  }, []);

  const loadParameters = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setParametersLoading(true);
    try {
      const data = await fetchProjectParameters(id);
      rememberProjectStudio(id, { parameters: data });
      if (selectedIdRef.current !== id) return;
      setParameters(data);
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setParametersLoading(false);
    }
  }, []);

  /** Re-read everything the page shows from disk (silent; no manual «Проверить»). */
  const refreshProjectData = useCallback(
    async (id: string, opts?: { fresh?: boolean }) => {
      if (opts?.fresh === false) return;
      const silent = { silent: true } as const;
      try {
        await Promise.all([
          loadDetail(id),
          loadTable(id, silent),
          refreshSummary(),
          loadArtifacts(id, silent),
          tab === "annotations" ? loadAnnotations(id, silent) : Promise.resolve(),
          tab === "parameters" ? loadParameters(id, silent) : Promise.resolve(),
        ]);
        await refreshList();
      } catch (err) {
        if (isProjectNotFoundError(err)) {
          clearGoneProject(id);
          return;
        }
        setError(formatProjectError(err, t));
      }
    },
    [
      clearGoneProject,
      t,
      loadAnnotations,
      loadArtifacts,
      loadDetail,
      loadParameters,
      loadTable,
      refreshList,
      refreshSummary,
      tab,
    ],
  );

  return {
    refreshList,
    loadDetail,
    clearGoneProject,
    loadTable,
    loadAnnotations,
    loadArtifacts,
    loadParameters,
    refreshProjectData,
  };
}

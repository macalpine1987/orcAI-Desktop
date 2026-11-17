import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { JobRecord } from "../api/jobs";
import type {
  ProjectAnnotations,
  ProjectArtifacts,
  ProjectFocus,
  ProjectParameters,
  ProjectRecord,
  ProjectRecordingTable,
} from "../api/projects";
import {
  formatProjectError,
  isProjectNotFoundError,
} from "../lib/projectErrors";
import { PROJECT_STUDIO_POLL_MS } from "../lib/pollIntervals";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import type { WizardPhase } from "../components/projects/ProjectCreateWizard";
import type { ProjectsTabId } from "../lib/projectsStudio";
import { applyActiveProject } from "../workspace/project";
import { getProjectStudioSnapshot } from "./useProjectStudioLoaders";

type ProjectsView = "studio" | "wizard";

type Args = {
  t: TFunction;
  detail: ProjectRecord | null;
  summaryFocus: ProjectFocus | undefined;
  workspaceActiveProjectId: string | null;
  visibleTabs: readonly ProjectsTabId[];
  tab: ProjectsTabId;
  setTab: (tab: ProjectsTabId) => void;
  focus: ProjectFocus;
  sidecarOnline: boolean;
  refreshList: () => Promise<unknown>;
  setError: Dispatch<SetStateAction<string | null>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setDetail: Dispatch<SetStateAction<ProjectRecord | null>>;
  setTable: Dispatch<SetStateAction<ProjectRecordingTable | null>>;
  setAnnotations: Dispatch<SetStateAction<ProjectAnnotations | null>>;
  setArtifacts: Dispatch<SetStateAction<ProjectArtifacts | null>>;
  setParameters: Dispatch<SetStateAction<ProjectParameters | null>>;
  loadDetail: (id: string) => Promise<unknown>;
  loadTable: (id: string) => Promise<void>;
  loadArtifacts: (id: string) => Promise<void>;
  clearGoneProject: (id: string) => void;
  view: ProjectsView;
  refreshProjectData: (
    id: string,
    opts?: { fresh?: boolean },
  ) => Promise<void>;
  annotations: ProjectAnnotations | null;
  annotationsLoading: boolean;
  parameters: ProjectParameters | null;
  parametersLoading: boolean;
  loadAnnotations: (id: string) => Promise<void>;
  loadParameters: (id: string) => Promise<void>;
  activeJob: JobRecord | null;
  setActiveJob: Dispatch<SetStateAction<JobRecord | null>>;
  handledJobIdRef: MutableRefObject<string | null>;
  endBusy: () => void;
  setWizardPhase: (phase: WizardPhase) => void;
  setWizardError: Dispatch<SetStateAction<string | null>>;
  setView: (view: ProjectsView) => void;
};

/** Focus sync, tab clamp, list/selection loads, poll, lazy tabs, terminal init job. */
export function useProjectStudioLifecycle(args: Args) {
  const {
    t,
    detail,
    summaryFocus,
    workspaceActiveProjectId,
    visibleTabs,
    tab,
    setTab,
    focus,
    sidecarOnline,
    refreshList,
    setError,
    selectedId,
    setSelectedId,
    setDetail,
    setTable,
    setAnnotations,
    setArtifacts,
    setParameters,
    loadDetail,
    loadTable,
    loadArtifacts,
    clearGoneProject,
    view,
    refreshProjectData,
    annotations,
    annotationsLoading,
    parameters,
    parametersLoading,
    loadAnnotations,
    loadParameters,
    activeJob,
    setActiveJob,
    handledJobIdRef,
    endBusy,
    setWizardPhase,
    setWizardError,
    setView,
  } = args;

  // Keep shell model-frame rule in sync with summary focus (incl. inferred).
  // When summary lags a focus PATCH, do not push the stale summary focus into
  // the workspace — that reverted training↔recognition and blocked nav sections.
  useEffect(() => {
    if (!detail || !summaryFocus) return;
    if (detail.id !== workspaceActiveProjectId) return;
    if (summaryFocus !== detail.focus) return;
    applyActiveProject({ ...detail, focus: summaryFocus });
  }, [detail, summaryFocus, workspaceActiveProjectId]);

  // Clamp off-focus tabs (e.g. annotations under field focus) without depending on
  // array identity of visibleTabs (FIELD_PROJECTS_TABS is stable — BUG-01).
  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab(visibleTabs[0] ?? "recordings");
    }
  }, [focus, tab, visibleTabs, setTab]);

  // Registry on mount / when the sidecar comes online.
  useEffect(() => {
    if (!sidecarOnline) return;
    void refreshList().catch((err) => setError(formatProjectError(err, t)));
  }, [sidecarOnline, refreshList, t, setError]);

  // Selected project changed: show the last snapshot, then reload. Row selection does not return.
  useEffect(() => {
    const snap = selectedId ? getProjectStudioSnapshot(selectedId) : undefined;
    setDetail(snap?.detail ?? null);
    setTable(snap?.table ?? null);
    setAnnotations(snap?.annotations ?? null);
    setArtifacts(snap?.artifacts ?? null);
    setParameters(snap?.parameters ?? null);
    if (!selectedId || !sidecarOnline) return;
    let cancelled = false;
    const guard = <T,>(p: Promise<T>) =>
      p.catch((err) => {
        if (cancelled) return;
        if (isProjectNotFoundError(err)) {
          clearGoneProject(selectedId);
          return;
        }
        setError(formatProjectError(err, t));
      });
    void guard(loadDetail(selectedId));
    void guard(loadTable(selectedId));
    void guard(loadArtifacts(selectedId));
    return () => {
      cancelled = true;
    };
  }, [
    selectedId,
    sidecarOnline,
    loadDetail,
    loadTable,
    loadArtifacts,
    clearGoneProject,
    t,
    setDetail,
    setTable,
    setAnnotations,
    setArtifacts,
    setParameters,
    setError,
  ]);

  // Keep project studio current without a manual «Проверить»:
  // poll while the page is open, and refresh on window focus / visibility.
  useEffect(() => {
    if (!selectedId || !sidecarOnline || view !== "studio") return;

    const refreshFull = () => {
      if (document.visibilityState === "hidden") return;
      void refreshProjectData(selectedId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshFull();
    };

    window.addEventListener("focus", refreshFull);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshProjectData(selectedId, { fresh: false });
    }, PROJECT_STUDIO_POLL_MS);

    return () => {
      window.removeEventListener("focus", refreshFull);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [selectedId, sidecarOnline, view, refreshProjectData]);

  // Lazy tab data.
  useEffect(() => {
    if (!selectedId || !sidecarOnline) return;
    if (tab === "annotations" && !annotations && !annotationsLoading) {
      void loadAnnotations(selectedId).catch((err) => {
        if (isProjectNotFoundError(err)) {
          clearGoneProject(selectedId);
          return;
        }
        setError(formatProjectError(err, t));
      });
    } else if (tab === "parameters" && !parameters && !parametersLoading) {
      void loadParameters(selectedId).catch((err) => {
        if (isProjectNotFoundError(err)) {
          clearGoneProject(selectedId);
          return;
        }
        setError(formatProjectError(err, t));
      });
    }
  }, [
    tab,
    selectedId,
    sidecarOnline,
    annotations,
    annotationsLoading,
    parameters,
    parametersLoading,
    loadAnnotations,
    loadParameters,
    clearGoneProject,
    t,
    setError,
  ]);

  // Terminal init job.
  useEffect(() => {
    if (!activeJob || activeJob.status === "running" || activeJob.status === "pending") return;
    if (handledJobIdRef.current === activeJob.id) return;
    handledJobIdRef.current = activeJob.id;
    setActiveJob(null);
    endBusy();

    if (activeJob.status === "failed" || activeJob.status === "cancelled") {
      const message =
        activeJob.status === "failed"
          ? formatUserFacingErrorRequired(
              activeJob.error ?? t("projects.initFailed"),
              t,
            )
          : null;
      if (view === "wizard") {
        setWizardPhase("form");
        if (message) setWizardError(message);
      } else if (message) {
        setError(message);
      }
      return;
    }
    if (view === "wizard") {
      setWizardPhase("form");
      setView("studio");
    }
    if (selectedId) void refreshProjectData(selectedId);
  }, [
    activeJob,
    view,
    selectedId,
    refreshProjectData,
    t,
    handledJobIdRef,
    setActiveJob,
    endBusy,
    setWizardPhase,
    setWizardError,
    setError,
    setView,
  ]);

  /** Shell / reconcile cleared active — follow it in studio (including null). */
  useEffect(() => {
    setSelectedId(workspaceActiveProjectId);
  }, [workspaceActiveProjectId, setSelectedId]);
}

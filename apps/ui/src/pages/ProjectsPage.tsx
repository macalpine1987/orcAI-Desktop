import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { cancelJob, type JobRecord } from "../api/jobs";
import {
  checkProjectNameAvailable,
  createProject,
  deleteProject,
  deleteProjectAnnotations,
  deleteProjectRecordings,
  fetchProject,
  fetchProjectAnnotations,
  fetchProjectArtifacts,
  fetchProjectParameters,
  fetchProjectRecordings,
  fetchProjectRecordingTable,
  fetchProjects,
  importProjectAnnotations,
  ProjectNameTakenError,
  registerProject,
  saveProjectParameters,
  setProjectRecordingChannel,
  startProjectInitJob,
  updateProject,
  validateProjectParameters,
  type ImportAnnotationsResult,
  type ProjectAnnotations,
  type ProjectArtifacts,
  type ProjectFocus,
  type ProjectParameters,
  type ProjectRecord,
  type ProjectRecordingTable,
} from "../api/projects";
import { PageHelpButton } from "../components/PageHelpButton";
import { ProjectAnnotationsTab } from "../components/projects/ProjectAnnotationsTab";
import { ProjectArtifactsTab } from "../components/projects/ProjectArtifactsTab";
import { ProjectCreateWizard, type WizardPhase } from "../components/projects/ProjectCreateWizard";
import {
  DeleteProjectDialog,
  DeleteRecordingsDialog,
  RefreshTableDialog,
} from "../components/projects/ProjectDialogs";
import { ProjectHeaderCard } from "../components/projects/ProjectHeaderCard";
import { ProjectParametersTab } from "../components/projects/ProjectParametersTab";
import { ProjectReadinessPanel } from "../components/projects/ProjectReadinessPanel";
import { ProjectRecordingsTab } from "../components/projects/ProjectRecordingsTab";
import { ProjectTabs } from "../components/projects/ProjectTabs";
import { IconSearch, IconTrain } from "../components/projects/ProjectsIcons";
import { ProjectListModal } from "../components/projects/ProjectListModal";
import { ProjectsActionsBar } from "../components/projects/ProjectsActionsBar";
import { ProjectNoSelectionEmpty } from "../components/projects/ProjectNoSelectionEmpty";
import { useJobPoller } from "../hooks/useJobPoller";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { formatPartialImportError, runProjectAudioImportJob } from "../lib/importProjectAudio";
import {
  projectNameConflictMessage,
} from "../lib/projectName";
import { filterAnnotationPaths, isPredictExportPath } from "../lib/annotationDrop";
import { filterWavPaths } from "../lib/wavDrop";
import { canModifyProjectRecordings } from "../lib/projectRecordings";
import { initialWizardParent, isMissingProjectParentError, projectsPageMode, projectsTabsForFocus, nextStepsFromSummary, tabForNextAction, trainWizardBlockedByAnnotations, wizardParentWhenCatalogMissing, type NextStep, type ProjectsTabId } from "../lib/projectsStudio";
import {
  addedCallNames,
  callsMissingFromClassColumns,
  parameterCallNames,
  recordingTableSyncModeAfterAdd,
  recordingTableSyncModeAfterDelete,
  shouldSyncRecordingTableAfterDelete,
  type RecordingTableSyncMode,
} from "../lib/recordingTableSync";
import {
  isRecordingTableBlockingPredict,
  shouldHighlightRefreshTable,
} from "../lib/recordingTableGate";
import { runProjectRecordingTableSync } from "../lib/runProjectRecordingTableSync";
import { pickAnnotationFiles, pickAudioFiles, pickDirectory, pickJsonOutputFile } from "../platform/dialog";
import { revealInFileManager, writeTextFileAbsolute } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import { defaultProjectsRoot } from "../platform/fsPaths";
import { usePreferences } from "../preferences/PreferencesContext";
import { useSaveNotice } from "../ui/saveNotice";
import {
  applyPredictHintsToQueue,
  buildPredictQueue,
  persistPredictQueue,
  syncQueueWithProjectRecordings,
} from "../workspace/predictQueue";
import {
  applyActiveProject,
  applyActiveProjectFocus,
  clearActiveProjectIf,
  reconcileWorkspaceWithProjects,
} from "../workspace/project";
import { loadWorkspace } from "../workspace/storage";

type View = "studio" | "wizard";


function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isProjectNotFoundError(err: unknown): boolean {
  return /project not found/i.test(errorText(err));
}

function formatProjectError(err: unknown, t: (key: string) => string): string {
  if (isProjectNotFoundError(err)) return t("projects.studio.offline.notFound");
  return errorText(err);
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const { notifySaved } = useSaveNotice();
  const { engineReady, online: sidecarOnline } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useWorkspace();
  const { projectsRoot } = usePreferences();

  // ---------------------------------------------------------------- registry
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(workspace.activeProjectId);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [detail, setDetail] = useState<ProjectRecord | null>(null);
  const { summary, loading: summaryLoading, refresh: refreshSummary } =
    useProjectSummary(sidecarOnline ? selectedId : null);

  // ---------------------------------------------------------------- studio data
  const [table, setTable] = useState<ProjectRecordingTable | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [annotations, setAnnotations] = useState<ProjectAnnotations | null>(null);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<ProjectArtifacts | null>(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [parameters, setParameters] = useState<ProjectParameters | null>(null);
  const [parametersLoading, setParametersLoading] = useState(false);
  const [tab, setTab] = useState<ProjectsTabId>("recordings");
  const [showNextSteps, setShowNextSteps] = useState(true);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------- wizard
  const [view, setView] = useState<View>("studio");
  const [wizardFocus, setWizardFocus] = useState<ProjectFocus>("recognition");
  const [wizardName, setWizardName] = useState("");
  const [wizardParent, setWizardParent] = useState("");
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>("form");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [pendingInit, setPendingInit] = useState<{ projectId: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem("orcai-desktop.pending-project-init");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { projectId?: string };
      return parsed.projectId ? { projectId: parsed.projectId } : null;
    } catch {
      return null;
    }
  });
  const pendingTableSyncRef = useRef<Set<string>>(new Set());
  const [pendingTableSyncTick, setPendingTableSyncTick] = useState(0);
  const persistPendingInit = useCallback((value: { projectId: string } | null) => {
    setPendingInit(value);
    try {
      if (value) {
        sessionStorage.setItem(
          "orcai-desktop.pending-project-init",
          JSON.stringify(value),
        );
      } else {
        sessionStorage.removeItem("orcai-desktop.pending-project-init");
      }
    } catch {
      /* ignore */
    }
  }, []);
  const wizardCancelledRef = useRef(false);

  // ---------------------------------------------------------------- dialogs / jobs
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [deleteFilesOpen, setDeleteFilesOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const handledJobIdRef = useRef<string | null>(null);
  const activeJobRef = useRef<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Safer than "full" before /summary (BUG-P-08): fewer tabs until focus is known.
  const focus: ProjectFocus = summary?.focus ?? detail?.focus ?? "recognition";
  const visibleTabs = projectsTabsForFocus(focus);
  const nextSteps = useMemo(
    () => (summary ? nextStepsFromSummary(summary, focus) : []),
    [summary, focus],
  );
  const guidedAction = nextSteps[0]?.action ?? null;
  const guidedTab = guidedAction ? tabForNextAction(guidedAction) : null;
  const wavCount = table ? table.rows.filter((r) => r.wav_exists).length : detail?.wav_count ?? 0;
  const mode = projectsPageMode(detail, summary, wavCount);
  const isActive = detail != null && detail.id === workspace.activeProjectId;
  const canModify = canModifyProjectRecordings(detail);
  const autoSyncCsv = detail?.auto_sync_recording_table ?? true;
  // Without summary, never assume CSV is current (BUG-P-05).
  const tableSyncStatus =
    summary?.recording_table.sync_status ??
    (detail?.recording_table_path ? "stale" : "missing");
  const callsColumnsMissing = Boolean(
    table?.table_exists && callsMissingFromClassColumns(table.calls, table.class_columns),
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

  useJobPoller(activeJob, setActiveJob, 800);
  activeJobRef.current = activeJob;

  // Keep shell model-frame rule in sync with summary focus (incl. inferred).
  useEffect(() => {
    if (!isActive || !summary?.focus) return;
    applyActiveProjectFocus(summary.focus);
  }, [isActive, summary?.focus]);

  // Clamp off-focus tabs (e.g. annotations under field focus) without depending on
  // array identity of visibleTabs (FIELD_PROJECTS_TABS is stable — BUG-01).
  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab("recordings");
    }
  }, [focus, tab, visibleTabs]);

  useEffect(() => {
    const requested = (location.state as { tab?: string } | null)?.tab;
    if (requested === "parameters" && visibleTabs.includes("parameters")) {
      setTab("parameters");
    }
  }, [location.state, visibleTabs]);

  // Auto-open the tab that hosts the first guided CTA once per project+focus.
  // Reset on focus change (BUG-P-07); do not re-yank on poll (BUG-12).
  const guidedTabAppliedKeyRef = useRef<string | null>(null);
  const guidedApplyKey = selectedId ? `${selectedId}:${focus}` : null;
  useEffect(() => {
    guidedTabAppliedKeyRef.current = null;
  }, [guidedApplyKey]);
  useEffect(() => {
    if (!selectedId || !guidedTab || !guidedApplyKey) return;
    if (!visibleTabs.includes(guidedTab)) return;
    if (guidedTabAppliedKeyRef.current === guidedApplyKey) return;
    guidedTabAppliedKeyRef.current = guidedApplyKey;
    setTab(guidedTab);
  }, [selectedId, guidedTab, visibleTabs, guidedApplyKey]);

  // ---------------------------------------------------------------- loaders
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
    if (loadWorkspace().activeProjectId !== project.id) {
      applyActiveProject(project);
    }
    return project;
  }, []);

  /** Folder vanished from disk (sidecar pruned registry) — drop selection quietly. */
  const clearGoneProject = useCallback(
    (id: string) => {
      clearActiveProjectIf(id, { notice: true });
      setSelectedId((prev) => (prev === id ? null : prev));
      setDetail((prev) => (prev?.id === id ? null : prev));
      setTable(null);
      setAnnotations(null);
      setArtifacts(null);
      setParameters(null);
      setSelectedRows(new Set());
      setError(null);
      void refreshList().catch(() => undefined);
    },
    [refreshList],
  );

  const loadTable = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setTableLoading(true);
    try {
      const data = await fetchProjectRecordingTable(id);
      if (selectedIdRef.current !== id) return;
      setTable(data);
      setSelectedRows((prev) => {
        const names = new Set(data.rows.map((r) => r.recording));
        return new Set([...prev].filter((n) => names.has(n)));
      });
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setTableLoading(false);
    }
  }, []);

  const loadAnnotations = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setAnnotationsLoading(true);
    try {
      const data = await fetchProjectAnnotations(id);
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
      if (selectedIdRef.current !== id) return;
      setParameters(data);
    } finally {
      if (!opts?.silent && selectedIdRef.current === id) setParametersLoading(false);
    }
  }, []);

  /** Re-read everything the page shows from disk (silent; no manual «Проверить»). */
  const refreshProjectData = useCallback(
    async (id: string) => {
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

  // Registry on mount / when the sidecar comes online.
  useEffect(() => {
    if (!sidecarOnline) return;
    void refreshList().catch((err) => setError(formatProjectError(err, t)));
  }, [sidecarOnline, refreshList, t]);

  // Selected project changed: reset caches and load base data.
  useEffect(() => {
    setDetail(null);
    setTable(null);
    setAnnotations(null);
    setArtifacts(null);
    setParameters(null);
    setSelectedRows(new Set());
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
  }, [selectedId, sidecarOnline, loadDetail, loadTable, loadArtifacts, clearGoneProject, t]);

  // Keep project studio current without a manual «Проверить»:
  // poll while the page is open, and refresh on window focus / visibility.
  useEffect(() => {
    if (!selectedId || !sidecarOnline || view !== "studio") return;

    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void refreshProjectData(selectedId);
    };

    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, 8_000);

    return () => {
      window.removeEventListener("focus", onFocus);
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
  ]);

  // Wizard: init starts once the engine is up (pendingInit survives remount via sessionStorage).
  useEffect(() => {
    if (!pendingInit || !engineReady || !sidecarOnline) return;
    if (wizardCancelledRef.current) {
      persistPendingInit(null);
      return;
    }
    const { projectId } = pendingInit;
    persistPendingInit(null);
    setView("wizard");
    setWizardPhase("init");
    setBusy(true);
    void startProjectInitJob(projectId)
      .then((job) => {
        handledJobIdRef.current = null;
        setActiveJob(job);
        trackJobInLab(job);
      })
      .catch((err) => {
        setWizardError(errorText(err));
        setWizardPhase("form");
        setBusy(false);
      });
  }, [pendingInit, engineReady, sidecarOnline, trackJobInLab, persistPendingInit]);

  // Terminal init job.
  useEffect(() => {
    if (!activeJob || activeJob.status === "running" || activeJob.status === "pending") return;
    if (handledJobIdRef.current === activeJob.id) return;
    handledJobIdRef.current = activeJob.id;
    setActiveJob(null);
    setBusy(false);

    if (activeJob.status === "failed" || activeJob.status === "cancelled") {
      const message = activeJob.status === "failed" ? activeJob.error ?? t("projects.initFailed") : null;
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
  }, [activeJob, view, selectedId, refreshProjectData, t]);

  // ---------------------------------------------------------------- actions · registry
  const selectProject = (id: string) => {
    setError(null);
    // Update selection first so concurrent refreshList sees the new id (P-08).
    setSelectedId(id);
    setTab("recordings");
    const project = projects.find((p) => p.id === id);
    if (project && loadWorkspace().activeProjectId !== project.id) {
      applyActiveProject(project);
    }
  };

  /** Shell / reconcile cleared active — follow it in studio (including null). */
  useEffect(() => {
    setSelectedId(workspace.activeProjectId);
  }, [workspace.activeProjectId]);

  const onOpenFolder = () => {
    if (detail) void revealInFileManager(detail.path);
  };

  const onOpenExisting = async () => {
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const dir = await pickDirectory(t("projects.pickFolderTitle"));
    if (!dir) return;
    setBusy(true);
    setError(null);
    try {
      const project = await registerProject(dir);
      await refreshList();
      applyActiveProject(project);
      selectProject(project.id);
    } catch (err) {
      if (err instanceof ProjectNameTakenError) {
        const folderLabel = dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;
        setError(projectNameConflictMessage(t, folderLabel, err.conflicts));
      } else {
        setError(formatProjectError(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const onChangeFocus = async (next: ProjectFocus) => {
    if (!detail || next === focus) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProject(detail.id, { focus: next });
      setDetail(updated);
      if (updated.id === workspace.activeProjectId) {
        applyActiveProjectFocus(next);
      }
      await Promise.all([refreshSummary(), refreshList()]);
      notifySaved(t("projects.studio.focus.saved"));
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteProject = async (deleteFiles: boolean) => {
    const target = deleteTarget ?? detail;
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProject(target.id, deleteFiles);
      clearActiveProjectIf(target.id);
      setDeleteProjectOpen(false);
      setDeleteTarget(null);
      if (selectedId === target.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await refreshList();
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onInit = async () => {
    if (!detail || !engineReady) return;
    setBusy(true);
    setError(null);
    try {
      const job = await startProjectInitJob(detail.id);
      handledJobIdRef.current = null;
      setActiveJob(job);
      trackJobInLab(job);
    } catch (err) {
      setError(formatProjectError(err, t));
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- actions · recordings
  const runTableSync = async (id: string, syncMode: RecordingTableSyncMode) => {
    await runProjectRecordingTableSync(id, syncMode, { onJobCreated: trackJobInLab, t });
    const project = await loadDetail(id);
    if (project.id === workspace.activeProjectId) applyActiveProject(project);
    await refreshProjectData(id);
  };

  useEffect(() => {
    if (!engineReady || pendingTableSyncRef.current.size === 0) return;
    const projectId = detail?.id ?? workspace.activeProjectId;
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
  }, [engineReady, pendingTableSyncTick, detail?.id, workspace.activeProjectId]);

  const onConfirmRefresh = async (syncMode: RecordingTableSyncMode) => {
    if (!detail) return;
    setRefreshOpen(false);
    setBusy(true);
    setError(null);
    try {
      await runTableSync(detail.id, syncMode);
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const importWavPaths = async (paths: string[]) => {
    if (!detail || !canModify) return;
    const wavs = filterWavPaths(paths);
    if (wavs.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runProjectAudioImportJob(detail.id, wavs, {
        onJobCreated: trackJobInLab,
        t,
      });
      if (result.failed?.length) {
        setError(formatPartialImportError(result.failed, t));
      }
      const project = await loadDetail(detail.id);
      const shouldAutoSync = project.auto_sync_recording_table ?? true;
      if (engineReady && shouldAutoSync) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      } else {
        await refreshProjectData(project.id);
        if (shouldAutoSync && !engineReady) {
          pendingTableSyncRef.current.add(project.id);
          setPendingTableSyncTick((n) => n + 1);
          setError((prev) => prev ?? t("projects.studio.table.tableStale"));
        }
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onAddWav = async () => {
    if (!detail || !canModify) return;
    const paths = await pickAudioFiles(t("projects.studio.actions.addWav"));
    if (paths.length === 0) return;
    await importWavPaths(paths);
  };

  const importAnnotationPaths = async (paths: string[]) => {
    if (!detail || !canModify) return;
    const txts = filterAnnotationPaths(paths);
    if (txts.length === 0) {
      const onlyPredict = paths.some((p) => isPredictExportPath(p));
      setError(
        t(
          onlyPredict
            ? "projects.studio.annotations.renamePredictFirst"
            : "projects.studio.annotations.noneImportable",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result: ImportAnnotationsResult = await importProjectAnnotations(detail.id, txts);
      if (result.failed?.length) {
        setError(formatPartialImportError(result.failed, t));
      }
      if (result.imported_count > 0) {
        const importedNote = t("projects.studio.annotations.importResult", {
          imported: result.imported_count,
          unpaired: result.unpaired_imported_count ?? result.unpaired_count,
        });
        const added = result.added_calls ?? [];
        notifySaved(
          added.length
            ? `${importedNote} ${t("projects.studio.annotations.callsAdded", {
                labels: added.join(", "),
              })}`
            : importedNote,
        );
      } else if (!result.failed?.length) {
        setError(t("projects.studio.annotations.noneImported"));
      }
      const project = await loadDetail(detail.id);
      const shouldAutoSync = project.auto_sync_recording_table ?? true;
      if (engineReady && shouldAutoSync && result.imported_count > 0) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      } else {
        await refreshProjectData(project.id);
        if (shouldAutoSync && !engineReady && result.imported_count > 0) {
          pendingTableSyncRef.current.add(project.id);
          setPendingTableSyncTick((n) => n + 1);
        }
      }
      // Always reload matrix after import — even when auto-sync refreshed other panes (BUG-04).
      await loadAnnotations(project.id);
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onAddAnnotations = async () => {
    if (!detail || !canModify) return;
    const paths = await pickAnnotationFiles(t("projects.studio.annotations.add"));
    if (paths.length === 0) return;
    await importAnnotationPaths(paths);
  };

  const onDeleteAnnotations = async (names: string[]) => {
    if (!detail || !canModify || names.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProjectAnnotations(detail.id, names);
      await loadAnnotations(detail.id);
      await refreshSummary();
      const project = detail;
      const shouldAutoSync = project.auto_sync_recording_table ?? true;
      if (engineReady && shouldAutoSync) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmDeleteFiles = async () => {
    if (!detail || selectedRows.size === 0) return;
    setDeleteFilesOpen(false);
    setBusy(true);
    setError(null);
    try {
      const rows = table?.rows ?? [];
      const selected = rows.filter((r) => selectedRows.has(r.recording));
      const wavRows = rows.filter((r) => r.wav_exists);
      const deleteAll =
        wavRows.length > 0 && wavRows.every((r) => selectedRows.has(r.recording));
      const filenames = selected.map((r) => {
        if (r.wav_path) {
          const norm = r.wav_path.replace(/\\/g, "/");
          return norm.split("/").pop() || r.recording;
        }
        return r.recording;
      });
      const result = await deleteProjectRecordings(
        detail.id,
        deleteAll ? { delete_all: true } : { filenames },
      );
      setSelectedRows(new Set());
      if (result.count === 0) {
        setError(t("projects.deleteNoneMatched"));
        return;
      }
      const project = await loadDetail(detail.id);
      const shouldAutoSync = project.auto_sync_recording_table ?? true;
      if (
        shouldAutoSync &&
        shouldSyncRecordingTableAfterDelete(project) &&
        engineReady
      ) {
        await runTableSync(project.id, recordingTableSyncModeAfterDelete(project));
      } else {
        if (project.id === workspace.activeProjectId) applyActiveProject(project);
        await refreshProjectData(project.id);
        if (shouldAutoSync && !engineReady && shouldSyncRecordingTableAfterDelete(project)) {
          pendingTableSyncRef.current.add(project.id);
          setPendingTableSyncTick((n) => n + 1);
        }
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onChannelChange = async (recording: string, channel: number) => {
    if (!detail) return;
    setTable((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.recording === recording ? { ...r, channel } : r)),
          }
        : prev,
    );
    try {
      await setProjectRecordingChannel(detail.id, recording, channel);
      notifySaved(t("projects.studio.table.channelSaved"));
      void refreshSummary();
    } catch (err) {
      setError(formatProjectError(err, t));
      void loadTable(detail.id).catch(() => undefined);
    }
  };

  const toggleRow = (name: string) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // ---------------------------------------------------------------- actions · navigation
  const onToggleAutoSyncCsv = async (enabled: boolean) => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const project = await updateProject(detail.id, {
        auto_sync_recording_table: enabled,
      });
      setDetail(project);
      if (project.id === workspace.activeProjectId) applyActiveProject(project);
      await refreshSummary();
      if (enabled && engineReady && tableNeedsRefresh) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const openPredict = async (tab: "run" | "filter") => {
    if (!detail) return;
    if (tab === "run" && predictBlocked) {
      setError(t("projects.studio.table.predictBlockedStale"));
      return;
    }
    setError(null);
    try {
      const recordings = await fetchProjectRecordings(detail.id);
      if (recordings.length === 0) {
        if (tab === "filter") {
          applyActiveProject(detail);
          navigate("/predict", { state: { tab: "filter" } });
          return;
        }
        setError(t("projects.openInPredictNeedWavs"));
        return;
      }
      const queue =
        tab === "run" && selectedRows.size > 0
          ? buildPredictQueue(detail, recordings, selectedRows)
          : syncQueueWithProjectRecordings(detail, recordings, null);
      if (!queue) {
        if (tab === "filter") {
          applyActiveProject(detail);
          navigate("/predict", { state: { tab: "filter" } });
          return;
        }
        setError(t("projects.openInPredictNeedWavs"));
        return;
      }
      const tableForHints =
        table ?? (await fetchProjectRecordingTable(detail.id));
      const withHints = applyPredictHintsToQueue(
        queue,
        tableForHints.rows.map((row) => ({
          recording: row.recording,
          predict_status: row.predict_status,
          predicted_path: row.predicted_path,
        })),
      );
      applyActiveProject(detail);
      persistPredictQueue(withHints);
      navigate("/predict", { state: { tab } });
    } catch (err) {
      setError(formatProjectError(err, t));
    }
  };

  const onPredict = () => void openPredict("run");

  const trainWizardBlocked = trainWizardBlockedByAnnotations(summary);

  const onOpenTraining = () => {
    if (!detail || trainWizardBlocked) return;
    applyActiveProject(detail);
    navigate("/pipeline");
  };

  const onNextStep = (step: NextStep) => {
    if (!detail) return;
    applyActiveProject(detail);
    if (step.action === "sync_table") {
      setRefreshOpen(true);
      return;
    }
    if (step.action === "annotate") {
      setTab("annotations");
      return;
    }
    if (step.action === "predict") {
      if (predictBlocked) {
        setError(t("projects.studio.table.predictBlockedStale"));
        return;
      }
      void openPredict("run");
      return;
    }
    if (step.action === "filter") {
      void openPredict("filter");
      return;
    }
    navigate(step.route, step.routeState ? { state: step.routeState } : undefined);
  };

  // ---------------------------------------------------------------- actions · parameters
  const onValidateParameters = useCallback(
    (text: string) => {
      if (!selectedId) return Promise.reject(new Error("no project"));
      return validateProjectParameters(selectedId, text);
    },
    [selectedId],
  );

  const onSaveParameters = async (text: string) => {
    if (!detail) return;
    const before = parameterCallNames(parameters?.text);
    const after = parameterCallNames(text);
    const added = before && after ? addedCallNames(before, after) : [];
    setBusy(true);
    setError(null);
    try {
      const saved = await saveProjectParameters(detail.id, text);
      setParameters(saved);
      notifySaved(t("projects.studio.params.saved"));
      setAnnotations(null);
      if (added.length === 0) {
        await Promise.all([loadTable(detail.id), refreshSummary()]);
        return;
      }
      const project = await loadDetail(detail.id);
      const shouldAutoSync = project.auto_sync_recording_table ?? true;
      const hasTableWork = project.wav_count > 0 || Boolean(project.recording_table_path);
      if (shouldAutoSync && engineReady && hasTableWork) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      } else {
        await Promise.all([loadTable(project.id), refreshSummary()]);
        if (shouldAutoSync && !engineReady && hasTableWork) {
          setError((prev) => prev ?? t("projects.studio.table.tableStale"));
        }
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onExportParameters = async (text: string) => {
    if (!parameters) return;
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const target = await pickJsonOutputFile(
      t("projects.studio.params.exportTitle"),
      parameters.filename,
    );
    if (!target) return;
    try {
      await writeTextFileAbsolute(target, text.endsWith("\n") ? text : `${text}\n`);
      notifySaved(t("projects.studio.params.exported", { path: target }));
    } catch (err) {
      setError(formatProjectError(err, t));
    }
  };

  // ---------------------------------------------------------------- actions · wizard
  const openWizard = () => {
    wizardCancelledRef.current = false;
    setWizardFocus("recognition");
    setWizardName("");
    const known = initialWizardParent({
      projectsRoot,
      activeProjectPath: detail?.path,
    });
    setWizardParent(known);
    setWizardPhase("form");
    setWizardError(null);
    persistPendingInit(null);
    setView("wizard");
    if (!known) {
      void defaultProjectsRoot().then((root) => {
        setWizardParent((current) => current || root);
      });
    }
  };

  const cancelWizard = () => {
    wizardCancelledRef.current = true;
    const job = activeJobRef.current;
    if (job && (job.status === "running" || job.status === "pending")) {
      void cancelJob(job.id).catch(() => undefined);
    }
    persistPendingInit(null);
    setActiveJob(null);
    setWizardPhase("form");
    setBusy(false);
    setView("studio");
  };

  const onWizardPickParent = async () => {
    if (!isTauri()) {
      setWizardError(t("projects.desktopRequired"));
      return;
    }
    const dir = await pickDirectory(t("projects.pickParentTitle"));
    if (dir) {
      setWizardParent(dir);
      setWizardError(null);
    }
  };

  const onWizardNext = async () => {
    let parent = wizardParent.trim();
    if (!parent) {
      parent = initialWizardParent({
        projectsRoot,
        activeProjectPath: detail?.path,
        fallbackRoot: await defaultProjectsRoot(),
      });
      if (parent) setWizardParent(parent);
    }
    const name = wizardName.trim();
    if (!parent || !name) {
      setWizardError(t("projects.fieldsRequired"));
      return;
    }
    if (!sidecarOnline) {
      setWizardError(t("predict.importSidecarRequired"));
      return;
    }
    setBusy(true);
    setWizardError(null);
    wizardCancelledRef.current = false;
    let retriedMissingCatalog = false;
    try {
      for (;;) {
        try {
          const check = await checkProjectNameAvailable(parent, name);
          if (!check.available) {
            setWizardError(projectNameConflictMessage(t, name, check.conflicts));
            setBusy(false);
            return;
          }
          setWizardPhase("creating");
          const project = await createProject({
            parent_dir: parent,
            display_name: name,
            description: "",
            focus: wizardFocus,
          });
          applyActiveProject(project);
          await refreshList();
          setSelectedId(project.id);
          setTab("recordings");
          if (!engineReady) {
            // Busy stays on while we wait: the init job is queued for the engine.
            setWizardPhase("waiting_engine");
            persistPendingInit({ projectId: project.id });
            return;
          }
          setWizardPhase("init");
          const job = await startProjectInitJob(project.id);
          handledJobIdRef.current = null;
          setActiveJob(job);
          trackJobInLab(job);
          return;
        } catch (err) {
          if (!retriedMissingCatalog && isMissingProjectParentError(errorText(err))) {
            const fallback = wizardParentWhenCatalogMissing({
              parent,
              projectsRoot,
              fallbackRoot: await defaultProjectsRoot(),
            });
            if (fallback) {
              retriedMissingCatalog = true;
              parent = fallback;
              setWizardParent(parent);
              continue;
            }
          }
          throw err;
        }
      }
    } catch (err) {
      setWizardPhase("form");
      setWizardError(
        err instanceof ProjectNameTakenError
          ? projectNameConflictMessage(t, name, err.conflicts)
          : errorText(err),
      );
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- render
  const subtitle = useMemo(() => {
    if (view === "wizard") return t("projects.studio.subtitle.wizard");
    return t(`projects.studio.subtitle.${mode}`);
  }, [view, mode, t]);

  const tabCounts = {
    recordings: table ? table.row_count : detail ? detail.wav_count : null,
    annotations: summary ? summary.readiness_lines.annotations.annotated : null,
    artifacts: artifacts ? artifacts.present_count : null,
  } satisfies Partial<Record<ProjectsTabId, number | null>>;

  return (
    <div className="projects-studio projects-page">
      <div className="studio-panel projects-work-panel">
        <div
          className={clsx(
            "projects-page-header",
            view === "wizard" && "projects-page-header--wizard",
          )}
        >
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.projects.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{subtitle}</p>
          </div>
          <PageHelpButton />
        </div>

        <div
          className={clsx(
            "projects-panel-body",
            view === "wizard" && "projects-panel-body--wizard",
            view !== "wizard" && detail && "projects-panel-body--project",
            view !== "wizard" && !detail && "projects-panel-body--empty",
          )}
        >
          {view === "wizard" ? (
            <ProjectCreateWizard
              focus={wizardFocus}
              displayName={wizardName}
              parentDir={wizardParent}
              phase={wizardPhase}
              busy={busy}
              sidecarOnline={sidecarOnline}
              error={wizardError}
              onFocus={setWizardFocus}
              onDisplayName={(v) => {
                setWizardName(v);
                setWizardError(null);
              }}
              onPickParent={() => void onWizardPickParent()}
              onCancel={cancelWizard}
              onNext={() => void onWizardNext()}
            />
          ) : (
            <div className="ps-project-workspace">
              {/* Work toolbar belongs to an open project (m02/m33) — hide when none selected. */}
              {detail ? (
                <ProjectsActionsBar
                  hasProject
                  busy={busy}
                  onCreate={openWizard}
                  onOpenFolder={onOpenFolder}
                  onOpenProjectList={() => {
                    void refreshList().catch(() => undefined);
                    setListOpen(true);
                  }}
                />
              ) : null}

              {error ? (
                <p className="ps-hint-bar is-err whitespace-pre-wrap font-mono text-xs" role="alert">
                  {error}
                </p>
              ) : null}

              {!sidecarOnline && !detail ? (
                <ProjectNoSelectionEmpty
                  busy={busy}
                  sidecarOnline={false}
                  onCreate={openWizard}
                  onOpenExisting={() => void onOpenExisting()}
                />
              ) : !detail ? (
                selectedId ? (
                  <div className="ps-empty">
                    <div>
                      <h3 className="ps-empty-title">{t("projects.expandLoading")}</h3>
                    </div>
                  </div>
                ) : (
                  <ProjectNoSelectionEmpty
                    busy={busy}
                    sidecarOnline={sidecarOnline}
                    onCreate={openWizard}
                    onOpenExisting={() => void onOpenExisting()}
                  />
                )
              ) : (
                <div className="ps-project-stage">
                  <ProjectHeaderCard
                    project={detail}
                    summary={summary}
                    table={table}
                    focus={focus}
                    isActive={isActive}
                    busy={busy}
                    engineReady={engineReady}
                    onChangeFocus={(f) => void onChangeFocus(f)}
                    onDelete={() => {
                      setDeleteTarget(detail);
                      setDeleteProjectOpen(true);
                    }}
                    onInit={() => void onInit()}
                  />

                  <div className="ps-project-stage-body">
                    <ProjectReadinessPanel
                      summary={summary}
                      focus={focus}
                      loading={summaryLoading}
                      online={sidecarOnline}
                      showNextSteps={showNextSteps}
                      onToggleNextSteps={() => setShowNextSteps((v) => !v)}
                      onNextStep={onNextStep}
                    />

                    <ProjectTabs
                      active={tab}
                      tabs={visibleTabs}
                      guidedTab={guidedTab}
                      counts={tabCounts}
                      onChange={setTab}
                      trailing={
                        tab === "recordings" &&
                        (mode === "field" || mode === "full") ? (
                          <button
                            type="button"
                            className={clsx(
                              "ps-btn",
                              guidedAction === "predict"
                                ? "ps-btn-attention"
                                : "ps-btn-primary",
                            )}
                            onClick={() => void onPredict()}
                            disabled={busy || wavCount === 0 || predictBlocked}
                            title={
                              predictBlocked
                                ? t("projects.studio.table.predictBlockedStale")
                                : selectedRows.size > 0
                                  ? t("projects.openInPredictSelection")
                                  : t("projects.openInPredictAllWavs")
                            }
                          >
                            <IconSearch />
                            {t("projects.studio.actions.predict")}
                          </button>
                        ) : (mode === "lab" || mode === "full") &&
                          tab === "annotations" ? (
                          <button
                            type="button"
                            className={clsx(
                              "ps-btn",
                              guidedAction === "train" && !trainWizardBlocked
                                ? "ps-btn-attention"
                                : "ps-btn-primary",
                            )}
                            onClick={onOpenTraining}
                            disabled={busy || trainWizardBlocked}
                          >
                            <IconTrain />
                            {t("projects.studio.actions.trainWizard")}
                          </button>
                        ) : null
                      }
                    />

                    <div
                      role="tabpanel"
                      id={`projects-panel-${tab}`}
                      aria-labelledby={`projects-tab-${tab}`}
                      className="ps-project-tabpanel"
                    >
                      {tab === "recordings" ? (
                        <ProjectRecordingsTab
                          table={table}
                          loading={tableLoading}
                          mode={mode}
                          selected={selectedRows}
                          busy={busy}
                          canModify={canModify}
                          engineReady={engineReady}
                          showAllColumns={showAllColumns}
                          autoSyncCsv={autoSyncCsv}
                          tableNeedsRefresh={tableNeedsRefresh}
                          guidedAction={
                            guidedAction === "sync_table" || guidedAction === "predict"
                              ? (guidedAction as "sync_table" | "predict")
                              : null
                          }
                          onToggleColumns={() => setShowAllColumns((v) => !v)}
                          onToggleAutoSyncCsv={(enabled) => void onToggleAutoSyncCsv(enabled)}
                          onToggleRow={toggleRow}
                          onSelectAll={() =>
                            setSelectedRows(new Set((table?.rows ?? []).map((r) => r.recording)))
                          }
                          onClearSelection={() => setSelectedRows(new Set())}
                          onRefreshTable={() => setRefreshOpen(true)}
                          onAddWav={() => void onAddWav()}
                          onImportWavPaths={(paths) => void importWavPaths(paths)}
                          onDeleteSelected={() => setDeleteFilesOpen(true)}
                          onChannelChange={(recording, channel) =>
                            void onChannelChange(recording, channel)
                          }
                        />
                      ) : null}
                      {tab === "annotations" ? (
                        <ProjectAnnotationsTab
                          data={annotations}
                          loading={annotationsLoading}
                          mode={mode}
                          busy={busy}
                          canModify={canModify}
                          onAddAnnotations={() => void onAddAnnotations()}
                          onImportPaths={(paths) => void importAnnotationPaths(paths)}
                          onDeleteAnnotations={(names) => void onDeleteAnnotations(names)}
                          onOpenAnnotationsFolder={() => {
                            const dir = annotations?.annotations_dir;
                            if (dir) void revealInFileManager(dir);
                          }}
                        />
                      ) : null}
                      {tab === "artifacts" ? (
                        <ProjectArtifactsTab
                          data={artifacts}
                          loading={artifactsLoading}
                          onOpen={(path) => void revealInFileManager(path)}
                        />
                      ) : null}
                      {tab === "parameters" ? (
                        <ProjectParametersTab
                          data={parameters}
                          loading={parametersLoading}
                          busy={busy}
                          onValidate={onValidateParameters}
                          onSave={onSaveParameters}
                          onExport={onExportParameters}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ProjectListModal
        open={listOpen}
        projects={projects}
        currentProjectId={selectedId}
        activeProjectId={workspace.activeProjectId}
        busy={busy}
        onClose={() => setListOpen(false)}
        onOpen={(project) => {
          applyActiveProject(project);
          selectProject(project.id);
          setListOpen(false);
          void refreshList().catch(() => undefined);
        }}
        onDelete={(project) => {
          setListOpen(false);
          setDeleteTarget(project);
          setDeleteProjectOpen(true);
        }}
      />

      <RefreshTableDialog
        open={refreshOpen && detail != null}
        tableExists={Boolean(table?.table_exists ?? detail?.recording_table_path)}
        busy={busy}
        onConfirm={(m) => void onConfirmRefresh(m)}
        onClose={() => setRefreshOpen(false)}
      />

      <DeleteRecordingsDialog
        open={deleteFilesOpen && detail != null}
        count={selectedRows.size}
        busy={busy}
        onConfirm={() => void onConfirmDeleteFiles()}
        onClose={() => setDeleteFilesOpen(false)}
      />

      <DeleteProjectDialog
        open={deleteProjectOpen && deleteTarget != null}
        busy={busy}
        onDelete={(files) => void onDeleteProject(files)}
        onClose={() => {
          setDeleteProjectOpen(false);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

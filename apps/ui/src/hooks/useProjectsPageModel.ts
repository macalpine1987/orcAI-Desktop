import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBusyGuard } from "./useBusyGuard";
import {
  type ProjectAnnotations,
  type ProjectArtifacts,
  type ProjectFocus,
  type ProjectParameters,
  type ProjectRecord,
  type ProjectRecordingTable,
} from "../api/projects";
import { useJobPoller } from "../hooks/useJobPoller";
import { useProjectNavActions } from "../hooks/useProjectNavActions";
import { useProjectParametersActions } from "../hooks/useProjectParametersActions";
import { useProjectRecordingActions } from "../hooks/useProjectRecordingActions";
import { useProjectRegistryActions } from "../hooks/useProjectRegistryActions";
import { useProjectStudioLifecycle } from "../hooks/useProjectStudioLifecycle";
import { useProjectStudioLoaders } from "../hooks/useProjectStudioLoaders";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useProjectTableSync } from "../hooks/useProjectTableSync";
import { useProjectWizardFlow } from "../hooks/useProjectWizardFlow";
import { useProjectDialogs } from "./useProjectDialogs";
import { useProjectStudioUiState } from "./useProjectStudioUiState";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { formatProjectError } from "../lib/projectErrors";
import { canModifyProjectRecordings } from "../lib/projectRecordings";
import {
  projectsPageMode,
  projectsTabsForFocus,
  nextStepsFromSummary,
  tabForNextAction,
  type ProjectsTabId,
} from "../lib/projectsStudio";
import { usePreferences } from "../preferences/PreferencesContext";
import { useSaveNotice } from "../ui/saveNotice";

export function useProjectsPageModel() {
  const { t } = useTranslation();
  const { notifySaved, notifyHeaderError } = useSaveNotice();
  const { engineReady, online: sidecarOnline } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useWorkspace();
  const { projectsRoot } = usePreferences();
  const { busy, busyRef, markBusy } = useBusyGuard();
  const setBusy = markBusy;

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
  const {
    tab,
    setTab,
    showNextSteps,
    setShowNextSteps,
    showAllColumns,
    setShowAllColumns,
    selectedRows,
    setSelectedRows,
  } = useProjectStudioUiState();

  // ---------------------------------------------------------------- dialogs / jobs
  const {
    refreshOpen,
    setRefreshOpen,
    deleteFilesOpen,
    setDeleteFilesOpen,
    deleteProjectOpen,
    setDeleteProjectOpen,
    listOpen,
    setListOpen,
    deleteTarget,
    setDeleteTarget,
    activeJob,
    setActiveJob,
    handledJobIdRef,
    activeJobRef,
  } = useProjectDialogs();
  const [error, setError] = useState<string | null>(null);

  const beginBusy = () => {
    if (busyRef.current) return false;
    markBusy(true);
    return true;
  };
  const endBusy = () => {
    markBusy(false);
  };
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

  useJobPoller(activeJob, setActiveJob, 800);

  // guidedTab only highlights the tab + «Следующий шаг»; do not auto-switch
  // after WAV import (training / full cycle → annotate).

  // ---------------------------------------------------------------- loaders
  const {
    refreshList,
    loadDetail,
    clearGoneProject,
    loadTable,
    loadAnnotations,
    loadArtifacts,
    loadParameters,
    refreshProjectData,
  } = useProjectStudioLoaders({
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
  });

  const {
    autoSyncCsv,
    tableNeedsRefresh,
    predictBlocked,
    runTableSync,
    onConfirmRefresh,
    syncAfterChange,
  } = useProjectTableSync({
    detail,
    summary,
    table,
    engineReady,
    workspaceActiveProjectId: workspace.activeProjectId,
    trackJobInLab,
    loadDetail,
    refreshProjectData,
    setBusy,
    setError,
    setRefreshOpen,
    formatError: (err) => formatProjectError(err, t),
  });

  const {
    view,
    setView,
    wizardFocus,
    setWizardFocus,
    wizardName,
    wizardParent,
    wizardPhase,
    setWizardPhase,
    wizardError,
    setWizardError,
    openWizard,
    cancelWizard,
    onWizardPickParent,
    onWizardNext,
    onWizardDisplayName,
  } = useProjectWizardFlow({
    detailPath: detail?.path,
    projectsRoot,
    sidecarOnline,
    engineReady,
    trackJobInLab,
    refreshList,
    setSelectedId,
    setTab,
    setBusy,
    setError,
    setActiveJob,
    activeJobRef,
    handledJobIdRef,
    formatError: (err) => formatProjectError(err, t),
  });

  useProjectStudioLifecycle({
    t,
    detail,
    summaryFocus: summary?.focus,
    workspaceActiveProjectId: workspace.activeProjectId,
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
  });

  // ---------------------------------------------------------------- actions · registry
  const {
    selectProject,
    onOpenFolder,
    onOpenExisting,
    onChangeFocus,
    onDeleteProject,
    onInit,
  } = useProjectRegistryActions({
    t,
    projects,
    detail,
    focus,
    deleteTarget,
    selectedId,
    engineReady,
    workspaceActiveProjectId: workspace.activeProjectId,
    beginBusy,
    endBusy,
    setError,
    setSelectedId,
    setTab,
    setDetail,
    setDeleteProjectOpen,
    setDeleteTarget,
    setActiveJob,
    handledJobIdRef,
    refreshList,
    refreshSummary,
    trackJobInLab,
    notifySaved,
  });

  // ---------------------------------------------------------------- actions · recordings
  const {
    importWavPaths,
    onAddWav,
    importAnnotationPaths,
    onAddAnnotations,
    onDeleteAnnotations,
    onConfirmDeleteFiles,
    onChannelChange,
    toggleRow,
  } = useProjectRecordingActions({
    t,
    detail,
    table,
    selectedRows,
    canModify,
    engineReady,
    beginBusy,
    endBusy,
    setError,
    setTable,
    setSelectedRows,
    setDeleteFilesOpen,
    loadDetail,
    loadTable,
    loadAnnotations,
    refreshSummary,
    syncAfterChange,
    runTableSync,
    trackJobInLab,
    notifySaved,
    notifyHeaderError,
  });

  // ---------------------------------------------------------------- actions · navigation
  const {
    onToggleAutoSyncCsv,
    openPredict,
    onPredict,
    trainWizardBlocked,
    onOpenTraining,
    onNextStep,
  } = useProjectNavActions({
    t,
    detail,
    summary,
    table,
    selectedRows,
    engineReady,
    workspaceActiveProjectId: workspace.activeProjectId,
    predictBlocked,
    tableNeedsRefresh,
    beginBusy,
    endBusy,
    setError,
    setDetail,
    refreshSummary,
    runTableSync,
    setRefreshOpen,
    setTab,
    navigate,
  });

  // ---------------------------------------------------------------- actions · parameters
  const { onValidateParameters, onSaveParameters, onExportParameters } =
    useProjectParametersActions({
      t,
      detail,
      selectedId,
      parameters,
      beginBusy,
      endBusy,
      setError,
      setParameters,
      setAnnotations,
      loadDetail,
      loadTable,
      refreshSummary,
      syncAfterChange,
      notifySaved,
    });

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

  return {
    t, notifySaved, notifyHeaderError, engineReady, sidecarOnline, trackJobInLab,
    navigate, location, workspace, projectsRoot, busyRef, projects, setProjects,
    selectedId, setSelectedId, selectedIdRef, detail, setDetail, summary, summaryLoading,
    refreshSummary, table, setTable, tableLoading, annotations, setAnnotations,
    annotationsLoading, artifacts, setArtifacts, artifactsLoading, parameters, setParameters,
    parametersLoading, tab, setTab, showNextSteps, setShowNextSteps, showAllColumns,
    setShowAllColumns, selectedRows, setSelectedRows, refreshOpen, setRefreshOpen,
    deleteFilesOpen, setDeleteFilesOpen, deleteProjectOpen, setDeleteProjectOpen,
    listOpen, setListOpen, deleteTarget, setDeleteTarget, activeJob, setActiveJob,
    handledJobIdRef, activeJobRef, error, setError, busy, setBusy, beginBusy, endBusy,
    focus, visibleTabs, nextSteps, guidedAction, guidedTab, wavCount, mode, isActive,
    canModify, refreshList, loadDetail, clearGoneProject, loadTable, loadAnnotations,
    loadArtifacts, loadParameters, refreshProjectData, autoSyncCsv, tableNeedsRefresh,
    predictBlocked, runTableSync, onConfirmRefresh, syncAfterChange, view, setView,
    wizardFocus, setWizardFocus, wizardName, wizardParent, wizardPhase, setWizardPhase,
    wizardError, setWizardError, openWizard, cancelWizard, onWizardPickParent, onWizardNext,
    onWizardDisplayName, selectProject, onOpenFolder, onOpenExisting, onChangeFocus,
    onDeleteProject, onInit, importWavPaths, onAddWav, importAnnotationPaths, onAddAnnotations,
    onDeleteAnnotations, onConfirmDeleteFiles, onChannelChange, toggleRow, onToggleAutoSyncCsv,
    openPredict, onPredict, trainWizardBlocked, onOpenTraining, onNextStep,
    onValidateParameters, onSaveParameters, onExportParameters, subtitle, tabCounts,
  };
}

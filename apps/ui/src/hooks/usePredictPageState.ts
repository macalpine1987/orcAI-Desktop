import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSaveNotice } from "../ui/saveNotice";
import { usePredictBatchRun } from "../hooks/usePredictBatchRun";
import { usePredictFilterRun } from "../hooks/usePredictFilterRun";
import { usePredictOverwriteDialog } from "../hooks/usePredictOverwriteDialog";
import { usePredictQueue } from "../hooks/usePredictQueue";
import { usePredictRecordingTable } from "../hooks/usePredictRecordingTable";
import { usePredictAnalysisResults } from "../hooks/usePredictAnalysisResults";
import { usePredictFilterDerived } from "../hooks/usePredictFilterDerived";
import { usePredictSettingsProfiles } from "../hooks/usePredictSettingsProfiles";
import { usePredictTabsNav } from "../hooks/usePredictTabsNav";
import {
  usePredictLocationNav,
  type PredictLocationState,
} from "../hooks/usePredictLocationNav";
import { usePredictWorkspaceModelSync } from "../hooks/usePredictWorkspaceModelSync";
import { usePredictPageLocalState } from "../hooks/usePredictPageLocalState";
import { usePredictRunDerived } from "../hooks/usePredictRunDerived";
import { usePredictPageActions } from "../hooks/usePredictPageActions";
import { predictNavInactiveForWorkspace } from "../layout/navigation";
import { isPredictPath } from "../layout/labKeepAlivePaths";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { isRecordingTableBlockingPredict } from "../lib/recordingTableGate";
import { usePredictBatch } from "../predict/PredictBatchContext";
import { usePredictShellMetaBridge } from "./usePredictShellMetaBridge";
import {
  runningPredictFile,
} from "../workspace/predictQueue";

export function usePredictPageState() {

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifySaved, notifyHeaderError, dismissHeaderError } = useSaveNotice();
  const trackJobInLab = useTrackJobInLab();
  const { engineReady, online, capabilities } = useSidecarStatus();
  const location = useLocation();
  const navState = (location.state ?? {}) as PredictLocationState;

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

  // Predict stays mounted under LabKeepAliveHost on every work route. Only
  // bounce Home when the user is actually looking at Predict and focus forbids it —
  // otherwise changing focus on Projects (→ training) would yank the shell to /.
  useEffect(() => {
    if (!isPredictPath(location.pathname)) return;
    if (predictNavInactiveForWorkspace(workspace)) {
      navigate("/", { replace: true });
    }
  }, [navigate, workspace, location.pathname]);

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

  const {
    activeTab,
    setActiveTab,
    setActiveTabState,
    analysisTabHint,
    setAnalysisTabHint,
    draftSettings,
    setDraftSettings,
    modelSettingsOpen,
    setModelSettingsOpen,
    queueViewFilter,
    setQueueViewFilter,
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    draftSettingsRef,
    profilesRef,
    activeProfileIdRef,
    presetModelGuardRef,
    seenProjectIdRef,
    saveAsOpen,
    setSaveAsOpen,
    filterSettings,
    setFilterSettings,
    models,
    predictMountedRef,
    queueRef,
    lastLimitsProjectRef,
    modelsAvailable,
    applyDraftChange,
    handleSettingsChange,
    modelId,
    predictChannel,
    modelLabelName,
    modelClasses,
    orcaiParameter,
  } = usePredictPageLocalState({
    navState,
    queue,
    syncQueue,
    workspace,
    online,
    capabilities,
    active,
  });

  const { recordingTableRows, recordingTableError } = usePredictRecordingTable({
    projectId: activeProject?.id ?? workspace.activeProjectId,
    online,
    notifyHeaderError,
  });

  const {
    batchRunning,
    batchProgress,
    startBatch,
    updateBatchProgress,
    endBatch,
  } = usePredictBatch();

  const { dialog: overwriteDialog, askFileOverwrite, askBatchOverwrite } =
    usePredictOverwriteDialog();

  const { filterSubmitting, onRunFilter } = usePredictFilterRun({
    queue,
    queueRef,
    setQueue,
    setError,
    recordingTableRows,
    predictChannel,
    modelId,
    modelLabelName,
    filterSettings,
    labelSuffix: draftSettings.labelSuffix.trim(),
    askFileOverwrite,
    trackJobInLab,
  });

  const running = runningPredictFile(queue);
  const orcaiReady = engineReady;
  const recordingTablePath =
    activeProject?.recording_table_path?.trim() ||
    projectSummary?.recording_table.path?.trim() ||
    "";
  const { runBatchRecognition, onBatchCancel } = usePredictBatchRun({
    queue,
    setQueue,
    setError,
    draftSettings,
    models,
    orcaiReady,
    predictTableBlocked,
    recordingTablePath,
    recordingTableRows,
    predictMountedRef,
    askFileOverwrite,
    askBatchOverwrite,
    trackJobInLab,
    startBatch,
    updateBatchProgress,
    endBatch,
    notifySaved,
    notifyHeaderError,
    dismissHeaderError,
    setAnalysisTabHint,
  });

  const { onSelectActive, onToggleBatchSelect } = usePredictPageActions({
    queueRef,
    syncQueue,
    selectActiveInQueue,
  });

  const {
    channelForFile,
    activeChannel,
    filterSourcePath,
    filterSources,
    filterTrackSource,
    filterTrackChannel,
    filterLimitsPath,
    onSelectPredictedPath,
  } = usePredictFilterDerived({
    queue,
    active,
    recordingTableRows,
    predictChannel,
    modelId,
    modelLabelName,
    draftSettings,
    workspaceProjectDir: workspace.projectDir,
    workspaceProjectName: workspace.projectName,
    onSelectActive,
  });

  const {
    selectedFileNames,
    runnableCount,
    runnableFiles,
    queueReady,
    channelCollision,
    sharedOutputMultiFile,
    cliPreviewLine,
    queueBusy,
    resultsEnabled,
    filterTabEnabled,
    projectDisplayName,
  } = usePredictRunDerived({
    queue,
    queueUnavailable,
    queueLoading,
    draftSettings,
    recordingTableRows,
    recordingTablePath,
    modelId,
    models,
    orcaiReady,
    batchRunning,
    importingWavs,
    workspaceProjectName: workspace.projectName,
  });

  const {
    exportingResults,
    exportAudacityOpen,
    setExportAudacityOpen,
    resultsDetectionCount,
    spectrogramLabelOverride,
    setSpectrogramLabelOverride,
    analysisLabelKind,
    setAnalysisLabelKind,
    analysisFocus,
    setAnalysisFocus,
    resultsSpectrogramResolvedLabel,
    analysisLabelSource,
    onResultsDetectionTotalChange,
    resultsExportableFiles,
    resultsDoneFileCount,
    runAudacityExport,
    resultsTabBadgeCount,
  } = usePredictAnalysisResults({
    t,
    queue,
    active,
    activeChannel,
    modelId,
    modelLabelName,
    predictChannel,
    orcaiParameter,
    navWavPath: navState.wavPath,
    navLabelPath: navState.labelPath,
    notifySaved,
    setError,
  });

  const { navWavMatchedRef } = usePredictLocationNav({
    location,
    activePath: active?.path,
    activeName: active?.name,
    draftSettingsRef,
    setDraftSettings,
    setActiveTabState,
    setSpectrogramLabelOverride,
    setAnalysisLabelKind,
    setAnalysisFocus,
    presetModelGuardRef,
  });

  usePredictShellMetaBridge({
    activeTab,
    draftModel: draftSettings.model,
    modelSettingsOpen,
    setModelSettingsOpen,
    projectDisplayName,
  });

  usePredictWorkspaceModelSync({
    draftSettings,
    draftSettingsRef,
    setDraftSettings,
    profilesRef,
    activeProfileIdRef,
    presetModelGuardRef,
    seenProjectIdRef,
    workspaceActiveProjectId: workspace.activeProjectId,
  });

  const {
    projectProfiles,
    presetDirty,
    savePreset,
    onSelectPreset,
  } = usePredictSettingsProfiles({
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    draftSettings,
    draftSettingsRef,
    profilesRef,
    activeProfileIdRef,
    presetModelGuardRef,
    workspaceActiveProjectId: workspace.activeProjectId,
    setSaveAsOpen,
    applyDraftChange,
  });

  const { tabs } = usePredictTabsNav({
    t,
    activeTab,
    setActiveTabState,
    queueReady,
    resultsEnabled,
    filterTabEnabled,
    queueLoading,
    orcaiReady,
    batchRunning,
    resultsTabBadgeCount,
    analysisTabHint,
  });

  return {
    navigate,
    trackJobInLab,
    location,
    navState,
    exportingResults,
    exportAudacityOpen,
    setExportAudacityOpen,
    resultsDetectionCount,
    predictTableBlocked,
    activeTab,
    setActiveTab,
    draftSettings,
    modelSettingsOpen,
    setModelSettingsOpen,
    queueViewFilter,
    setQueueViewFilter,
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    draftSettingsRef,
    profilesRef,
    activeProfileIdRef,
    presetModelGuardRef,
    seenProjectIdRef,
    saveAsOpen,
    setSaveAsOpen,
    filterSettings,
    setFilterSettings,
    models,
    predictMountedRef,
    queueRef,
    lastLimitsProjectRef,
    navWavMatchedRef,
    spectrogramLabelOverride,
    setSpectrogramLabelOverride,
    analysisLabelKind,
    analysisFocus,
    modelId,
    predictChannel,
    modelLabelName,
    running,
    orcaiReady,
    recordingTablePath,
    modelsAvailable,
    onSelectActive,
    applyDraftChange,
    handleSettingsChange,
    channelForFile,
    activeChannel,
    modelClasses,
    orcaiParameter,
    filterSourcePath,
    filterSources,
    filterTrackSource,
    filterTrackChannel,
    filterLimitsPath,
    onSelectPredictedPath,
    selectedFileNames,
    runnableCount,
    projectProfiles,
    presetDirty,
    runnableFiles,
    queueReady,
    channelCollision,
    sharedOutputMultiFile,
    cliPreviewLine,
    queueBusy,
    resultsEnabled,
    filterTabEnabled,
    resultsSpectrogramResolvedLabel,
    analysisLabelSource,
    onResultsDetectionTotalChange,
    resultsExportableFiles,
    resultsDoneFileCount,
    runAudacityExport,
    resultsTabBadgeCount,
    projectDisplayName,
    onToggleBatchSelect,
    tabs,
    savePreset,
    onSelectPreset,
    t,
    notifySaved,
    notifyHeaderError,
    engineReady,
    online,
    capabilities,
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
    selectActiveInQueue,
    onAddWavs,
    projectSummary,
    recordingTableRows,
    recordingTableError,
    batchRunning,
    batchProgress,
    startBatch,
    updateBatchProgress,
    endBatch,
    overwriteDialog,
    askFileOverwrite,
    askBatchOverwrite,
    filterSubmitting,
    onRunFilter,
    runBatchRecognition,
    onBatchCancel,
  };
}

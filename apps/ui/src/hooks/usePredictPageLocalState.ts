import { useEffect, useMemo, useRef, useState } from "react";
import { fetchModels, type OrcaiModel } from "../api/models";
import type { PredictTabId } from "../components/PredictTabs";
import { callsForSelectedModel } from "../lib/classFilterCatalog";
import { joinFsPath } from "../lib/joinFsPath";
import {
  loadPredictActiveTab,
  savePredictActiveTab,
} from "../lib/predictPageSession";
import { resolveModelLabelName } from "../lib/predictQueueUi";
import type { PredictQueueViewFilter } from "../lib/predictQueueStudio";
import type { SidecarCapabilities } from "../api/sidecar";
import {
  draftSettingsForActiveProfile,
  loadActiveModelProfileId,
  loadModelProfiles,
  type ModelProfile,
} from "../workspace/predictModelProfiles";
import {
  applyProjectCallDurationLimits,
  loadFilterSettings,
  saveFilterSettings,
  savePredictSettings,
  type FilterSettings,
  type PredictSettings,
} from "../workspace/predictSettings";
import { persistActiveProjectPredictModel } from "../workspace/project";
import {
  dropCompletedFromPredictSelection,
  ensurePredictSelectionForOverwrite,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";
import { saveWorkspace } from "../workspace/storage";
import { samePresetModel } from "./usePredictSettingsProfiles";
import type { PredictLocationState } from "./usePredictLocationNav";

type WorkspaceSlice = {
  activeProjectId?: string | null;
  projectDir: string | null | undefined;
  projectName: string | null | undefined;
};

type Options = {
  navState: PredictLocationState;
  queue: PredictQueue | null;
  syncQueue: (next: PredictQueue | null) => void;
  workspace: WorkspaceSlice;
  online: boolean;
  capabilities: SidecarCapabilities | null | undefined;
  active: PredictQueueFile | null | undefined;
};

/** Local tab / settings / profile / filter state for Predict page. */
export function usePredictPageLocalState({
  navState,
  queue,
  syncQueue,
  workspace,
  online,
  capabilities,
  active,
}: Options) {
  const [activeTab, setActiveTabState] = useState<PredictTabId>(loadPredictActiveTab);
  const [analysisTabHint, setAnalysisTabHint] = useState(false);

  const setActiveTab = (tab: PredictTabId) => {
    setActiveTabState(tab);
    savePredictActiveTab(tab);
    if (tab === "results") setAnalysisTabHint(false);
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
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(() =>
    loadFilterSettings(),
  );
  const [models, setModels] = useState<OrcaiModel[]>([]);
  const predictMountedRef = useRef(true);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const lastLimitsProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab === "run") setModelSettingsOpen(false);
    if (activeTab === "results") setAnalysisTabHint(false);
  }, [activeTab]);

  const lastOverwriteProjectIdRef = useRef<string | null | undefined>(undefined);

  const clearStickyOverwrite = (projectDir?: string | null) => {
    const orcaiName =
      projectDir && workspace.projectDir === projectDir
        ? workspace.projectName
        : null;
    const next = {
      ...(projectDir
        ? applyProjectCallDurationLimits(
            draftSettingsRef.current,
            projectDir,
            orcaiName,
          )
        : draftSettingsRef.current),
      overwrite: false,
    };
    draftSettingsRef.current = next;
    setDraftSettings(next);
    savePredictSettings(next);
    setFilterSettings((prev) => {
      if (!prev.overwrite) return prev;
      const cleared = { ...prev, overwrite: false };
      saveFilterSettings(cleared);
      return cleared;
    });
  };

  // Clear -ow as soon as the active project id changes (create / switch), even
  // before the predict queue has a projectDir — otherwise a shared preset can
  // restore overwrite after the queue-dir clear, or the clear never runs while
  // queue is briefly null.
  useEffect(() => {
    const nextId = workspace.activeProjectId ?? null;
    if (lastOverwriteProjectIdRef.current === undefined) {
      lastOverwriteProjectIdRef.current = nextId;
      return;
    }
    if (lastOverwriteProjectIdRef.current === nextId) return;
    lastOverwriteProjectIdRef.current = nextId;
    clearStickyOverwrite(queue?.projectDir ?? workspace.projectDir ?? null);
    // clearStickyOverwrite closes over latest queue/workspace; only re-run on id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.activeProjectId]);

  useEffect(() => {
    if (!queue?.projectDir) return;
    if (queue.projectDir === lastLimitsProjectRef.current) return;
    lastLimitsProjectRef.current = queue.projectDir;
    // Force overwrite off on every project attach/switch. Settings are global, so
    // a previous project's -ow must not stick (apply* may early-return when the
    // CDL stamp already matches this dir).
    clearStickyOverwrite(queue.projectDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.projectDir, workspace.projectDir, workspace.projectName]);

  const modelsAvailable = online && capabilities?.orcai_installed === true;

  useEffect(() => {
    if (!modelsAvailable) return;
    void fetchModels(workspace.projectDir ?? undefined)
      .then(setModels)
      .catch(() => {
        setModels(capabilities?.builtin_models ?? []);
      });
  }, [modelsAvailable, workspace.projectDir, capabilities?.builtin_models]);

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

  const modelId = draftSettings.model;
  const predictChannel = Math.max(1, Math.floor(draftSettings.channel) || 1);
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

  return {
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
    setModels,
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
  };
}

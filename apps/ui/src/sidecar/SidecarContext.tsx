import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clearAllJobs } from "../api/jobs";
import type {
  EngineProgressStage,
  SidecarCapabilities,
  SidecarHealth,
} from "../api/sidecar";
import {
  computeRuntimeProgressPercent,
  deriveRuntimeStep,
  runtimeStatusMessageKey,
  type RuntimeStep,
  type SidecarBootStage,
} from "../lib/runtimeProgress";
import { usePreferences } from "../preferences/PreferencesContext";
import { isDevUiPreviewUnlock } from "../lib/appAccess";
import { silentCatch } from "../lib/silentCatch";
import {
  progressForEngine,
  progressForSidecar,
  startingProgress,
} from "./useSidecarProgressHelpers";
import { useRuntimeLifecycle } from "./useRuntimeLifecycle";
import { useSidecarPortAndCapabilities } from "./useSidecarPortAndCapabilities";
import { useSidecarHealthPolling } from "./useSidecarHealthPolling";
import { useSidecarProcessControl } from "./useSidecarProcessControl";
import type { ServicePhase, SidecarContextValue } from "./sidecarTypes";

export type { ServicePhase, SidecarContextValue, RuntimeStep } from "./sidecarTypes";

const SidecarContext = createContext<SidecarContextValue | null>(null);

export function SidecarProvider({ children }: { children: ReactNode }) {
  const {
    computeDevice,
    runtimeAutostart,
    ready: prefsReady,
    spectrogramCacheDir,
    jobLogsDir,
    persistJobLogs,
  } = usePreferences();
  const [online, setOnline] = useState(false);
  const [sidecarPort, setSidecarPort] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] =
    useState<SidecarHealth["engine"] | null>(null);
  const [capabilities, setCapabilities] = useState<SidecarCapabilities | null>(
    null,
  );
  const [sidecarPhase, setSidecarPhase] = useState<ServicePhase>("stopped");
  const [enginePhase, setEnginePhase] = useState<ServicePhase>("stopped");
  const [lastError, setLastError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sidecarBootProgress, setSidecarBootProgress] = useState<number | null>(
    null,
  );
  const [sidecarBootStage, setSidecarBootStage] =
    useState<SidecarBootStage | null>(null);
  const [engineStage, setEngineStage] = useState<EngineProgressStage | null>(
    null,
  );
  const [engineProgressApi, setEngineProgressApi] = useState<number | null>(
    null,
  );
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchestratingStep, setOrchestratingStep] =
    useState<RuntimeStep | null>(null);
  const [gracefulRuntimeRestart, setGracefulRuntimeRestart] = useState(false);

  const sidecarPhaseRef = useRef(sidecarPhase);
  const enginePhaseRef = useRef(enginePhase);
  const onlineRef = useRef(online);
  const engineRef = useRef(engineStatus);
  const healthFailStreakRef = useRef(0);
  const prevEngineRef = useRef<SidecarHealth["engine"] | null>(null);
  const capabilitiesCacheRef = useRef<SidecarCapabilities | null>(null);
  const capabilitiesFetchedAtRef = useRef(0);

  const orchestratingRef = useRef(orchestrating);
  const persistClearedRef = useRef(false);
  const userStartedRuntimeRef = useRef(false);
  orchestratingRef.current = orchestrating;

  sidecarPhaseRef.current = sidecarPhase;
  enginePhaseRef.current = enginePhase;
  onlineRef.current = online;
  engineRef.current = engineStatus;

  const {
    clearCapabilitiesCache,
    applySidecarPort,
    resetSidecarPort,
    syncSidecarPortFromHost,
    loadCapabilities,
    resetRuntimeUiState,
    markSidecarOffline,
  } = useSidecarPortAndCapabilities({
    setSidecarPort,
    setCapabilities,
    setOnline,
    setEngineStatus,
    setSidecarBootProgress,
    setSidecarBootStage,
    setEngineStage,
    setEngineProgressApi,
    setSidecarPhase,
    setEnginePhase,
    setOrchestrating,
    setOrchestratingStep,
    capabilitiesCacheRef,
    capabilitiesFetchedAtRef,
    sidecarPhaseRef,
    enginePhaseRef,
    onlineRef,
    engineRef,
    prevEngineRef,
    healthFailStreakRef,
    userStartedRuntimeRef,
  });

  const { refresh } = useSidecarHealthPolling({
    applySidecarPort,
    syncSidecarPortFromHost,
    loadCapabilities,
    clearCapabilitiesCache,
    markSidecarOffline,
    resetRuntimeUiState,
    setOnline,
    setEngineStatus,
    setSidecarBootProgress,
    setSidecarBootStage,
    setEngineStage,
    setEngineProgressApi,
    setSidecarPhase,
    setEnginePhase,
    setCapabilities,
    setLastError,
    userStartedRuntimeRef,
    orchestratingRef,
    sidecarPhaseRef,
    enginePhaseRef,
    onlineRef,
    engineRef,
    prevEngineRef,
    healthFailStreakRef,
    capabilitiesCacheRef,
  });

  useEffect(() => {
    if (sidecarPhase !== "starting" && enginePhase !== "starting") return;
    // 500ms is enough for boot progress UI; avoids 4 Hz Provider re-renders.
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [sidecarPhase, enginePhase]);

  useEffect(() => {
    if (!online) {
      persistClearedRef.current = false;
      return;
    }
    if (persistClearedRef.current) return;
    persistClearedRef.current = true;
    if (!persistJobLogs) {
      void clearAllJobs().catch(silentCatch("clearJobsOnPersistOff"));
    }
  }, [online, persistJobLogs]);

  const { startSidecar, stopSidecar } = useSidecarProcessControl({
    spectrogramCacheDir,
    jobLogsDir,
    engineStatus,
    clearCapabilitiesCache,
    resetSidecarPort,
    setLastError,
    setSidecarPhase,
    setEnginePhase,
    setOnline,
    setEngineStatus,
    setSidecarBootProgress,
    setSidecarBootStage,
    setEngineStage,
    setEngineProgressApi,
    userStartedRuntimeRef,
    sidecarPhaseRef,
    enginePhaseRef,
    onlineRef,
    engineRef,
    prevEngineRef,
    healthFailStreakRef,
  });

  const {
    startAll,
    stopAll,
    startEngineService,
    stopEngineService,
    restartRuntimeForComputeDevice,
  } = useRuntimeLifecycle({
    computeDevice,
    prefsReady,
    runtimeAutostart,
    startSidecar,
    stopSidecar,
    applySidecarPort,
    refresh,
    loadCapabilities,
    clearCapabilitiesCache,
    setLastError,
    setOrchestrating,
    setOrchestratingStep,
    setGracefulRuntimeRestart,
    setEnginePhase,
    setSidecarPhase,
    setEngineStatus,
    userStartedRuntimeRef,
    orchestratingRef,
    onlineRef,
    engineRef,
    sidecarPhaseRef,
    enginePhaseRef,
    capabilitiesCacheRef,
    prevEngineRef,
  });

  const engineReady =
    online &&
    sidecarPhase === "running" &&
    enginePhase === "running" &&
    engineStatus === "ready" &&
    capabilities?.orcai_installed === true;

  const sectionsAccessible = engineReady || gracefulRuntimeRestart;

  let sidecarProgress = progressForSidecar(sidecarPhase);
  let engineProgress = progressForEngine(enginePhase, engineStatus);

  if (sidecarBootProgress != null && sidecarPhase === "starting") {
    sidecarProgress = Math.round(sidecarBootProgress * 100);
  } else if (sidecarPhase === "starting") {
    sidecarProgress = startingProgress(tick);
  }
  if (
    engineProgressApi != null &&
    (enginePhase === "starting" || engineStatus === "warming")
  ) {
    engineProgress = Math.round(engineProgressApi * 100);
  } else if (enginePhase === "starting" || engineStatus === "warming") {
    engineProgress = startingProgress(tick + 7);
  }

  const runtimeStep = deriveRuntimeStep({
    orchestrating,
    orchestratingStep,
    sidecarPhase,
    enginePhase,
    online,
    engineReady,
    engineStatus,
  });

  const runtimeProgress = computeRuntimeProgressPercent({
    online,
    engineReady,
    sidecarPhase,
    enginePhase,
    orchestrating,
    engineStatus,
    sidecarBootProgress,
    engineProgress: engineProgressApi,
  });

  const runtimeStatusKey = runtimeStatusMessageKey({
    runtimeStep,
    sidecarBootStage,
    engineStage,
  });

  const value = useMemo<SidecarContextValue>(() => {
    const preview = isDevUiPreviewUnlock();
    return {
      online: preview || online,
      sidecarPort,
      engineReady: preview || engineReady,
      engineStatus,
      engineStage,
      capabilities,
      sidecarPhase:
        preview && sidecarPhase === "stopped" ? "running" : sidecarPhase,
      enginePhase:
        preview && enginePhase === "stopped" ? "running" : enginePhase,
      sidecarProgress,
      engineProgress,
      runtimeStep: preview ? "ready" : runtimeStep,
      runtimeProgress: preview ? 100 : runtimeProgress,
      runtimeStatusKey: preview ? "runtime.status.ready" : runtimeStatusKey,
      gracefulRuntimeRestart,
      sectionsAccessible: preview || sectionsAccessible,
      lastError,
      startSidecar,
      stopSidecar,
      startEngineService,
      restartRuntimeForComputeDevice,
      stopEngineService,
      startAll,
      stopAll,
      refresh,
    };
  }, [
    online,
    sidecarPort,
    engineReady,
    engineStatus,
    engineStage,
    capabilities,
    sidecarPhase,
    enginePhase,
    sidecarProgress,
    engineProgress,
    runtimeStep,
    runtimeProgress,
    runtimeStatusKey,
    gracefulRuntimeRestart,
    sectionsAccessible,
    lastError,
    startSidecar,
    stopSidecar,
    startEngineService,
    restartRuntimeForComputeDevice,
    stopEngineService,
    startAll,
    stopAll,
    refresh,
  ]);

  return (
    <SidecarContext.Provider value={value}>{children}</SidecarContext.Provider>
  );
}

export function useSidecarStatus(): SidecarContextValue {
  const ctx = useContext(SidecarContext);
  if (!ctx) {
    throw new Error("useSidecarStatus must be used within SidecarProvider");
  }
  return ctx;
}

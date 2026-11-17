import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  invokeSidecarGetPort,
  invokeSidecarIsRunning,
} from "../api/sidecarControl";
import {
  clearSidecarBase,
  fetchSidecarCapabilities,
  setSidecarBaseFromPort,
  type EngineProgressStage,
  type SidecarCapabilities,
  type SidecarHealth,
} from "../api/sidecar";
import type { SidecarBootStage } from "../lib/runtimeProgress";
import { silentCatch } from "../lib/silentCatch";
import type { RuntimeStep } from "../lib/runtimeProgress";
import type { ServicePhase } from "./sidecarTypes";

const CAPABILITIES_STALE_MS = 120_000;

export type SidecarPortAndCapabilitiesOptions = {
  setSidecarPort: Dispatch<SetStateAction<number | null>>;
  setCapabilities: Dispatch<SetStateAction<SidecarCapabilities | null>>;
  setOnline: Dispatch<SetStateAction<boolean>>;
  setEngineStatus: Dispatch<SetStateAction<SidecarHealth["engine"] | null>>;
  setSidecarBootProgress: Dispatch<SetStateAction<number | null>>;
  setSidecarBootStage: Dispatch<SetStateAction<SidecarBootStage | null>>;
  setEngineStage: Dispatch<SetStateAction<EngineProgressStage | null>>;
  setEngineProgressApi: Dispatch<SetStateAction<number | null>>;
  setSidecarPhase: Dispatch<SetStateAction<ServicePhase>>;
  setEnginePhase: Dispatch<SetStateAction<ServicePhase>>;
  setOrchestrating: Dispatch<SetStateAction<boolean>>;
  setOrchestratingStep: Dispatch<SetStateAction<RuntimeStep | null>>;
  capabilitiesCacheRef: MutableRefObject<SidecarCapabilities | null>;
  capabilitiesFetchedAtRef: MutableRefObject<number>;
  sidecarPhaseRef: MutableRefObject<ServicePhase>;
  enginePhaseRef: MutableRefObject<ServicePhase>;
  onlineRef: MutableRefObject<boolean>;
  engineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  prevEngineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  healthFailStreakRef: MutableRefObject<number>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
};

/**
 * Port binding, capabilities cache, and offline / full UI reset helpers.
 */
export function useSidecarPortAndCapabilities(
  opts: SidecarPortAndCapabilitiesOptions,
) {
  const {
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
  } = opts;

  const clearCapabilitiesCache = useCallback(() => {
    capabilitiesCacheRef.current = null;
    capabilitiesFetchedAtRef.current = 0;
    setCapabilities(null);
  }, [capabilitiesCacheRef, capabilitiesFetchedAtRef, setCapabilities]);

  const applySidecarPort = useCallback(
    (port: number) => {
      setSidecarBaseFromPort(port);
      setSidecarPort(port);
    },
    [setSidecarPort],
  );

  const resetSidecarPort = useCallback(() => {
    clearSidecarBase();
    setSidecarPort(null);
  }, [setSidecarPort]);

  const syncSidecarPortFromHost = useCallback(async () => {
    try {
      const running = await invokeSidecarIsRunning();
      if (!running) return;
      const port = await invokeSidecarGetPort();
      if (port != null) {
        applySidecarPort(port);
      }
    } catch (err) {
      silentCatch("syncSidecarPort")(err);
    }
  }, [applySidecarPort]);

  const loadCapabilities = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (
        !force &&
        capabilitiesCacheRef.current &&
        now - capabilitiesFetchedAtRef.current < CAPABILITIES_STALE_MS
      ) {
        setCapabilities(capabilitiesCacheRef.current);
        return capabilitiesCacheRef.current;
      }
      const caps = await fetchSidecarCapabilities();
      if (caps) {
        capabilitiesCacheRef.current = caps;
        capabilitiesFetchedAtRef.current = now;
        setCapabilities(caps);
      }
      return caps;
    },
    [capabilitiesCacheRef, capabilitiesFetchedAtRef, setCapabilities],
  );

  const resetRuntimeUiState = useCallback(() => {
    setOnline(false);
    setEngineStatus(null);
    resetSidecarPort();
    clearCapabilitiesCache();
    setSidecarBootProgress(null);
    setSidecarBootStage(null);
    setEngineStage(null);
    setEngineProgressApi(null);
    setSidecarPhase("stopped");
    setEnginePhase("stopped");
    setOrchestrating(false);
    setOrchestratingStep(null);
    prevEngineRef.current = null;
    healthFailStreakRef.current = 0;
    userStartedRuntimeRef.current = false;
  }, [
    clearCapabilitiesCache,
    healthFailStreakRef,
    prevEngineRef,
    resetSidecarPort,
    setEnginePhase,
    setEngineProgressApi,
    setEngineStage,
    setEngineStatus,
    setOnline,
    setOrchestrating,
    setOrchestratingStep,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    userStartedRuntimeRef,
  ]);

  const markSidecarOffline = useCallback(() => {
    setOnline(false);
    onlineRef.current = false;
    setEngineStatus(null);
    engineRef.current = null;
    resetSidecarPort();
    clearCapabilitiesCache();
    setSidecarBootProgress(null);
    setSidecarBootStage(null);
    setEngineStage(null);
    setEngineProgressApi(null);
    if (
      sidecarPhaseRef.current !== "starting" &&
      sidecarPhaseRef.current !== "stopping" &&
      sidecarPhaseRef.current !== "error"
    ) {
      setSidecarPhase("stopped");
    }
    if (
      enginePhaseRef.current !== "starting" &&
      enginePhaseRef.current !== "stopping"
    ) {
      setEnginePhase("stopped");
    }
  }, [
    clearCapabilitiesCache,
    enginePhaseRef,
    engineRef,
    onlineRef,
    resetSidecarPort,
    setEnginePhase,
    setEngineProgressApi,
    setEngineStage,
    setEngineStatus,
    setOnline,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    sidecarPhaseRef,
  ]);

  return {
    clearCapabilitiesCache,
    applySidecarPort,
    resetSidecarPort,
    syncSidecarPortFromHost,
    loadCapabilities,
    resetRuntimeUiState,
    markSidecarOffline,
  };
}

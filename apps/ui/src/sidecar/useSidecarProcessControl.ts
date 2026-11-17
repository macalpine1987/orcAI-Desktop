import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { stopEngine } from "../api/engineControl";
import {
  invokeSidecarStart,
  invokeSidecarStop,
} from "../api/sidecarControl";
import type {
  EngineProgressStage,
  SidecarHealth,
} from "../api/sidecar";
import type { SidecarBootStage } from "../lib/runtimeProgress";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";
import { silentCatch } from "../lib/silentCatch";
import type { ServicePhase } from "./sidecarTypes";

export type SidecarProcessControlOptions = {
  spectrogramCacheDir: string;
  jobLogsDir: string;
  engineStatus: SidecarHealth["engine"] | null;
  clearCapabilitiesCache: () => void;
  resetSidecarPort: () => void;
  setLastError: Dispatch<SetStateAction<string | null>>;
  setSidecarPhase: Dispatch<SetStateAction<ServicePhase>>;
  setEnginePhase: Dispatch<SetStateAction<ServicePhase>>;
  setOnline: Dispatch<SetStateAction<boolean>>;
  setEngineStatus: Dispatch<SetStateAction<SidecarHealth["engine"] | null>>;
  setSidecarBootProgress: Dispatch<SetStateAction<number | null>>;
  setSidecarBootStage: Dispatch<SetStateAction<SidecarBootStage | null>>;
  setEngineStage: Dispatch<SetStateAction<EngineProgressStage | null>>;
  setEngineProgressApi: Dispatch<SetStateAction<number | null>>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
  sidecarPhaseRef: MutableRefObject<ServicePhase>;
  enginePhaseRef: MutableRefObject<ServicePhase>;
  onlineRef: MutableRefObject<boolean>;
  engineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  prevEngineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  healthFailStreakRef: MutableRefObject<number>;
};

/**
 * Low-level sidecar process start/stop. Syncs online/phase refs immediately on
 * stop so same-turn stopAll→startAll (v0.1.9) does not see stale state.
 */
export function useSidecarProcessControl(opts: SidecarProcessControlOptions) {
  const {
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
  } = opts;

  const startSidecar = useCallback(async () => {
    setLastError(null);
    userStartedRuntimeRef.current = true;
    setSidecarPhase("starting");
    sidecarPhaseRef.current = "starting";
    setSidecarBootProgress(0.05);
    setSidecarBootStage("spawning");
    healthFailStreakRef.current = 0;
    try {
      await invokeSidecarStart({
        port: null,
        specCacheDir: spectrogramCacheDir.trim() || null,
        jobLogsDir: jobLogsDir.trim() || null,
      });
    } catch (err) {
      userStartedRuntimeRef.current = false;
      setSidecarPhase("error");
      setLastError(formatUserFacingErrorI18n(err));
      throw err;
    }
  }, [
    healthFailStreakRef,
    jobLogsDir,
    setLastError,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    sidecarPhaseRef,
    spectrogramCacheDir,
    userStartedRuntimeRef,
  ]);

  const stopSidecar = useCallback(async () => {
    setLastError(null);
    setSidecarPhase("stopping");
    sidecarPhaseRef.current = "stopping";
    try {
      if (enginePhaseRef.current === "running" || engineStatus === "ready") {
        try {
          await stopEngine();
        } catch (err) {
          silentCatch("stopEngineBeforeSidecar")(err);
        }
      }
      await invokeSidecarStop();
      // Sync refs immediately — restartAll calls startAll in the same turn,
      // before React re-renders and would otherwise see stale online/ready.
      setOnline(false);
      onlineRef.current = false;
      setEngineStatus(null);
      engineRef.current = null;
      resetSidecarPort();
      clearCapabilitiesCache();
      setEnginePhase("stopped");
      enginePhaseRef.current = "stopped";
      setSidecarPhase("stopped");
      sidecarPhaseRef.current = "stopped";
      setSidecarBootProgress(null);
      setSidecarBootStage(null);
      setEngineStage(null);
      setEngineProgressApi(null);
      prevEngineRef.current = null;
      userStartedRuntimeRef.current = false;
    } catch (err) {
      setSidecarPhase("error");
      sidecarPhaseRef.current = "error";
      setLastError(formatUserFacingErrorI18n(err));
      throw err;
    }
  }, [
    clearCapabilitiesCache,
    enginePhaseRef,
    engineRef,
    engineStatus,
    onlineRef,
    prevEngineRef,
    resetSidecarPort,
    setEnginePhase,
    setEngineProgressApi,
    setEngineStage,
    setEngineStatus,
    setLastError,
    setOnline,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    sidecarPhaseRef,
    userStartedRuntimeRef,
  ]);

  return { startSidecar, stopSidecar };
}

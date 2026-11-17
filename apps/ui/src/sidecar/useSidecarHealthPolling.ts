import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  invokeSidecarIsRunning,
  invokeSidecarStop,
} from "../api/sidecarControl";
import {
  clearSidecarBase,
  fetchSidecarHealth,
  getSidecarPortFromBase,
  type EngineProgressStage,
  type SidecarCapabilities,
  type SidecarHealth,
} from "../api/sidecar";
import type { SidecarBootStage } from "../lib/runtimeProgress";
import { isMainShellWindow } from "../platform/shellWindow";
import { silentCatch } from "../lib/silentCatch";
import type { ServicePhase } from "./sidecarTypes";
import { applyHealthSnapshot } from "./applyHealthSnapshot";
import {
  HEALTH_FAIL_THRESHOLD,
  useSidecarTauriListeners,
} from "./useSidecarTauriListeners";
import { HEALTH_POLL_BUSY_MS } from "../lib/pollIntervals";

/** Boot / busy health poll interval (keep in sync with runtime contract). */
export const BOOT_POLL_MS = 750;
if (BOOT_POLL_MS !== HEALTH_POLL_BUSY_MS) {
  throw new Error("BOOT_POLL_MS drifted from HEALTH_POLL_BUSY_MS");
}

export type SidecarHealthPollingOptions = {
  applySidecarPort: (port: number) => void;
  syncSidecarPortFromHost: () => Promise<void>;
  loadCapabilities: (force?: boolean) => Promise<SidecarCapabilities | null>;
  clearCapabilitiesCache: () => void;
  markSidecarOffline: () => void;
  resetRuntimeUiState: () => void;
  setOnline: Dispatch<SetStateAction<boolean>>;
  setEngineStatus: Dispatch<SetStateAction<SidecarHealth["engine"] | null>>;
  setSidecarBootProgress: Dispatch<SetStateAction<number | null>>;
  setSidecarBootStage: Dispatch<SetStateAction<SidecarBootStage | null>>;
  setEngineStage: Dispatch<SetStateAction<EngineProgressStage | null>>;
  setEngineProgressApi: Dispatch<SetStateAction<number | null>>;
  setSidecarPhase: Dispatch<SetStateAction<ServicePhase>>;
  setEnginePhase: Dispatch<SetStateAction<ServicePhase>>;
  setCapabilities: Dispatch<SetStateAction<SidecarCapabilities | null>>;
  setLastError: Dispatch<SetStateAction<string | null>>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
  orchestratingRef: MutableRefObject<boolean>;
  sidecarPhaseRef: MutableRefObject<ServicePhase>;
  enginePhaseRef: MutableRefObject<ServicePhase>;
  onlineRef: MutableRefObject<boolean>;
  engineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  prevEngineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  healthFailStreakRef: MutableRefObject<number>;
  capabilitiesCacheRef: MutableRefObject<SidecarCapabilities | null>;
};

/**
 * Health refresh, adaptive poll loop, and Tauri sidecar event listeners.
 * Also attaches child windows to a live Lab runtime and stops orphan sidecars
 * on the main shell at mount.
 */
export function useSidecarHealthPolling(opts: SidecarHealthPollingOptions) {
  const {
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
  } = opts;

  const refresh = useCallback(async () => {
    const runtimeManaged =
      userStartedRuntimeRef.current ||
      orchestratingRef.current ||
      sidecarPhaseRef.current === "starting" ||
      sidecarPhaseRef.current === "running" ||
      sidecarPhaseRef.current === "stopping" ||
      enginePhaseRef.current === "starting" ||
      enginePhaseRef.current === "running" ||
      enginePhaseRef.current === "stopping";

    if (!runtimeManaged) {
      if (onlineRef.current) {
        markSidecarOffline();
      }
      return;
    }

    // Health only with a bound runtimeBase — never the unbound default port.
    if (!getSidecarPortFromBase()) {
      try {
        const running = await invokeSidecarIsRunning();
        if (running) {
          await syncSidecarPortFromHost();
        }
      } catch (err) {
        silentCatch("refreshPortProbe")(err);
      }
      if (!getSidecarPortFromBase()) {
        return;
      }
    }

    const health = await fetchSidecarHealth();
    if (!health) {
      healthFailStreakRef.current += 1;
      if (healthFailStreakRef.current < HEALTH_FAIL_THRESHOLD) {
        return;
      }
      try {
        const stillRunning = await invokeSidecarIsRunning();
        if (stillRunning) {
          await syncSidecarPortFromHost();
          return;
        }
      } catch (err) {
        silentCatch("healthStillRunning")(err);
      }
      markSidecarOffline();
      return;
    }

    healthFailStreakRef.current = 0;
    await applyHealthSnapshot({
      health,
      loadCapabilities,
      clearCapabilitiesCache,
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
      capabilitiesCacheRef,
    });
  }, [
    capabilitiesCacheRef,
    clearCapabilitiesCache,
    enginePhaseRef,
    engineRef,
    healthFailStreakRef,
    loadCapabilities,
    markSidecarOffline,
    onlineRef,
    orchestratingRef,
    prevEngineRef,
    setCapabilities,
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
    syncSidecarPortFromHost,
    userStartedRuntimeRef,
  ]);

  useLayoutEffect(() => {
    clearSidecarBase();
    resetRuntimeUiState();
  }, [resetRuntimeUiState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Child windows (train-monitor) must attach to the Lab runtime — never
      // treat a live sidecar as an orphan and stop it.
      if (!isMainShellWindow()) {
        try {
          const running = await invokeSidecarIsRunning();
          if (cancelled) return;
          if (running) {
            userStartedRuntimeRef.current = true;
            await syncSidecarPortFromHost();
            if (cancelled) return;
            setSidecarPhase("running");
            setEnginePhase("running");
            await refresh();
          }
        } catch (err) {
          silentCatch("childWindowRuntimeAttach")(err);
        }
        return;
      }

      try {
        const running = await invokeSidecarIsRunning();
        if (
          cancelled ||
          userStartedRuntimeRef.current ||
          orchestratingRef.current
        ) {
          return;
        }
        if (running) {
          await invokeSidecarStop();
        }
      } catch (err) {
        silentCatch("orphanSidecarStop")(err);
      }
      // Re-check: startAll / autostart may have begun during the await above.
      if (
        cancelled ||
        userStartedRuntimeRef.current ||
        orchestratingRef.current
      ) {
        return;
      }
      resetRuntimeUiState();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orchestratingRef,
    refresh,
    resetRuntimeUiState,
    setEnginePhase,
    setSidecarPhase,
    syncSidecarPortFromHost,
    userStartedRuntimeRef,
  ]);

  useSidecarTauriListeners({
    refresh,
    applySidecarPort,
    markSidecarOffline,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    setLastError,
    userStartedRuntimeRef,
    orchestratingRef,
    sidecarPhaseRef,
    enginePhaseRef,
    healthFailStreakRef,
  });

  return { refresh };
}

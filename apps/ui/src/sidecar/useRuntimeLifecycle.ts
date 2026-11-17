import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  invokeSidecarEngineStart,
  invokeSidecarGetPort,
  invokeSidecarIsRunning,
} from "../api/sidecarControl";
import {
  getSidecarPortFromBase,
  type SidecarCapabilities,
  type SidecarHealth,
} from "../api/sidecar";
import type { RuntimeStep } from "../lib/runtimeProgress";
import type { ComputeDevice } from "../preferences/storage";
import { isMainShellWindow } from "../platform/shellWindow";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";
import { silentCatch } from "../lib/silentCatch";
import type { ServicePhase } from "./sidecarTypes";
import { waitUntil } from "./runtimeWait";
import { startEngineViaHost } from "./startEngineViaHost";
import { useMainShellClosePolicy } from "./useMainShellClosePolicy";
import { stopEngine } from "../api/engineControl";

export type RuntimeLifecycleOptions = {
  computeDevice: ComputeDevice;
  prefsReady: boolean;
  runtimeAutostart: boolean;
  startSidecar: () => Promise<void>;
  stopSidecar: () => Promise<void>;
  applySidecarPort: (port: number) => void;
  refresh: () => Promise<void>;
  loadCapabilities: (force?: boolean) => Promise<SidecarCapabilities | null>;
  clearCapabilitiesCache: () => void;
  setLastError: Dispatch<SetStateAction<string | null>>;
  setOrchestrating: Dispatch<SetStateAction<boolean>>;
  setOrchestratingStep: Dispatch<SetStateAction<RuntimeStep | null>>;
  setGracefulRuntimeRestart: Dispatch<SetStateAction<boolean>>;
  setEnginePhase: Dispatch<SetStateAction<ServicePhase>>;
  setSidecarPhase: Dispatch<SetStateAction<ServicePhase>>;
  setEngineStatus: Dispatch<SetStateAction<SidecarHealth["engine"] | null>>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
  orchestratingRef: MutableRefObject<boolean>;
  onlineRef: MutableRefObject<boolean>;
  engineRef: MutableRefObject<SidecarHealth["engine"] | null>;
  sidecarPhaseRef: MutableRefObject<ServicePhase>;
  enginePhaseRef: MutableRefObject<ServicePhase>;
  capabilitiesCacheRef: MutableRefObject<SidecarCapabilities | null>;
  prevEngineRef: MutableRefObject<SidecarHealth["engine"] | null>;
};

/**
 * Manual startAll / stopAll, engine start/stop, compute-device restart,
 * opt-in runtimeAutostart, and main-window close policy (hide vs stop_and_close).
 * See docs/RUNTIME_CONTRACT.md.
 */
export function useRuntimeLifecycle(options: RuntimeLifecycleOptions): {
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  startEngineService: (deviceOverride?: ComputeDevice) => Promise<void>;
  stopEngineService: () => Promise<void>;
  restartRuntimeForComputeDevice: (device: ComputeDevice) => Promise<void>;
} {
  const {
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
  } = options;

  const startEngineService = useCallback(
    async (deviceOverride?: ComputeDevice) => {
      setLastError(null);
      if (!onlineRef.current) {
        const running = await invokeSidecarIsRunning();
        if (!running) {
          throw new Error("Start the sidecar first.");
        }
      }
      setEnginePhase("starting");
      try {
        const device = deviceOverride ?? computeDevice;
        // Host HTTP in Tauri — same path as startAll (WKWebView fetch races cold ports).
        await startEngineViaHost(device);
        await refresh();
      } catch (err) {
        setEnginePhase("error");
        setLastError(formatUserFacingErrorI18n(err));
        throw err;
      }
    },
    [computeDevice, onlineRef, refresh, setEnginePhase, setLastError],
  );

  const stopEngineService = useCallback(async () => {
    setLastError(null);
    setEnginePhase("stopping");
    try {
      await stopEngine();
      setEngineStatus("idle");
      setEnginePhase("stopped");
      prevEngineRef.current = "idle";
      clearCapabilitiesCache();
      await refresh();
    } catch (err) {
      setEnginePhase("error");
      setLastError(formatUserFacingErrorI18n(err));
      throw err;
    }
  }, [
    clearCapabilitiesCache,
    prevEngineRef,
    refresh,
    setEnginePhase,
    setEngineStatus,
    setLastError,
  ]);

  const restartRuntimeForComputeDevice = useCallback(
    async (device: ComputeDevice) => {
      setLastError(null);
      const wasActive =
        onlineRef.current ||
        sidecarPhaseRef.current !== "stopped" ||
        enginePhaseRef.current !== "stopped";
      if (!wasActive) return;

      setOrchestrating(true);
      setGracefulRuntimeRestart(true);
      try {
        if (onlineRef.current) {
          setOrchestratingStep("starting_engine");
          setEnginePhase("stopping");
          await stopEngine();
          clearCapabilitiesCache();
          setEnginePhase("starting");
          await startEngineViaHost(device);
          await waitUntil(async () => {
            await refresh();
            return (
              engineRef.current === "ready" &&
              capabilitiesCacheRef.current?.orcai_installed === true
            );
          }, 600_000);
          setSidecarPhase("running");
          setEnginePhase("running");
          return;
        }

        setOrchestratingStep("stopping");
        await stopSidecar();

        setOrchestratingStep("starting_sidecar");
        setSidecarPhase("starting");
        await startSidecar();

        await waitUntil(async () => {
          try {
            const running = await invokeSidecarIsRunning();
            if (running) {
              const port = await invokeSidecarGetPort();
              if (port != null) applySidecarPort(port);
            }
          } catch (err) {
            silentCatch("runtimeLifecycle")(err);
            // not in Tauri (web-only smoke)
          }
          await refresh();
          return onlineRef.current && getSidecarPortFromBase() != null;
        }, 95_000);

        setOrchestratingStep("starting_engine");
        setSidecarPhase("running");
        setEnginePhase("starting");
        await startEngineViaHost(device);

        await waitUntil(async () => {
          await refresh();
          return (
            engineRef.current === "ready" &&
            capabilitiesCacheRef.current?.orcai_installed === true
          );
        }, 600_000);
      } catch (err) {
        setLastError(formatUserFacingErrorI18n(err));
        if (sidecarPhaseRef.current === "starting") {
          setSidecarPhase("error");
        }
        if (enginePhaseRef.current === "starting") {
          setEnginePhase("error");
        }
        throw err;
      } finally {
        setOrchestrating(false);
        setOrchestratingStep(null);
        setGracefulRuntimeRestart(false);
      }
    },
    [
      applySidecarPort,
      capabilitiesCacheRef,
      clearCapabilitiesCache,
      enginePhaseRef,
      engineRef,
      onlineRef,
      refresh,
      setEnginePhase,
      setGracefulRuntimeRestart,
      setLastError,
      setOrchestrating,
      setOrchestratingStep,
      setSidecarPhase,
      sidecarPhaseRef,
      startSidecar,
      stopSidecar,
    ],
  );

  /** Home Start — see docs/RUNTIME_CONTRACT.md (manual startAll; hide ≠ stop). */
  const startAll = useCallback(async () => {
    setLastError(null);
    userStartedRuntimeRef.current = true;
    setOrchestrating(true);
    orchestratingRef.current = true;
    try {
      // Prefer live host check over React state — restartAll runs stop+start
      // before the next render can flush online/engine refs.
      let sidecarRunning = false;
      try {
        sidecarRunning = await invokeSidecarIsRunning();
      } catch (err) {
        silentCatch("runtimeLifecycle")(err);
        sidecarRunning = onlineRef.current;
      }
      if (!sidecarRunning) {
        setOrchestratingStep("starting_sidecar");
        await startSidecar();
        await waitUntil(async () => {
          try {
            const running = await invokeSidecarIsRunning();
            if (running) {
              const port = await invokeSidecarGetPort();
              if (port != null) applySidecarPort(port);
            }
          } catch (err) {
            silentCatch("runtimeLifecycle")(err);
            /* web-only */
          }
          await refresh();
          return onlineRef.current && getSidecarPortFromBase() != null;
        }, 95_000);
      } else if (getSidecarPortFromBase() == null) {
        try {
          const port = await invokeSidecarGetPort();
          if (port != null) applySidecarPort(port);
        } catch (err) {
          silentCatch("runtimeLifecycle")(err);
          /* web-only */
        }
        await refresh();
      }

      try {
        const port = await invokeSidecarGetPort();
        if (port != null) applySidecarPort(port);
      } catch (err) {
        silentCatch("runtimeLifecycle")(err);
        /* web-only */
      }
      await refresh();
      const ready =
        engineRef.current === "ready" &&
        capabilitiesCacheRef.current?.orcai_installed === true;
      if (!ready) {
        setOrchestratingStep("starting_engine");
        setEnginePhase("starting");
        enginePhaseRef.current = "starting";
        // Host-side HTTP: WKWebView fetch to ephemeral localhost ports was
        // leaving the engine idle after Sidecar came up.
        await invokeSidecarEngineStart(computeDevice);
        await refresh();
        if (engineRef.current !== "ready") {
          await waitUntil(async () => {
            await refresh();
            return engineRef.current === "ready";
          }, 120_000);
        }
        if (!capabilitiesCacheRef.current?.orcai_installed) {
          await loadCapabilities(true);
        }
        if (engineRef.current === "ready") {
          setEnginePhase("running");
          enginePhaseRef.current = "running";
        }
      }
    } catch (err) {
      setLastError(formatUserFacingErrorI18n(err));
      if (sidecarPhaseRef.current === "starting") {
        setSidecarPhase("error");
        sidecarPhaseRef.current = "error";
      }
      if (enginePhaseRef.current === "starting") {
        setEnginePhase("error");
        enginePhaseRef.current = "error";
      }
      throw err;
    } finally {
      setOrchestrating(false);
      orchestratingRef.current = false;
      setOrchestratingStep(null);
    }
  }, [
    applySidecarPort,
    capabilitiesCacheRef,
    computeDevice,
    enginePhaseRef,
    engineRef,
    loadCapabilities,
    onlineRef,
    orchestratingRef,
    refresh,
    setEnginePhase,
    setLastError,
    setOrchestrating,
    setOrchestratingStep,
    setSidecarPhase,
    sidecarPhaseRef,
    startSidecar,
    userStartedRuntimeRef,
  ]);

  const stopAll = useCallback(async () => {
    setOrchestrating(true);
    setOrchestratingStep("stopping");
    try {
      await stopSidecar();
    } finally {
      setOrchestrating(false);
      setOrchestratingStep(null);
      userStartedRuntimeRef.current = false;
    }
  }, [
    setOrchestrating,
    setOrchestratingStep,
    stopSidecar,
    userStartedRuntimeRef,
  ]);

  const autostartAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isMainShellWindow()) return;
    if (!prefsReady || autostartAttemptedRef.current || !runtimeAutostart) return;
    autostartAttemptedRef.current = true;
    void startAll().catch((err) => {
      autostartAttemptedRef.current = false;
      // Surface via SidecarContext lastError when set; still allow retry.
      if (typeof console !== "undefined") {
        console.warn("[runtime] autostart failed", err);
      }
    });
  }, [prefsReady, runtimeAutostart, startAll]);

  useMainShellClosePolicy({
    stopAll,
    onlineRef,
    userStartedRuntimeRef,
  });

  return {
    startAll,
    stopAll,
    startEngineService,
    stopEngineService,
    restartRuntimeForComputeDevice,
  };
}

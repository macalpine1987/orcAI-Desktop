import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startEngine, stopEngine } from "../api/engineControl";
import { clearAllJobs } from "../api/jobs";
import {
  invokeSidecarGetPort,
  invokeSidecarIsRunning,
  invokeSidecarEngineStart,
  invokeSidecarStart,
  invokeSidecarStop,
  isTauriRuntime,
} from "../api/sidecarControl";
import {
  clearSidecarBase,
  fetchSidecarCapabilities,
  fetchSidecarHealth,
  getSidecarPortFromBase,
  setSidecarBaseFromPort,
  type EngineProgressStage,
  type SidecarCapabilities,
  type SidecarHealth,
} from "../api/sidecar";
import {
  computeRuntimeProgressPercent,
  deriveRuntimeStep,
  isEngineProgressStage,
  isSidecarBootStage,
  runtimeStatusMessageKey,
  type RuntimeStep,
  type SidecarBootStage,
} from "../lib/runtimeProgress";
import type { ComputeDevice } from "../preferences/storage";
import { usePreferences } from "../preferences/PreferencesContext";
import { isDevUiPreviewUnlock } from "../lib/appAccess";

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 400,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Operation timed out");
}

const BOOT_POLL_MS = 400;
const IDLE_POLL_MS = 3000;
const HEALTH_FAIL_THRESHOLD = 3;
const CAPABILITIES_STALE_MS = 120_000;

export type ServicePhase =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type { RuntimeStep };

export type SidecarContextValue = {
  online: boolean;
  /** Localhost port chosen for this sidecar session (Tauri only). */
  sidecarPort: number | null;
  engineReady: boolean;
  engineStatus: SidecarHealth["engine"] | null;
  engineStage: EngineProgressStage | null;
  capabilities: SidecarCapabilities | null;
  sidecarPhase: ServicePhase;
  enginePhase: ServicePhase;
  sidecarProgress: number;
  engineProgress: number;
  runtimeStep: RuntimeStep;
  runtimeProgress: number;
  runtimeStatusKey: string;
  /** True during CPU↔GPU restart — work sections stay navigable. */
  gracefulRuntimeRestart: boolean;
  /** Home/Settings/Help always; other sections need engine or graceful restart. */
  sectionsAccessible: boolean;
  lastError: string | null;
  startSidecar: () => Promise<void>;
  stopSidecar: () => Promise<void>;
  startEngineService: (deviceOverride?: ComputeDevice) => Promise<void>;
  /** Restart sidecar + engine so TensorFlow picks up a new CPU/GPU choice. */
  restartRuntimeForComputeDevice: (device: ComputeDevice) => Promise<void>;
  stopEngineService: () => Promise<void>;
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SidecarContext = createContext<SidecarContextValue | null>(null);

function progressForSidecar(phase: ServicePhase): number {
  if (phase === "running") return 100;
  return 0;
}

function progressForEngine(
  phase: ServicePhase,
  engineStatus: SidecarHealth["engine"] | null,
): number {
  if (phase === "running" && engineStatus === "ready") return 100;
  return 0;
}

function startingProgress(tick: number, max = 92): number {
  const step = (tick % 20) * 4;
  return Math.min(max, 12 + step);
}

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

  const clearCapabilitiesCache = useCallback(() => {
    capabilitiesCacheRef.current = null;
    capabilitiesFetchedAtRef.current = 0;
    setCapabilities(null);
  }, []);

  const applySidecarPort = useCallback((port: number) => {
    setSidecarBaseFromPort(port);
    setSidecarPort(port);
  }, []);

  const resetSidecarPort = useCallback(() => {
    clearSidecarBase();
    setSidecarPort(null);
  }, []);

  const syncSidecarPortFromHost = useCallback(async () => {
    try {
      const running = await invokeSidecarIsRunning();
      if (!running) return;
      const port = await invokeSidecarGetPort();
      if (port != null) {
        applySidecarPort(port);
      }
    } catch {
      // not in Tauri or host unavailable
    }
  }, [applySidecarPort]);

  const loadCapabilities = useCallback(async (force = false) => {
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
  }, []);

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
  }, [clearCapabilitiesCache, resetSidecarPort]);

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
  }, [clearCapabilitiesCache, resetSidecarPort]);

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

    if (!getSidecarPortFromBase()) {
      try {
        const running = await invokeSidecarIsRunning();
        if (running) {
          await syncSidecarPortFromHost();
        }
      } catch {
        // not in Tauri (web-only smoke)
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
      } catch {
        // treat as offline below
      }
      markSidecarOffline();
      return;
    }

    healthFailStreakRef.current = 0;
    setOnline(true);
    onlineRef.current = true;

    const engine = health.engine ?? "idle";
    const prevEngine = prevEngineRef.current;
    prevEngineRef.current = engine;
    setEngineStatus(engine);
    engineRef.current = engine;
    if (isEngineProgressStage(health.engine_stage)) {
      setEngineStage(health.engine_stage);
    }
    if (typeof health.engine_progress === "number") {
      setEngineProgressApi(health.engine_progress);
    }
    if (
      sidecarPhaseRef.current === "starting" ||
      sidecarPhaseRef.current === "running"
    ) {
      setSidecarBootProgress(1);
      setSidecarBootStage("ready");
    }

    if (sidecarPhaseRef.current === "starting") {
      setSidecarPhase("running");
      sidecarPhaseRef.current = "running";
    } else if (
      sidecarPhaseRef.current === "stopped" &&
      (userStartedRuntimeRef.current || orchestratingRef.current)
    ) {
      setSidecarPhase("running");
      sidecarPhaseRef.current = "running";
    } else if (
      sidecarPhaseRef.current !== "stopping" &&
      sidecarPhaseRef.current !== "stopped"
    ) {
      setSidecarPhase("running");
      sidecarPhaseRef.current = "running";
    }

    if (engine === "ready") {
      if (sidecarPhaseRef.current !== "stopped") {
        setEnginePhase("running");
        enginePhaseRef.current = "running";
      }
      if (
        sidecarPhaseRef.current !== "stopped" &&
        (prevEngine !== "ready" || !capabilitiesCacheRef.current)
      ) {
        await loadCapabilities(true);
      } else if (sidecarPhaseRef.current !== "stopped") {
        setCapabilities(capabilitiesCacheRef.current);
      }
    } else if (engine === "warming") {
      if (sidecarPhaseRef.current !== "stopped") {
        setEnginePhase("starting");
      }
      if (prevEngine === "ready") {
        clearCapabilitiesCache();
      }
    } else if (engine === "error") {
      setEnginePhase("error");
      setLastError(health.engine_error ?? "Engine error");
      if (prevEngine === "ready") {
        clearCapabilitiesCache();
      }
    } else {
      if (
        enginePhaseRef.current !== "starting" &&
        enginePhaseRef.current !== "stopping"
      ) {
        setEnginePhase("stopped");
      }
      if (prevEngine === "ready") {
        clearCapabilitiesCache();
      } else if (
        health.orcai === "yes" &&
        !capabilitiesCacheRef.current
      ) {
        await loadCapabilities(false);
      }
    }
  }, [
    clearCapabilitiesCache,
    loadCapabilities,
    markSidecarOffline,
    syncSidecarPortFromHost,
  ]);

  useLayoutEffect(() => {
    clearSidecarBase();
    resetRuntimeUiState();
  }, [resetRuntimeUiState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
      } catch {
        // web-only / dev without Tauri host
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
  }, [resetRuntimeUiState]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await refresh();
        if (cancelled) return;
        const busy =
          userStartedRuntimeRef.current ||
          sidecarPhaseRef.current === "starting" ||
          sidecarPhaseRef.current === "stopping" ||
          sidecarPhaseRef.current === "running" ||
          enginePhaseRef.current === "starting" ||
          enginePhaseRef.current === "stopping" ||
          enginePhaseRef.current === "running" ||
          orchestratingRef.current;
        const next = busy ? BOOT_POLL_MS : IDLE_POLL_MS;
        schedule(next);
      }, delayMs);
    };

    schedule(0);

    let disposeSidecarReady: (() => void) | undefined;
    let disposeSidecarFailed: (() => void) | undefined;
    let disposeSidecarExited: (() => void) | undefined;

    let disposeBootProgress: (() => void) | undefined;

    void listen<{ stage?: string; progress?: number }>(
      "sidecar-boot-progress",
      (event) => {
        if (sidecarPhaseRef.current !== "starting") return;
        const stage = event.payload.stage;
        const progress = event.payload.progress;
        if (stage && isSidecarBootStage(stage)) {
          setSidecarBootStage(stage);
        }
        if (typeof progress === "number") {
          setSidecarBootProgress(progress);
        }
      },
    )
      .then((unlisten) => {
        disposeBootProgress = unlisten;
      })
      .catch(() => undefined);

    void listen<{ port?: number }>("sidecar-ready", (event) => {
      if (
        sidecarPhaseRef.current !== "starting" &&
        !orchestratingRef.current &&
        !userStartedRuntimeRef.current
      ) {
        return;
      }
      healthFailStreakRef.current = 0;
      const port = event.payload.port;
      if (typeof port === "number") {
        applySidecarPort(port);
      }
      setSidecarBootStage("ready");
      setSidecarBootProgress(1);
      void refresh();
    })
      .then((unlisten) => {
        disposeSidecarReady = unlisten;
      })
      .catch(() => undefined);

    void listen<string>("sidecar-failed", (event) => {
      setSidecarPhase("error");
      setLastError(event.payload);
      markSidecarOffline();
    })
      .then((unlisten) => {
        disposeSidecarFailed = unlisten;
      })
      .catch(() => undefined);

    void listen<string>("sidecar-exited", (event) => {
      healthFailStreakRef.current = HEALTH_FAIL_THRESHOLD;
      setSidecarPhase("error");
      setLastError(event.payload);
      markSidecarOffline();
    })
      .then((unlisten) => {
        disposeSidecarExited = unlisten;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      disposeBootProgress?.();
      disposeSidecarReady?.();
      disposeSidecarFailed?.();
      disposeSidecarExited?.();
    };
  }, [applySidecarPort, clearCapabilitiesCache, markSidecarOffline, refresh]);

  useEffect(() => {
    if (sidecarPhase !== "starting" && enginePhase !== "starting") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
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
      void clearAllJobs().catch(() => undefined);
    }
  }, [online, persistJobLogs]);

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
      setLastError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [jobLogsDir, spectrogramCacheDir]);

  const stopSidecar = useCallback(async () => {
    setLastError(null);
    setSidecarPhase("stopping");
    sidecarPhaseRef.current = "stopping";
    try {
      if (enginePhaseRef.current === "running" || engineStatus === "ready") {
        try {
          await stopEngine();
        } catch {
          /* the host stops the engine over HTTP before killing the process */
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
      setLastError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [clearCapabilitiesCache, engineStatus, resetSidecarPort]);

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
        if (isTauriRuntime()) {
          await invokeSidecarEngineStart(device);
        } else {
          await startEngine(device);
        }
        await refresh();
      } catch (err) {
        setEnginePhase("error");
        setLastError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [computeDevice, refresh],
  );

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
      const startEngineHostSafe = async (d: ComputeDevice) => {
        if (isTauriRuntime()) {
          await invokeSidecarEngineStart(d);
        } else {
          await startEngine(d);
        }
      };
      try {
        if (onlineRef.current) {
          setOrchestratingStep("starting_engine");
          setEnginePhase("stopping");
          await stopEngine();
          clearCapabilitiesCache();
          setEnginePhase("starting");
          await startEngineHostSafe(device);
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
          } catch {
            // not in Tauri (web-only smoke)
          }
          await refresh();
          return onlineRef.current && getSidecarPortFromBase() != null;
        }, 95_000);

        setOrchestratingStep("starting_engine");
        setSidecarPhase("running");
        setEnginePhase("starting");
        await startEngineHostSafe(device);

        await waitUntil(async () => {
          await refresh();
          return (
            engineRef.current === "ready" &&
            capabilitiesCacheRef.current?.orcai_installed === true
          );
        }, 600_000);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
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
      clearCapabilitiesCache,
      refresh,
      startSidecar,
      stopSidecar,
    ],
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
      setLastError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [clearCapabilitiesCache, refresh]);

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
      } catch {
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
          } catch {
            /* web-only */
          }
          await refresh();
          return onlineRef.current && getSidecarPortFromBase() != null;
        }, 95_000);
      } else if (getSidecarPortFromBase() == null) {
        try {
          const port = await invokeSidecarGetPort();
          if (port != null) applySidecarPort(port);
        } catch {
          /* web-only */
        }
        await refresh();
      }

      try {
        const port = await invokeSidecarGetPort();
        if (port != null) applySidecarPort(port);
      } catch {
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
      setLastError(err instanceof Error ? err.message : String(err));
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
  }, [applySidecarPort, computeDevice, loadCapabilities, refresh, startSidecar]);

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
  }, [stopSidecar]);

  const autostartAttemptedRef = useRef(false);
  useEffect(() => {
    if (!prefsReady || autostartAttemptedRef.current || !runtimeAutostart) return;
    autostartAttemptedRef.current = true;
    void startAll().catch(() => {
      autostartAttemptedRef.current = false;
    });
  }, [prefsReady, runtimeAutostart, startAll]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      // Shell owns platform close policy (hide vs stop_and_close).
      let closePolicy = "stop_and_close";
      try {
        closePolicy = await invoke<string>("window_close_policy");
      } catch {
        // Browser / non-Tauri: default to stop_and_close.
      }
      if (cancelled) return;
      try {
        unlisten = await getCurrentWindow().onCloseRequested((event) => {
          if (closePolicy === "hide") {
            // Keep sidecar/engine running; Quit still hits Rust RunEvent::Exit.
            event.preventDefault();
            void getCurrentWindow().hide().catch(() => undefined);
            return;
          }

          if (!userStartedRuntimeRef.current && !onlineRef.current) {
            return;
          }
          event.preventDefault();
          void (async () => {
            try {
              await stopAll();
            } catch {
              // best-effort shutdown before exit
            }
            try {
              await getCurrentWindow().destroy();
            } catch {
              await getCurrentWindow().close();
            }
          })();
        });
      } catch {
        // ignore when not in Tauri webview
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [stopAll]);

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
  if (engineProgressApi != null && (enginePhase === "starting" || engineStatus === "warming")) {
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

  const value = useMemo<SidecarContextValue>(
    () => {
      const preview = isDevUiPreviewUnlock();
      return {
      online: preview || online,
      sidecarPort,
      engineReady: preview || engineReady,
      engineStatus,
      engineStage,
      capabilities,
      sidecarPhase: preview && sidecarPhase === "stopped" ? "running" : sidecarPhase,
      enginePhase: preview && enginePhase === "stopped" ? "running" : enginePhase,
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
    },
    [
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
    ],
  );

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

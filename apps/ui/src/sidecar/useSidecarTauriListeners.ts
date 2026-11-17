import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";
import { silentCatch } from "../lib/silentCatch";
import {
  isSidecarBootStage,
  type SidecarBootStage,
} from "../lib/runtimeProgress";
import type { ServicePhase } from "./sidecarTypes";
import {
  HEALTH_POLL_BUSY_MS,
  HEALTH_POLL_IDLE_MS,
} from "../lib/pollIntervals";

const BOOT_POLL_MS = HEALTH_POLL_BUSY_MS;
const IDLE_POLL_MS = HEALTH_POLL_IDLE_MS;
export const HEALTH_FAIL_THRESHOLD = 3;

type Options = {
  refresh: () => Promise<void>;
  applySidecarPort: (port: number) => void;
  markSidecarOffline: () => void;
  setSidecarBootProgress: Dispatch<SetStateAction<number | null>>;
  setSidecarBootStage: Dispatch<SetStateAction<SidecarBootStage | null>>;
  setSidecarPhase: Dispatch<SetStateAction<ServicePhase>>;
  setLastError: Dispatch<SetStateAction<string | null>>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
  orchestratingRef: MutableRefObject<boolean>;
  sidecarPhaseRef: MutableRefObject<ServicePhase>;
  enginePhaseRef: MutableRefObject<ServicePhase>;
  healthFailStreakRef: MutableRefObject<number>;
};

/**
 * Adaptive health poll loop + Tauri sidecar-ready/failed/exited/boot-progress.
 */
export function useSidecarTauriListeners(opts: Options): void {
  const {
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
  } = opts;

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
        if (cancelled) {
          unlisten();
          return;
        }
        disposeBootProgress = unlisten;
      })
      .catch(silentCatch("tauriListen"));

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
        if (cancelled) {
          unlisten();
          return;
        }
        disposeSidecarReady = unlisten;
      })
      .catch(silentCatch("tauriListen"));

    void listen<string>("sidecar-failed", (event) => {
      setSidecarPhase("error");
      setLastError(formatUserFacingErrorI18n(event.payload));
      markSidecarOffline();
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        disposeSidecarFailed = unlisten;
      })
      .catch(silentCatch("tauriListen"));

    void listen<string>("sidecar-exited", (event) => {
      healthFailStreakRef.current = HEALTH_FAIL_THRESHOLD;
      setSidecarPhase("error");
      setLastError(formatUserFacingErrorI18n(event.payload));
      markSidecarOffline();
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        disposeSidecarExited = unlisten;
      })
      .catch(silentCatch("tauriListen"));

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      disposeBootProgress?.();
      disposeSidecarReady?.();
      disposeSidecarFailed?.();
      disposeSidecarExited?.();
    };
  }, [
    applySidecarPort,
    enginePhaseRef,
    healthFailStreakRef,
    markSidecarOffline,
    orchestratingRef,
    refresh,
    setLastError,
    setSidecarBootProgress,
    setSidecarBootStage,
    setSidecarPhase,
    sidecarPhaseRef,
    userStartedRuntimeRef,
  ]);
}

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  EngineProgressStage,
  SidecarCapabilities,
  SidecarHealth,
} from "../api/sidecar";
import {
  isEngineProgressStage,
  type SidecarBootStage,
} from "../lib/runtimeProgress";
import { formatUserFacingErrorI18n } from "../lib/userFacingError";
import type { ServicePhase } from "./sidecarTypes";

type ApplyArgs = {
  health: SidecarHealth;
  loadCapabilities: (force?: boolean) => Promise<SidecarCapabilities | null>;
  clearCapabilitiesCache: () => void;
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
  capabilitiesCacheRef: MutableRefObject<SidecarCapabilities | null>;
};

/** Map a successful /health payload into runtime UI + refs (no network). */
export async function applyHealthSnapshot(args: ApplyArgs): Promise<void> {
  const {
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
  } = args;

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
    setLastError(
      formatUserFacingErrorI18n(health.engine_error ?? "Engine error"),
    );
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
    } else if (health.orcai === "yes" && !capabilitiesCacheRef.current) {
      await loadCapabilities(false);
    }
  }
}

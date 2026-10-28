import type { ServicePhase } from "../sidecar/SidecarContext";
import type { SidecarEngineStatus } from "../api/sidecar";

export type SidecarBootStage = "spawning" | "waiting_port" | "ready";

export type EngineProgressStage =
  | "idle"
  | "checking_orcai"
  | "importing_orcai"
  | "configuring_device"
  | "loading_tensorflow"
  | "probing_gpu"
  | "ready"
  | "error";

export type RuntimeStep =
  | "idle"
  | "starting_sidecar"
  | "starting_engine"
  | "ready"
  | "stopping"
  | "error";

const SIDECAR_SHARE = 30;
const ENGINE_SHARE = 70;

export function computeRuntimeProgressPercent(params: {
  online: boolean;
  engineReady: boolean;
  sidecarPhase: ServicePhase;
  enginePhase: ServicePhase;
  orchestrating: boolean;
  engineStatus: SidecarEngineStatus | null;
  sidecarBootProgress: number | null;
  engineProgress: number | null;
}): number {
  const {
    online,
    engineReady,
    sidecarPhase,
    enginePhase,
    orchestrating,
    engineStatus,
    sidecarBootProgress,
    engineProgress,
  } = params;

  if (
    !orchestrating &&
    sidecarPhase === "stopped" &&
    enginePhase === "stopped"
  ) {
    return 0;
  }

  if (engineReady) return 100;

  const sidecarFrac = (() => {
    if (
      sidecarBootProgress != null &&
      (sidecarPhase === "starting" || sidecarPhase === "running")
    ) {
      return Math.min(1, Math.max(0, sidecarBootProgress));
    }
    if (online || sidecarPhase === "running") return 1;
    if (sidecarPhase === "starting") return 0.35;
    return 0;
  })();

  const engineFrac = (() => {
    if (engineProgress != null) {
      return Math.min(1, Math.max(0, engineProgress));
    }
    if (engineStatus === "warming") return 0.4;
    if (engineStatus === "ready") return 1;
    return 0;
  })();

  if (!online && sidecarPhase !== "running") {
    return Math.round(sidecarFrac * SIDECAR_SHARE);
  }

  if (!engineReady) {
    if (!online) {
      return Math.round(sidecarFrac * SIDECAR_SHARE);
    }
    return Math.round(SIDECAR_SHARE + engineFrac * ENGINE_SHARE);
  }

  return 100;
}

export function deriveRuntimeStep(params: {
  orchestrating: boolean;
  orchestratingStep: RuntimeStep | null;
  sidecarPhase: ServicePhase;
  enginePhase: ServicePhase;
  online: boolean;
  engineReady: boolean;
  engineStatus: SidecarEngineStatus | null;
}): RuntimeStep {
  if (params.orchestrating && params.orchestratingStep) {
    return params.orchestratingStep;
  }
  if (
    params.sidecarPhase === "stopping" ||
    params.enginePhase === "stopping"
  ) {
    return "stopping";
  }
  if (params.sidecarPhase === "error" || params.enginePhase === "error") {
    return "error";
  }
  if (params.engineReady) return "ready";
  // Only when the sidecar is actually starting — not simply "offline"
  // (stopped + offline was wrongly treated as starting_sidecar and disabled Start).
  if (params.sidecarPhase === "starting") {
    return "starting_sidecar";
  }
  if (
    params.enginePhase === "starting" ||
    params.engineStatus === "warming"
  ) {
    return "starting_engine";
  }
  if (params.online && !params.engineReady) {
    return "idle";
  }
  return "idle";
}

export function runtimeStatusMessageKey(params: {
  runtimeStep: RuntimeStep;
  sidecarBootStage: SidecarBootStage | null;
  engineStage: EngineProgressStage | null;
}): string {
  const { runtimeStep, sidecarBootStage, engineStage } = params;

  if (runtimeStep === "ready") return "home.runtimeReady";
  if (runtimeStep === "stopping") return "home.runtimeStopping";
  if (runtimeStep === "error") return "home.runtimeError";
  if (runtimeStep === "idle") return "home.runtimeIdle";

  if (runtimeStep === "starting_sidecar") {
    const stage = sidecarBootStage ?? "waiting_port";
    return `home.runtimeSidecarStage.${stage}`;
  }

  if (runtimeStep === "starting_engine") {
    const stage = engineStage ?? "checking_orcai";
    return `home.runtimeEngineStage.${stage}`;
  }

  return "home.runtimeIdle";
}

export function isSidecarBootStage(value: string): value is SidecarBootStage {
  return value === "spawning" || value === "waiting_port" || value === "ready";
}

export function isEngineProgressStage(
  value: string | undefined,
): value is EngineProgressStage {
  if (!value) return false;
  return [
    "idle",
    "checking_orcai",
    "importing_orcai",
    "configuring_device",
    "loading_tensorflow",
    "probing_gpu",
    "ready",
    "error",
  ].includes(value);
}

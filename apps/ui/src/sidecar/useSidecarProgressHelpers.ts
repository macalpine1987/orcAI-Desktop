/** Sidecar progress helpers (move-only from SidecarContext). */
import type { SidecarHealth } from "../api/sidecar";
import type { ServicePhase } from "./sidecarTypes";

export function progressForSidecar(phase: ServicePhase): number {
  if (phase === "running") return 100;
  return 0;
}

export function progressForEngine(
  phase: ServicePhase,
  engineStatus: SidecarHealth["engine"] | null,
): number {
  if (phase === "running" && engineStatus === "ready") return 100;
  return 0;
}

export function startingProgress(tick: number, max = 92): number {
  const step = (tick % 20) * 4;
  return Math.min(max, 12 + step);
}

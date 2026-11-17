import { getSidecarBase } from "../sidecar";
import type { TrainMonitorSnapshot } from "./types";
import { parseError } from "./parseError";

export async function fetchProjectTrainMonitor(
  id: string,
): Promise<TrainMonitorSnapshot> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/train-monitor`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as TrainMonitorSnapshot;
}

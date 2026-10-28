import { getSidecarBase } from "./sidecar";
import type { ComputeDevice } from "../preferences/storage";

export async function startEngine(computeDevice: ComputeDevice): Promise<void> {
  const res = await fetch(`${getSidecarBase()}/v1/engine/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compute_device: computeDevice }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Engine start failed (${res.status})`);
  }
}

export async function stopEngine(): Promise<void> {
  const res = await fetch(`${getSidecarBase()}/v1/engine/stop`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Engine stop failed (${res.status})`);
  }
}

import { startEngine } from "../api/engineControl";
import { invokeSidecarEngineStart, isTauriRuntime } from "../api/sidecarControl";
import type { ComputeDevice } from "../preferences/storage";

/**
 * Prefer host HTTP in Tauri — WKWebView fetch races cold ephemeral ports.
 * Browser / web-only smoke keeps the fetch path.
 */
export async function startEngineViaHost(device: ComputeDevice): Promise<void> {
  if (isTauriRuntime()) {
    await invokeSidecarEngineStart(device);
    return;
  }
  await startEngine(device);
}

/** Fallback for browser/dev when VITE_SIDECAR_URL is set explicitly. */
export const SIDECAR_DEFAULT_BASE =
  import.meta.env.VITE_SIDECAR_URL ?? "http://127.0.0.1:8741";

let runtimeBase: string | null = null;

export function getSidecarBase(): string {
  if (runtimeBase) return runtimeBase;
  const viteUrl = import.meta.env.VITE_SIDECAR_URL as string | undefined;
  if (viteUrl) return viteUrl;
  // Vitest / unit tests that forget to mock still need a stable base.
  if (import.meta.env.MODE === "test") return SIDECAR_DEFAULT_BASE;
  throw new Error(
    "Sidecar URL is not bound yet — start the runtime (Sidecar + orcAI) first",
  );
}

/** True when this app session has bound a Tauri-allocated sidecar port. */
export function hasRuntimeSidecarBase(): boolean {
  return runtimeBase != null;
}

/** Called when Tauri reports the allocated localhost port. */
export function setSidecarBaseFromPort(port: number): void {
  runtimeBase = `http://127.0.0.1:${port}`;
}

export function clearSidecarBase(): void {
  runtimeBase = null;
}

export function getSidecarPortFromBase(): number | null {
  if (!runtimeBase) return null;
  try {
    const url = new URL(runtimeBase);
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
}

export type SidecarEngineStatus =
  | "idle"
  | "warming"
  | "ready"
  | "unavailable"
  | "error";

export type EngineProgressStage =
  | "idle"
  | "checking_orcai"
  | "importing_orcai"
  | "configuring_device"
  | "loading_tensorflow"
  | "probing_gpu"
  | "ready"
  | "error";

export type SidecarHealth = {
  status: string;
  orcai: "yes" | "no";
  engine: SidecarEngineStatus;
  compute_device?: string;
  engine_error?: string;
  engine_stage?: EngineProgressStage;
  engine_progress?: number;
};

export type BuiltinModelInfo = {
  id: string;
  name: string;
  path: string;
  kind: "builtin";
  description?: string;
};

export type SidecarCapabilities = {
  platform: string;
  python: string;
  multi_gpu_hpsearch: boolean;
  orcai_installed: boolean;
  orcai_version?: string | null;
  builtin_models?: BuiltinModelInfo[];
  implemented_commands?: string[];
  supported_commands?: string[];
  gpu_available?: boolean;
  gpu_backend?: string | null;
  gpu_devices?: string[];
  metal_plugin_installed?: boolean;
  tensorflow_version?: string | null;
  accelerator_hint?: string;
  /** Set when the engine is ready — reflects the session device (cpu/gpu). */
  active_compute_device?: "cpu" | "gpu" | null;
};

export async function fetchSidecarHealth(): Promise<SidecarHealth | null> {
  if (!runtimeBase) return null;
  try {
    const res = await fetch(`${runtimeBase}/health`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SidecarHealth;
  } catch {
    return null;
  }
}

export async function fetchSidecarCapabilities(): Promise<SidecarCapabilities | null> {
  if (!runtimeBase) return null;
  try {
    const res = await fetch(`${runtimeBase}/v1/capabilities`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SidecarCapabilities;
  } catch {
    return null;
  }
}

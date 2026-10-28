import type { SidecarCapabilities } from "../api/sidecar";

/** Abstract accelerator backend — never derived from OS platform alone. */
export type AcceleratorBackend = "metal" | "cuda" | "cpu" | "unknown";

/** Sidecar from an older build (before TF/Metal fields on /v1/capabilities). */
export function isStaleSidecarCapabilities(
  capabilities: SidecarCapabilities | null,
): boolean {
  if (!capabilities) return false;
  return (
    capabilities.tensorflow_version === undefined &&
    capabilities.metal_plugin_installed === undefined &&
    capabilities.gpu_available === undefined
  );
}

/** True when the engine is bound to CPU (not Metal/CUDA). */
export function isActiveCpu(capabilities: SidecarCapabilities): boolean {
  return capabilities.active_compute_device === "cpu";
}

/**
 * Resolve accelerator backend from capability fields only.
 * `metal_plugin_installed === false` alone does not imply Metal (e.g. Linux).
 */
export function resolveAcceleratorBackend(
  capabilities: SidecarCapabilities,
): AcceleratorBackend {
  if (isActiveCpu(capabilities)) return "cpu";

  const backend = (capabilities.gpu_backend ?? "").trim().toLowerCase();
  if (backend === "metal" || backend.includes("metal")) return "metal";
  if (backend === "cuda" || backend.includes("cuda")) return "cuda";
  if (backend === "cpu") return "cpu";

  const hint = (capabilities.accelerator_hint ?? "").trim().toLowerCase();
  if (hint.includes("metal")) return "metal";
  if (hint.includes("cuda")) return "cuda";
  if (hint === "cpu" || hint.startsWith("cpu ")) return "cpu";

  // True only confirms Metal stack; false is meaningless without metal hint/backend.
  if (capabilities.metal_plugin_installed === true) return "metal";

  return "unknown";
}

export function formatAcceleratorDetail(
  capabilities: SidecarCapabilities,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (isStaleSidecarCapabilities(capabilities)) {
    return t("settings.sidecarStale");
  }
  if (isActiveCpu(capabilities)) {
    return t("settings.computeAccelActiveCpu");
  }
  if (capabilities.gpu_available && capabilities.gpu_devices?.length) {
    return t("settings.computeAccelReady", {
      hint: capabilities.accelerator_hint ?? "GPU",
      devices: capabilities.gpu_devices.join(", "),
    });
  }
  const backend = resolveAcceleratorBackend(capabilities);
  if (backend === "metal" && capabilities.metal_plugin_installed === true) {
    return t("settings.computeMetalNoGpu");
  }
  if (backend === "metal" && capabilities.metal_plugin_installed === false) {
    return t("settings.computeMetalMissing");
  }
  return t("settings.computeAccelCpuOnly");
}

export function formatRuntimeAcceleratorLabel(
  capabilities: SidecarCapabilities,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (isStaleSidecarCapabilities(capabilities)) {
    return t("settings.sidecarStaleShort");
  }
  if (isActiveCpu(capabilities)) {
    return t("settings.computeCpu");
  }
  return capabilities.accelerator_hint ?? "GPU";
}

export function formatAcceleratorSuffix(
  capabilities: SidecarCapabilities,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (isStaleSidecarCapabilities(capabilities)) {
    return ` · ${t("settings.sidecarStaleShort")}`;
  }
  if (isActiveCpu(capabilities)) {
    return "";
  }
  if (capabilities.gpu_available && capabilities.gpu_devices?.length) {
    return ` · ${capabilities.gpu_devices.join(", ")}`;
  }
  const backend = resolveAcceleratorBackend(capabilities);
  if (backend === "metal" && capabilities.metal_plugin_installed === true) {
    return ` · ${t("settings.computeMetalNoGpu")}`;
  }
  if (backend === "metal" && capabilities.metal_plugin_installed === false) {
    return ` · ${t("settings.computeMetalMissing")}`;
  }
  return "";
}

import type { TFunction } from "i18next";
import type { SidecarCapabilities } from "../api/sidecar";
import {
  isActiveCpu,
  isStaleSidecarCapabilities,
  resolveAcceleratorBackend,
} from "../lib/sidecarCapabilities";
import type { ComputeDevice } from "../preferences/storage";

/** Device phrase for wizard step-4 train ETA (respects Settings CPU/GPU). */
export function trainEstimateDeviceLabel(
  computeDevice: ComputeDevice,
  capabilities: SidecarCapabilities | null | undefined,
  t: TFunction,
): string {
  const caps =
    capabilities && !isStaleSidecarCapabilities(capabilities)
      ? capabilities
      : null;
  if (computeDevice === "cpu" || (caps != null && isActiveCpu(caps))) {
    return t("wizard.trainEstimateDeviceCpu");
  }
  if (caps) {
    const backend = resolveAcceleratorBackend(caps);
    if (backend === "metal") return t("wizard.trainEstimateDeviceMetal");
    if (backend === "cuda") return t("wizard.trainEstimateDeviceCuda");
  }
  return t("wizard.trainEstimateDeviceGpu");
}

import { describe, expect, it } from "vitest";
import type { SidecarCapabilities } from "../api/sidecar";
import { trainEstimateDeviceLabel } from "../trainWizard/trainEstimateDevice";

const t = ((key: string) => key) as unknown as import("i18next").TFunction;

function caps(partial: Partial<SidecarCapabilities>): SidecarCapabilities {
  return {
    orcai_installed: true,
    ...partial,
  } as SidecarCapabilities;
}

describe("trainEstimateDeviceLabel", () => {
  it("shows CPU when preference is cpu", () => {
    expect(
      trainEstimateDeviceLabel(
        "cpu",
        caps({
          active_compute_device: "gpu",
          gpu_backend: "metal",
          accelerator_hint: "Metal",
        }),
        t,
      ),
    ).toBe("wizard.trainEstimateDeviceCpu");
  });

  it("shows CPU when engine is bound to cpu even if preference is gpu", () => {
    expect(
      trainEstimateDeviceLabel(
        "gpu",
        caps({
          active_compute_device: "cpu",
          gpu_backend: "metal",
          gpu_available: true,
          tensorflow_version: "2.x",
        }),
        t,
      ),
    ).toBe("wizard.trainEstimateDeviceCpu");
  });

  it("shows Apple GPU for Metal when preference is gpu", () => {
    expect(
      trainEstimateDeviceLabel(
        "gpu",
        caps({
          active_compute_device: "gpu",
          gpu_backend: "metal",
          metal_plugin_installed: true,
          gpu_available: true,
        }),
        t,
      ),
    ).toBe("wizard.trainEstimateDeviceMetal");
  });

  it("falls back to GPU without capabilities", () => {
    expect(trainEstimateDeviceLabel("gpu", null, t)).toBe(
      "wizard.trainEstimateDeviceGpu",
    );
  });
});

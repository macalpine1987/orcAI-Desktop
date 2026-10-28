import { describe, expect, it } from "vitest";
import type { SidecarCapabilities } from "../api/sidecar";
import {
  formatAcceleratorDetail,
  formatAcceleratorSuffix,
  formatRuntimeAcceleratorLabel,
  isStaleSidecarCapabilities,
  resolveAcceleratorBackend,
  type AcceleratorBackend,
} from "./sidecarCapabilities";

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key;

function base(
  overrides: Partial<SidecarCapabilities> & Pick<SidecarCapabilities, "platform">,
): SidecarCapabilities {
  return {
    python: "3.11",
    multi_gpu_hpsearch: false,
    orcai_installed: true,
    tensorflow_version: "2.18.1",
    metal_plugin_installed: false,
    gpu_available: false,
    ...overrides,
  };
}

describe("sidecarCapabilities · accelerator abstraction", () => {
  it("detects stale capabilities without TF fields", () => {
    const stale = {
      platform: "darwin",
      python: "3.11",
      multi_gpu_hpsearch: false,
      orcai_installed: true,
    } as SidecarCapabilities;
    expect(isStaleSidecarCapabilities(stale)).toBe(true);
    expect(isStaleSidecarCapabilities(null)).toBe(false);
  });

  it("does not treat metal=false as stale", () => {
    const cap = base({
      platform: "darwin",
      metal_plugin_installed: false,
      accelerator_hint: "Metal (Apple GPU)",
    });
    expect(isStaleSidecarCapabilities(cap)).toBe(false);
    expect(resolveAcceleratorBackend(cap)).toBe("metal");
    expect(formatAcceleratorDetail(cap, t)).toBe("settings.computeMetalMissing");
  });

  it("reports active cpu session without metal suffix", () => {
    const cap = base({
      platform: "darwin",
      metal_plugin_installed: true,
      active_compute_device: "cpu",
      accelerator_hint: "CPU",
    });
    expect(resolveAcceleratorBackend(cap)).toBe("cpu");
    expect(formatAcceleratorDetail(cap, t)).toBe("settings.computeAccelActiveCpu");
    expect(formatAcceleratorSuffix(cap, t)).toBe("");
    expect(formatRuntimeAcceleratorLabel(cap, t)).toBe("settings.computeCpu");
  });

  it("reports metal installed without gpu", () => {
    const cap = base({
      platform: "darwin",
      metal_plugin_installed: true,
      gpu_backend: "metal",
    });
    expect(resolveAcceleratorBackend(cap)).toBe("metal");
    expect(formatAcceleratorDetail(cap, t)).toBe("settings.computeMetalNoGpu");
  });

  it("linux without metal plugin shows cpu-only (not MetalMissing)", () => {
    const cap = base({
      platform: "linux",
      metal_plugin_installed: false,
      accelerator_hint: "CUDA",
      gpu_backend: null,
    });
    expect(resolveAcceleratorBackend(cap)).toBe("cuda");
    expect(formatAcceleratorDetail(cap, t)).toBe("settings.computeAccelCpuOnly");
  });

  it("resolves cuda from gpu_backend", () => {
    const cap = base({
      platform: "linux",
      gpu_available: true,
      gpu_devices: ["/physical_device:GPU:0"],
      gpu_backend: "cuda",
      accelerator_hint: "CUDA",
    });
    expect(resolveAcceleratorBackend(cap)).toBe("cuda");
    expect(formatAcceleratorDetail(cap, t)).toContain("settings.computeAccelReady");
  });

  it("never derives backend from platform alone", () => {
    for (const platform of ["darwin", "linux", "win32", "windows"] as const) {
      const bare = base({
        platform,
        metal_plugin_installed: false,
        gpu_backend: null,
        accelerator_hint: undefined,
      });
      expect(resolveAcceleratorBackend(bare)).toBe("unknown");
    }
  });

  it("resolves metal from metal_plugin_installed=true without platform check", () => {
    const onLinux = base({
      platform: "linux",
      metal_plugin_installed: true,
      gpu_backend: null,
      accelerator_hint: undefined,
    });
    expect(resolveAcceleratorBackend(onLinux)).toBe("metal");
  });

  it("resolves backends from gpu_backend substrings", () => {
    const cases: Array<[string, AcceleratorBackend]> = [
      ["Metal", "metal"],
      ["pluggable_device_metal", "metal"],
      ["CUDA", "cuda"],
      ["tensorflow-cuda", "cuda"],
      ["cpu", "cpu"],
    ];
    for (const [gpu_backend, expected] of cases) {
      expect(
        resolveAcceleratorBackend(
          base({ platform: "linux", gpu_backend, metal_plugin_installed: false }),
        ),
      ).toBe(expected);
    }
  });

  it("resolves backends from accelerator_hint when gpu_backend empty", () => {
    expect(
      resolveAcceleratorBackend(
        base({
          platform: "win32",
          accelerator_hint: "CUDA (NVIDIA)",
          gpu_backend: "",
        }),
      ),
    ).toBe("cuda");
    expect(
      resolveAcceleratorBackend(
        base({
          platform: "darwin",
          accelerator_hint: "CPU only",
          gpu_backend: "",
        }),
      ),
    ).toBe("cpu");
  });

  it("formatRuntimeAcceleratorLabel prefers hint over platform", () => {
    const stale = {
      platform: "darwin",
      python: "3.11",
      multi_gpu_hpsearch: false,
      orcai_installed: true,
    } as SidecarCapabilities;
    expect(formatRuntimeAcceleratorLabel(stale, t)).toBe(
      "settings.sidecarStaleShort",
    );

    const ready = base({
      platform: "linux",
      accelerator_hint: "CUDA",
      gpu_available: true,
      gpu_devices: ["GPU:0"],
      gpu_backend: "cuda",
    });
    expect(formatRuntimeAcceleratorLabel(ready, t)).toBe("CUDA");
  });

  it("formatAcceleratorSuffix lists devices or metal messages", () => {
    const withDevices = base({
      platform: "linux",
      gpu_available: true,
      gpu_devices: ["GPU:0", "GPU:1"],
      gpu_backend: "cuda",
      accelerator_hint: "CUDA",
    });
    expect(formatAcceleratorSuffix(withDevices, t)).toBe(" · GPU:0, GPU:1");

    const metalMissing = base({
      platform: "darwin",
      metal_plugin_installed: false,
      accelerator_hint: "Metal (Apple GPU)",
    });
    expect(formatAcceleratorSuffix(metalMissing, t)).toContain(
      "settings.computeMetalMissing",
    );

    const metalNoGpu = base({
      platform: "darwin",
      metal_plugin_installed: true,
      gpu_backend: "metal",
    });
    expect(formatAcceleratorSuffix(metalNoGpu, t)).toContain(
      "settings.computeMetalNoGpu",
    );
  });

  it("active cpu wins over metal plugin and cuda hint", () => {
    const cap = base({
      platform: "darwin",
      active_compute_device: "cpu",
      metal_plugin_installed: true,
      gpu_backend: "metal",
      accelerator_hint: "CUDA",
      gpu_available: true,
      gpu_devices: ["GPU:0"],
    });
    expect(resolveAcceleratorBackend(cap)).toBe("cpu");
    expect(formatAcceleratorDetail(cap, t)).toBe("settings.computeAccelActiveCpu");
  });
});

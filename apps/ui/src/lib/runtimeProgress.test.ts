import { describe, expect, it } from "vitest";
import {
  computeRuntimeProgressPercent,
  deriveRuntimeStep,
  runtimeStatusMessageKey,
} from "./runtimeProgress";

describe("computeRuntimeProgressPercent", () => {
  it("returns 0 when runtime is fully stopped", () => {
    expect(
      computeRuntimeProgressPercent({
        online: true,
        engineReady: false,
        sidecarPhase: "stopped",
        enginePhase: "stopped",
        orchestrating: false,
        engineStatus: "ready",
        sidecarBootProgress: 1,
        engineProgress: 1,
      }),
    ).toBe(0);
  });

  it("returns 100 when engine is ready", () => {
    expect(
      computeRuntimeProgressPercent({
        online: true,
        engineReady: true,
        sidecarPhase: "running",
        enginePhase: "running",
        orchestrating: false,
        engineStatus: "ready",
        sidecarBootProgress: null,
        engineProgress: 1,
      }),
    ).toBe(100);
  });

  it("maps sidecar boot to 0–30%", () => {
    expect(
      computeRuntimeProgressPercent({
        online: false,
        engineReady: false,
        sidecarPhase: "starting",
        enginePhase: "stopped",
        orchestrating: true,
        engineStatus: "idle",
        sidecarBootProgress: 0.5,
        engineProgress: null,
      }),
    ).toBe(15);
  });

  it("maps engine warmup to 30–100%", () => {
    expect(
      computeRuntimeProgressPercent({
        online: true,
        engineReady: false,
        sidecarPhase: "running",
        enginePhase: "starting",
        orchestrating: true,
        engineStatus: "warming",
        sidecarBootProgress: 1,
        engineProgress: 0.5,
      }),
    ).toBe(65);
  });
});

describe("deriveRuntimeStep", () => {
  it("prefers orchestrating step when set", () => {
    expect(
      deriveRuntimeStep({
        orchestrating: true,
        orchestratingStep: "starting_engine",
        sidecarPhase: "running",
        enginePhase: "stopped",
        online: true,
        engineReady: false,
        engineStatus: "idle",
      }),
    ).toBe("starting_engine");
  });

  it("idle when sidecar stopped and offline (Start button must stay enabled)", () => {
    expect(
      deriveRuntimeStep({
        orchestrating: false,
        orchestratingStep: null,
        sidecarPhase: "stopped",
        enginePhase: "stopped",
        online: false,
        engineReady: false,
        engineStatus: null,
      }),
    ).toBe("idle");
  });
});

describe("runtimeStatusMessageKey", () => {
  it("returns engine stage key during engine start", () => {
    expect(
      runtimeStatusMessageKey({
        runtimeStep: "starting_engine",
        sidecarBootStage: null,
        engineStage: "loading_tensorflow",
      }),
    ).toBe("home.runtimeEngineStage.loading_tensorflow");
  });
});

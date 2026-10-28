import { describe, expect, it } from "vitest";
import { runtimeReadyLampState } from "./RuntimeReadyLamp";

describe("runtimeReadyLampState", () => {
  it("is off when idle or error", () => {
    expect(runtimeReadyLampState({ runtimeStep: "idle" })).toBe("off");
    expect(runtimeReadyLampState({ runtimeStep: "error" })).toBe("off");
  });

  it("pulses while starting or stopping", () => {
    expect(runtimeReadyLampState({ runtimeStep: "starting_sidecar" })).toBe(
      "loading",
    );
    expect(runtimeReadyLampState({ runtimeStep: "starting_engine" })).toBe(
      "loading",
    );
    expect(runtimeReadyLampState({ runtimeStep: "stopping" })).toBe("loading");
  });

  it("is on when ready", () => {
    expect(runtimeReadyLampState({ runtimeStep: "ready" })).toBe("on");
  });
});

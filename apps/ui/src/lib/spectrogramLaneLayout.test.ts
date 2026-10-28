import { describe, expect, it } from "vitest";
import { laneBarLayout } from "./spectrogramLaneLayout";

describe("laneBarLayout", () => {
  it("uses full lane height without hz bounds", () => {
    const { yOffset, height } = laneBarLayout(undefined, undefined, 20, "linear", 12000);
    expect(yOffset).toBe(0);
    expect(height).toBe(20);
  });

  it("narrows bar inside lane when hz bounds exist", () => {
    const { yOffset, height } = laneBarLayout(2000, 8000, 24, "linear", 12000);
    expect(yOffset).toBeGreaterThan(0);
    expect(height).toBeLessThan(24);
  });
});

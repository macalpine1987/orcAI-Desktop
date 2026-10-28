import { describe, expect, it } from "vitest";
import { buildFilterCliLine } from "./filterCliLine";

describe("buildFilterCliLine", () => {
  it("emits orcai filter-predictions with -cdl", () => {
    const line = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      callDurationLimits: "/p/limits.json",
    });
    expect(line).toBe(
      "orcai filter-predictions /p/a_predicted.txt -cdl /p/limits.json",
    );
  });

  it("adds overwrite and skips default output", () => {
    const line = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      outputFile: "default",
      overwrite: true,
      callDurationLimits: "/p/L.json",
      labelSuffix: "*",
    });
    expect(line).toContain("-ow");
    expect(line).not.toContain("-o ");
    expect(line).not.toContain("-ls");
  });

  it("writes an empty label suffix and omits the Click default star", () => {
    const empty = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      labelSuffix: "",
    });
    expect(empty).toContain("-ls ''");
    const star = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      labelSuffix: "*",
    });
    expect(star).not.toContain("-ls");
  });
});

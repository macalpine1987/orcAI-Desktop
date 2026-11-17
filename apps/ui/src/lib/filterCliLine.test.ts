import { describe, expect, it } from "vitest";
import { buildFilterCliLine } from "./filterCliLine";
import { setLiveLogVerbosity } from "./integrationSettings";

describe("buildFilterCliLine", () => {
  it("emits orcai filter-predictions with -cdl and -v", () => {
    const line = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      callDurationLimits: "/p/limits.json",
      verbosity: 2,
    });
    expect(line).toBe(
      "orcai filter-predictions /p/a_predicted.txt -cdl /p/limits.json -v 2",
    );
  });

  it("adds overwrite and skips default output", () => {
    const line = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      outputFile: "default",
      overwrite: true,
      callDurationLimits: "/p/L.json",
      labelSuffix: "*",
      verbosity: 1,
    });
    expect(line).toContain("-ow");
    expect(line).not.toContain("-o ");
    expect(line).not.toContain("-ls");
    expect(line).toContain("-v 1");
  });

  it("writes an empty label suffix and omits the Click default star", () => {
    const empty = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      labelSuffix: "",
      verbosity: 0,
    });
    expect(empty).toContain("-ls ''");
    expect(empty).toContain("-v 0");
    const star = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
      labelSuffix: "*",
      verbosity: 3,
    });
    expect(star).not.toContain("-ls");
    expect(star).toContain("-v 3");
  });

  it("uses live Settings verbosity when omitted (matches createJob inject)", () => {
    setLiveLogVerbosity(2);
    const line = buildFilterCliLine({
      predictedLabels: "/p/a_predicted.txt",
    });
    expect(line).toContain("-v 2");
    setLiveLogVerbosity(0);
    expect(buildFilterCliLine({ predictedLabels: "/p/a.txt" })).toContain("-v 0");
    setLiveLogVerbosity(2);
  });
});

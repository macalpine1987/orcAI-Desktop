import { describe, expect, it } from "vitest";
import { inferPredictedLabelPath } from "./predictLabels";

describe("inferPredictedLabelPath", () => {
  it("builds default sidecar-style path", () => {
    expect(inferPredictedLabelPath("/rec/a.wav", 2, "orcai-isl-v1")).toBe(
      "/rec/a_c2_orcai-isl-v1_predicted.txt",
    );
  });
});

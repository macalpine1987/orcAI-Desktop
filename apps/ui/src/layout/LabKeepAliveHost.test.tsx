import { describe, expect, it } from "vitest";
import { isPredictPath, isResultsPath } from "./LabKeepAliveHost";

describe("LabKeepAliveHost path helpers", () => {
  it("recognizes predict and results routes", () => {
    expect(isPredictPath("/predict")).toBe(true);
    expect(isPredictPath("/predict/")).toBe(true);
    expect(isPredictPath("/results")).toBe(false);
    expect(isResultsPath("/results")).toBe(true);
    expect(isResultsPath("/results/export")).toBe(true);
    expect(isResultsPath("/predict")).toBe(false);
    expect(isPredictPath("/")).toBe(false);
  });
});

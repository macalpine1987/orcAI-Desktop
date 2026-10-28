import { describe, expect, it } from "vitest";
import { predictBatchStripPercent } from "./predictBatchStripProgress";

describe("predictBatchStripPercent", () => {
  it("returns 0 when total is 0", () => {
    expect(predictBatchStripPercent(0, 0, 50)).toBe(0);
  });

  it("counts only completed files when no in-file progress", () => {
    expect(predictBatchStripPercent(7, 12, null)).toBe(58);
  });

  it("adds partial progress for the current file", () => {
    expect(predictBatchStripPercent(7, 12, 50)).toBe(63);
  });

  it("clamps in-file progress to 0–100", () => {
    expect(predictBatchStripPercent(0, 10, 150)).toBe(10);
  });
});

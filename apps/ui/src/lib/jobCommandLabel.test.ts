import { describe, expect, it } from "vitest";
import { jobCommandLabel } from "./jobCommandLabel";

const t = ((key: string) => {
  const map: Record<string, string> = {
    "pipeline.steps.predict": "Predict calls",
    "pipeline.steps.train": "Train model",
  };
  return map[key] ?? key;
}) as import("i18next").TFunction;

describe("jobCommandLabel · ", () => {
  it("returns localized pipeline step when key exists", () => {
    expect(jobCommandLabel("predict", t)).toBe("Predict calls");
    expect(jobCommandLabel("train", t)).toBe("Train model");
  });

  it("falls back to raw command id", () => {
    expect(jobCommandLabel("custom-cmd", t)).toBe("custom-cmd");
  });
});

import { describe, expect, it } from "vitest";
import {
  analysisRunBannerI18nKey,
  analysisRunBannerTone,
} from "./analysisRunSummary";

describe("analysisRunBannerTone", () => {
  it("is ok only when this run wrote files and nothing failed", () => {
    expect(
      analysisRunBannerTone({ succeeded: 3, failed: 0, total: 3 }),
    ).toBe("ok");
  });

  it("warns when files were already on disk", () => {
    expect(
      analysisRunBannerTone({
        succeeded: 0,
        failed: 0,
        total: 4,
        preexisting: 4,
      }),
    ).toBe("warn");
    expect(
      analysisRunBannerTone({
        succeeded: 2,
        failed: 0,
        total: 4,
        preexisting: 2,
      }),
    ).toBe("warn");
  });

  it("errors when nothing succeeded and nothing was already on disk", () => {
    expect(
      analysisRunBannerTone({ succeeded: 0, failed: 3, total: 3 }),
    ).toBe("error");
  });
});

describe("analysisRunBannerI18nKey", () => {
  it("uses the preexisting copy when this run wrote nothing", () => {
    expect(
      analysisRunBannerI18nKey({
        succeeded: 0,
        failed: 0,
        total: 2,
        preexisting: 2,
      }),
    ).toBe("predict.analysis.runCompletePreexisting");
  });
});

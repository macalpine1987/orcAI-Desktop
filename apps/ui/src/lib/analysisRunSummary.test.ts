import { describe, expect, it, vi } from "vitest";
import {
  analysisRunBannerI18nKey,
  analysisRunBannerMessage,
  analysisRunBannerTone,
  notifyAnalysisRunComplete,
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

describe("notifyAnalysisRunComplete", () => {
  it("flashes info for a clean run and sticky error when all fail", () => {
    const t = vi.fn((key: string) => key) as unknown as (
      key: string,
      opts?: Record<string, unknown>,
    ) => string;
    const notifySaved = vi.fn();
    const notifyHeaderError = vi.fn();

    notifyAnalysisRunComplete(
      { succeeded: 13, failed: 0, total: 13 },
      { t: t as never, notifySaved, notifyHeaderError },
    );
    expect(notifySaved).toHaveBeenCalledWith(
      "predict.analysis.runCompleteBanner",
    );
    expect(notifyHeaderError).not.toHaveBeenCalled();

    notifySaved.mockClear();
    notifyAnalysisRunComplete(
      { succeeded: 0, failed: 3, total: 3 },
      { t: t as never, notifySaved, notifyHeaderError },
    );
    expect(notifyHeaderError).toHaveBeenCalledWith(
      "predict.analysis.runCompleteAllFailed",
    );
    expect(notifySaved).not.toHaveBeenCalled();
  });

  it("builds the i18n message with counts", () => {
    const t = vi.fn(
      (_key: string, opts?: Record<string, unknown>) =>
        `ok:${opts?.succeeded}/${opts?.total}`,
    );
    expect(
      analysisRunBannerMessage(
        { succeeded: 13, failed: 0, total: 13 },
        t as never,
      ),
    ).toBe("ok:13/13");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatUserFacingError,
  formatUserFacingErrorRequired,
  truncateUserError,
} from "./userFacingError";

const t = (key: string, _opts?: Record<string, unknown>) => key;

describe("userFacingError", () => {
  it("returns null for abort", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(formatUserFacingError(err, t)).toBeNull();
  });

  it("maps network failures", () => {
    expect(formatUserFacingError(new Error("Failed to fetch"), t)).toBe(
      "common.networkError",
    );
  });

  it("truncates long messages", () => {
    const long = "x".repeat(400);
    expect(truncateUserError(long, 50).length).toBe(50);
    expect(truncateUserError(long, 50).endsWith("…")).toBe(true);
  });

  it("uses pipeline title when preferPipeline and classified", () => {
    const msg = formatUserFacingError(
      new Error("Cancelled by user"),
      t,
      { preferPipeline: true, locale: "en" },
    );
    expect(msg).toBe("pipeline.errors.cancelled.title");
  });

  it("required always returns a string", () => {
    expect(
      formatUserFacingErrorRequired(new DOMException("Aborted", "AbortError"), t),
    ).toBe("common.requestFailed");
  });

  it("maps known runtime / job English strings to i18n keys", () => {
    expect(formatUserFacingError(new Error("Operation timed out"), t)).toBe(
      "home.runtimeOperationTimedOut",
    );
    expect(formatUserFacingError(new Error("Start the sidecar first."), t)).toBe(
      "home.runtimeStartSidecarFirst",
    );
    expect(formatUserFacingError(new Error("Sidecar process exited"), t)).toBe(
      "jobs.sidecarProcessExited",
    );
    expect(
      formatUserFacingError(
        new Error("Sidecar process exited (exit status: 1)."),
        t,
      ),
    ).toBe("jobs.sidecarProcessExited");
    expect(
      formatUserFacingError(new Error("Sidecar process exited (signal: 9)"), t),
    ).toBe("jobs.sidecarProcessExited");
  });
});



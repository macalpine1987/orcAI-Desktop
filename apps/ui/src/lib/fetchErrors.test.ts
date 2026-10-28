import { describe, expect, it } from "vitest";
import { isAbortError } from "./fetchErrors";

describe("isAbortError", () => {
  it("detects AbortError / TimeoutError / WKWebView wording", () => {
    expect(isAbortError(new DOMException("Fetch is aborted", "AbortError"))).toBe(
      true,
    );
    expect(isAbortError(new DOMException("Timed out", "TimeoutError"))).toBe(true);
    const e = new Error("Fetch is aborted");
    e.name = "AbortError";
    expect(isAbortError(e)).toBe(true);
    expect(isAbortError(new Error("Fetch is aborted"))).toBe(true);
    expect(isAbortError(new Error("network down"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

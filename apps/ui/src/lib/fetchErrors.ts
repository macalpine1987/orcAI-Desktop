/** WKWebView / Chromium often surface timeouts as AbortError with this wording. */
export function isAbortError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    const msg = err.message || "";
    if (/fetch is aborted/i.test(msg)) return true;
    if (/aborted without reason/i.test(msg)) return true;
    if (/the operation was aborted/i.test(msg)) return true;
    if (/signal timed out/i.test(msg)) return true;
  }
  return /fetch is aborted/i.test(String(err));
}

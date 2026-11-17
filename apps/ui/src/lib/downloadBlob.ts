/** Trigger a browser download and revoke the object URL after a short delay. */

const REVOKE_AFTER_MS = 60_000;

export function downloadBlob(
  blob: Blob,
  fileName: string,
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

export function downloadTextFile(
  content: string,
  fileName: string,
  mime = "text/plain;charset=utf-8",
): void {
  downloadBlob(new Blob([content], { type: mime }), fileName);
}

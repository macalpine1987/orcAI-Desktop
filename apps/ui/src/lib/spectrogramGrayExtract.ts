/** Yield to the browser so large tile decode does not freeze the UI thread. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Pull luminance from RGBA ImageData into a compact gray buffer, in chunks.
 * Aborts cleanly when the caller cancels (new tile / unmount).
 */
export async function extractGrayLuminanceAsync(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  signal?: AbortSignal,
  chunkPixels = 48_000,
): Promise<Uint8ClampedArray> {
  const n = width * height;
  const pixels = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i += chunkPixels) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const end = Math.min(i + chunkPixels, n);
    for (let j = i; j < end; j++) {
      pixels[j] = rgba[j * 4] ?? 0;
    }
    if (end < n) await yieldToMain();
  }
  return pixels;
}

import { describe, expect, it } from "vitest";
import {
  fetchSpectrogramTileBlob,
  invalidateSpectrogramTileCache,
  spectrogramTileCacheKey,
  spectrogramTileCacheSize,
} from "./spectrogramTileCache";

describe("spectrogramTileCache", () => {
  it("strips cache-bust params from keys", () => {
    const a = spectrogramTileCacheKey(
      "http://127.0.0.1:9/v1/spectrogram/tile?path=/a.wav&t0=0&t1=20&_=1&v=1-gray",
    );
    const b = spectrogramTileCacheKey(
      "http://127.0.0.1:9/v1/spectrogram/tile?path=/a.wav&t0=0&t1=20&_=99&v=99-gray",
    );
    expect(a).toBe(b);
    expect(a).not.toContain("_=");
  });

  it("returns cached blobs on repeat fetch", async () => {
    invalidateSpectrogramTileCache();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const url = "http://tile.test/unique-cache-hit";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(blob, { status: 200 });
    }) as typeof fetch;

    try {
      const first = await fetchSpectrogramTileBlob(url);
      const second = await fetchSpectrogramTileBlob(url);
      expect(calls).toBe(1);
      expect(first).toBe(second);
      expect(spectrogramTileCacheSize()).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateSpectrogramTileCache();
    }
  });

  it("shares one in-flight request across callers", async () => {
    invalidateSpectrogramTileCache();
    const blob = new Blob([new Uint8Array([9])], { type: "image/png" });
    const url = "http://tile.test/shared-inflight";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(blob, { status: 200 });
    }) as typeof fetch;

    try {
      const [a, b] = await Promise.all([
        fetchSpectrogramTileBlob(url),
        fetchSpectrogramTileBlob(url),
      ]);
      expect(calls).toBe(1);
      expect(a).toBe(b);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateSpectrogramTileCache();
    }
  });
});

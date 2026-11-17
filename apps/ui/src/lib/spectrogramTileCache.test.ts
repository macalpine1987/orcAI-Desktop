import { describe, expect, it } from "vitest";
import {
  SPECTROGRAM_TILE_CACHE_MAX_ENTRIES,
  fetchSpectrogramTileBlob,
  invalidateSpectrogramTileCache,
  sidecarPortRequiresTileInvalidate,
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

  it("evicts oldest tiles when resize width buckets exceed the LRU", async () => {
    invalidateSpectrogramTileCache();
    const blob = new Blob([new Uint8Array([7])], { type: "image/png" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(blob, { status: 200 })) as typeof fetch;

    try {
      const n = SPECTROGRAM_TILE_CACHE_MAX_ENTRIES + 8;
      for (let i = 0; i < n; i += 1) {
        await fetchSpectrogramTileBlob(
          `http://tile.test/width-bucket-${i}?width=${640 + i * 64}`,
        );
      }
      expect(spectrogramTileCacheSize()).toBe(SPECTROGRAM_TILE_CACHE_MAX_ENTRIES);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateSpectrogramTileCache();
    }
  });

  it("does not invalidate tiles on first port observe or same-port remount", () => {
    expect(sidecarPortRequiresTileInvalidate(undefined, 8741)).toBe(false);
    expect(sidecarPortRequiresTileInvalidate(8741, 8741)).toBe(false);
    expect(sidecarPortRequiresTileInvalidate(8741, 9000)).toBe(true);
    expect(sidecarPortRequiresTileInvalidate(8741, null)).toBe(true);
    expect(sidecarPortRequiresTileInvalidate(null, 8741)).toBe(true);
  });
});

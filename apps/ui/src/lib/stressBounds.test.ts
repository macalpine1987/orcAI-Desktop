/**
 * Stress / bound checks for client LRU and session Maps (no live sidecar).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  SPECTROGRAM_TILE_CACHE_MAX_BYTES,
  SPECTROGRAM_TILE_CACHE_MAX_ENTRIES,
  fetchSpectrogramTileBlob,
  invalidateSpectrogramTileCache,
  spectrogramTileCacheSize,
} from "./spectrogramTileCache";
import {
  rememberSpectrogramView,
  resolveSpectrogramRememberedView,
} from "./spectrogramViewMemory";

describe("stress · spectrogram tile LRU", () => {
  afterEach(() => {
    invalidateSpectrogramTileCache();
  });

  it("entry flood stays at max entries", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(1024), { status: 200 })) as typeof fetch;
    try {
      const n = SPECTROGRAM_TILE_CACHE_MAX_ENTRIES + 40;
      for (let i = 0; i < n; i += 1) {
        await fetchSpectrogramTileBlob(
          `http://127.0.0.1:9/v1/spectrograms/tile?path=/w${i}.wav&t0=0&t1=1`,
        );
      }
      expect(spectrogramTileCacheSize()).toBe(SPECTROGRAM_TILE_CACHE_MAX_ENTRIES);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("byte-budget flood prunes under soft ceiling", async () => {
    const origFetch = globalThis.fetch;
    // ~2 MiB blobs → over 48 MiB budget before entry cap alone would stop growth.
    const chunk = new Uint8Array(2 * 1024 * 1024);
    globalThis.fetch = (async () =>
      new Response(chunk, { status: 200 })) as typeof fetch;
    try {
      for (let i = 0; i < 40; i += 1) {
        await fetchSpectrogramTileBlob(
          `http://127.0.0.1:9/v1/spectrograms/tile?path=/big${i}.wav&t0=0&t1=2`,
        );
      }
      expect(spectrogramTileCacheSize()).toBeLessThanOrEqual(
        SPECTROGRAM_TILE_CACHE_MAX_ENTRIES,
      );
      // Soft byte budget should keep far fewer than 40×2MiB resident.
      expect(spectrogramTileCacheSize()).toBeLessThanOrEqual(
        Math.ceil(SPECTROGRAM_TILE_CACHE_MAX_BYTES / (2 * 1024 * 1024)) + 1,
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("stress · spectrogram view memory", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("remembers at most 40 views under path flood", () => {
    for (let i = 0; i < 80; i += 1) {
      rememberSpectrogramView(`/data/wav-${i}.wav`, {
        viewStart: 0,
        viewSpan: 20,
        playheadSec: 1,
        selected: null,
      }, "proj");
    }
    const raw = localStorage.getItem("orcai-spectrogram-view");
    expect(raw).toBeTruthy();
    const map = JSON.parse(String(raw)) as Record<string, unknown>;
    expect(Object.keys(map).length).toBeLessThanOrEqual(40);
    // Newest still present.
    const last = resolveSpectrogramRememberedView("/data/wav-79.wav", 60, "proj");
    expect(last.playheadSec).toBe(1);
  });
});

/** Client LRU for spectrogram tile PNG/JPEG blobs (smooth zoom/pan revisit). */

import { TILE_FETCH_TIMEOUT_MS } from "./timeouts";

export { TILE_FETCH_TIMEOUT_MS };

/** Soft ceiling so resize width buckets cannot grow the LRU without bound. */
export const SPECTROGRAM_TILE_CACHE_MAX_ENTRIES = 64;
const MAX_ENTRIES = SPECTROGRAM_TILE_CACHE_MAX_ENTRIES;
/** Soft byte budget (~48 MiB) so large PNG tiles cannot pin unbounded RAM. */
export const SPECTROGRAM_TILE_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const MAX_BYTES = SPECTROGRAM_TILE_CACHE_MAX_BYTES;

const cache = new Map<string, Blob>();
let cacheBytes = 0;
/** In-flight fetches so pan prefetch and UI load share one network request. */
const inflight = new Map<
  string,
  {
    promise: Promise<Blob>;
    controller: AbortController;
    generation: number;
    waiters: number;
  }
>();
/** Bumped on invalidate so late completions cannot repopulate the cache. */
let cacheGeneration = 0;

/** Stable key: ignore cache-bust query params (`_`, `v`). */
export function spectrogramTileCacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("_");
    u.searchParams.delete("v");
    return u.toString();
  } catch {
    return url;
  }
}

export function invalidateSpectrogramTileCache(): void {
  cacheGeneration += 1;
  cache.clear();
  cacheBytes = 0;
  for (const entry of inflight.values()) {
    entry.controller.abort();
  }
  inflight.clear();
}

/**
 * Sidecar port change must drop tiles (URLs bind the live port). Remounting
 * Analysis with the same port must keep the LRU — otherwise every nav away/back
 * forces a cold STFT reload.
 */
export function sidecarPortRequiresTileInvalidate(
  previous: number | null | undefined,
  next: number | null,
): boolean {
  if (previous === undefined) return false;
  return previous !== next;
}

export function spectrogramTileCacheSize(): number {
  return cache.size;
}

function dropOldestUnlocked(): void {
  const oldest = cache.keys().next().value;
  if (oldest == null) return;
  const prev = cache.get(oldest);
  cache.delete(oldest);
  if (prev) cacheBytes = Math.max(0, cacheBytes - prev.size);
}

function rememberBlob(key: string, blob: Blob, generation: number): void {
  if (generation !== cacheGeneration) return;
  const existing = cache.get(key);
  if (existing) {
    cacheBytes = Math.max(0, cacheBytes - existing.size);
    cache.delete(key);
  }
  cache.set(key, blob);
  cacheBytes += blob.size;
  while (
    cache.size > MAX_ENTRIES ||
    (cacheBytes > MAX_BYTES && cache.size > 1)
  ) {
    dropOldestUnlocked();
  }
}

/**
 * Fetch a tile blob (LRU + shared in-flight).
 * Abort only cancels the network request when the last waiter leaves.
 */
export async function fetchSpectrogramTileBlob(
  url: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const key = spectrogramTileCacheKey(url);
  const hit = cache.get(key);
  if (hit) {
    rememberBlob(key, hit, cacheGeneration);
    return hit;
  }

  let entry = inflight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const generation = cacheGeneration;
    const timer = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);
    let promise!: Promise<Blob>;
    promise = (async () => {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`tile ${res.status}`);
        const blob = await res.blob();
        rememberBlob(key, blob, generation);
        return blob;
      } finally {
        clearTimeout(timer);
        const current = inflight.get(key);
        if (current?.promise === promise) inflight.delete(key);
      }
    })();
    entry = { promise, controller, generation, waiters: 0 };
    inflight.set(key, entry);
  }

  entry.waiters += 1;
  let released = false;
  const releaseWaiter = () => {
    if (released) return;
    released = true;
    const current = inflight.get(key);
    if (!current || current.promise !== entry!.promise) return;
    current.waiters = Math.max(0, current.waiters - 1);
    if (current.waiters === 0) {
      current.controller.abort();
    }
  };

  if (signal) {
    if (signal.aborted) {
      releaseWaiter();
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", releaseWaiter, { once: true });
  }

  try {
    const blob = await entry.promise;
    if (signal?.aborted || entry.generation !== cacheGeneration) {
      throw new DOMException("Aborted", "AbortError");
    }
    return blob;
  } catch (err) {
    if (signal?.aborted || entry.generation !== cacheGeneration) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw err;
  } finally {
    if (signal && !signal.aborted) {
      signal.removeEventListener("abort", releaseWaiter);
    }
    // Successful / failed completion: drop waiter without aborting peers.
    if (!released) {
      released = true;
      const current = inflight.get(key);
      if (current && current.promise === entry.promise) {
        current.waiters = Math.max(0, current.waiters - 1);
      }
    }
  }
}

/** Fire-and-forget warm of the LRU (pan neighbors). Errors are ignored. */
export function prefetchSpectrogramTileBlob(url: string): void {
  const key = spectrogramTileCacheKey(url);
  if (cache.has(key) || inflight.has(key)) return;
  void fetchSpectrogramTileBlob(url).catch(() => {
    /* ignore prefetch failures */
  });
}

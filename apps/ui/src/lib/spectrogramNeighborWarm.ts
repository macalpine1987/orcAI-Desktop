import {
  fetchSpectrogramMeta,
  peekSpectrogramMeta,
  spectrogramTileUrl,
  warmSpectrogramCache,
} from "../api/spectrogram";
import { shouldWarmFullSpectrogram } from "./integrationSettings";
import { prefetchSpectrogramTileBlob } from "./spectrogramTileCache";
import {
  SPECTROGRAM_SEGMENT_SEC,
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
  spectrogramTilePixelWidth,
} from "./spectrogramView";

const DEFAULT_TILE_WIDTH = 900;
const DEFAULT_TILE_HEIGHT = 280;

/**
 * After the active spectrogram paints, warm ±1 neighbor WAVs so the next
 * strip switch hits disk/RAM cache instead of a cold full-file STFT.
 */
export async function warmNeighborSpectrograms(
  neighborPaths: string[],
  options: {
    channel?: number;
    orcaiParameter?: string | null;
    signal?: AbortSignal;
    tileWidth?: number;
    tileHeight?: number;
  } = {},
): Promise<void> {
  const channel = options.channel ?? 1;
  const orcaiParameter = options.orcaiParameter ?? null;
  const tileWidth = options.tileWidth ?? DEFAULT_TILE_WIDTH;
  const tileHeight = options.tileHeight ?? DEFAULT_TILE_HEIGHT;
  const signal = options.signal;

  for (const path of neighborPaths) {
    if (signal?.aborted) return;
    const trimmed = path.trim();
    if (!trimmed) continue;
    try {
      let meta = peekSpectrogramMeta(trimmed, orcaiParameter);
      if (!meta) {
        meta = await fetchSpectrogramMeta(trimmed, {
          orcaiParameter,
          signal,
        });
      }
      if (signal?.aborted || !meta) return;

      if (shouldWarmFullSpectrogram(meta.duration_sec)) {
        await warmSpectrogramCache(trimmed, {
          channel,
          orcaiParameter,
          signal,
        });
        if (signal?.aborted) return;
      }

      const span = spectrogramSegmentWindow(0, meta.duration_sec).viewSpan;
      const win = spectrogramTileOverscanWindow(
        0,
        Math.min(SPECTROGRAM_SEGMENT_SEC, span),
        meta.duration_sec,
      );
      const width = spectrogramTilePixelWidth(
        tileWidth,
        win.t0,
        win.t1,
        Math.max(0.001, win.t1 - win.t0),
      );
      prefetchSpectrogramTileBlob(
        spectrogramTileUrl({
          path: meta.path,
          t0: win.t0,
          t1: win.t1,
          width,
          height: tileHeight,
          channel,
          orcai_parameter: orcaiParameter ?? undefined,
          colormap: "gray",
        }),
      );
    } catch {
      /* ignore warm/prefetch failures — never block browsing */
    }
  }
}

/** Paths immediately before/after the active file in the Results strip. */
export function neighborWavPaths(
  files: { path: string; kind?: string }[],
  activePath: string | null | undefined,
): string[] {
  if (!activePath) return [];
  const wavs = files.filter(
    (f) => (f.kind == null || f.kind === "wav") && Boolean(f.path?.trim()),
  );
  const idx = wavs.findIndex((f) => f.path === activePath);
  if (idx < 0) return [];
  const out: string[] = [];
  if (idx > 0) out.push(wavs[idx - 1]!.path);
  if (idx < wavs.length - 1) out.push(wavs[idx + 1]!.path);
  return out;
}

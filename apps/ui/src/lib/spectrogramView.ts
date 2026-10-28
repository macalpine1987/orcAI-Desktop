/** Fixed window size aligned with orcAI inference (seconds). */
export const SPECTROGRAM_SEGMENT_SEC = 200;

/** Tightest zoom-in window for the spectrogram plot (seconds). */
export const SPECTROGRAM_MIN_VIEW_SPAN_SEC = 2;

/**
 * Leftover shorter than the minimum useful window is not its own page.
 * A 3:20 file (200.0x s) must not show «segment 1 / 2».
 */
export const SPECTROGRAM_SEGMENT_REMAINDER_MIN_SEC =
  SPECTROGRAM_MIN_VIEW_SPAN_SEC;

/**
 * Tile / histogram display kind.
 * - ``orcai`` — full-file ``make_spectrogram`` (global quantiles); API also accepts legacy ``log_mel``.
 * - ``linear`` — raw magnitude STFT (`stft_linear_slice`), not orcAI preprocess.
 */
export type SpectrogramDisplayKind = "orcai" | "linear" | "log_mel";

/** Default tiles: orcAI STFT path (stable full-file contrast). */
export const SPECTROGRAM_DISPLAY_KIND = "orcai" as const satisfies SpectrogramDisplayKind;

/**
 * Y-axis / overlay / cursor mapping. orcAI spectrograms are linear in Hz
 * (freq_range 0–16 kHz), so overlays must use linear geometry.
 */
export const SPECTROGRAM_AXIS_KIND = "linear" as const satisfies SpectrogramDisplayKind;

export const SPECTROGRAM_COLORMAPS = [
  "inferno",
  "viridis",
  "plasma",
  "magma",
  "cividis",
  "gray",
] as const;

export type SpectrogramColormap = (typeof SPECTROGRAM_COLORMAPS)[number];

/** Labels match the matplotlib maps used by orcAI. */
export const SPECTROGRAM_COLORMAP_LABEL: Record<SpectrogramColormap, string> = {
  inferno: "inferno",
  viridis: "viridis",
  plasma: "plasma",
  magma: "magma",
  cividis: "cividis",
  gray: "Greys",
};

export function isSpectrogramColormap(
  value: string | null | undefined,
): value is SpectrogramColormap {
  return (SPECTROGRAM_COLORMAPS as readonly string[]).includes(value ?? "");
}

/** Analysis default is matplotlib Greys when the project has no saved choice. */
export function spectrogramColormapFromProject(
  value: string | null | undefined,
): SpectrogramColormap {
  return isSpectrogramColormap(value) ? value : "gray";
}

export function spectrogramSegmentCount(durationSec: number): number {
  if (durationSec <= 0) return 1;
  const raw = Math.max(1, Math.ceil(durationSec / SPECTROGRAM_SEGMENT_SEC));
  if (raw <= 1) return 1;
  const lastStart = (raw - 1) * SPECTROGRAM_SEGMENT_SEC;
  const remainder = durationSec - lastStart;
  if (remainder < SPECTROGRAM_SEGMENT_REMAINDER_MIN_SEC) {
    return raw - 1;
  }
  return raw;
}

export function spectrogramSegmentWindow(
  segmentIndex: number,
  durationSec: number,
): {
  segmentIndex: number;
  viewStart: number;
  viewSpan: number;
  segmentTotal: number;
} {
  const segmentTotal = spectrogramSegmentCount(durationSec);
  const i = Math.max(0, Math.min(segmentIndex, segmentTotal - 1));
  const viewStart = i * SPECTROGRAM_SEGMENT_SEC;
  const tail = Math.max(0.01, durationSec - viewStart);
  // Last page always runs to EOF so a folded remainder is still visible.
  const viewSpan =
    i >= segmentTotal - 1
      ? tail
      : Math.min(SPECTROGRAM_SEGMENT_SEC, tail);
  return { segmentIndex: i, viewStart, viewSpan, segmentTotal };
}

export function spectrogramSegmentIndexForStart(
  viewStart: number,
  durationSec: number,
): number {
  const total = spectrogramSegmentCount(durationSec);
  const i = Math.floor(Math.max(0, viewStart) / SPECTROGRAM_SEGMENT_SEC);
  return Math.max(0, Math.min(i, total - 1));
}

/** Default (widest) span for the current segment — zoom slider floor. */
export function spectrogramDefaultViewSpan(
  segmentIndex: number,
  durationSec: number,
): number {
  return spectrogramSegmentWindow(segmentIndex, durationSec).viewSpan;
}

/**
 * Zoom level 0 = default segment window, 1 = maximum zoom-in.
 * Slider cannot go below the default (no zoom-out past segment size).
 */
export function spectrogramZoomLevel(
  viewSpan: number,
  defaultSpan: number,
): number {
  const maxSpan = Math.max(defaultSpan, SPECTROGRAM_MIN_VIEW_SPAN_SEC);
  const minSpan = Math.min(SPECTROGRAM_MIN_VIEW_SPAN_SEC, maxSpan);
  if (maxSpan <= minSpan + 1e-6) return 1;
  return Math.max(0, Math.min(1, (maxSpan - viewSpan) / (maxSpan - minSpan)));
}

export function spectrogramViewSpanForZoom(
  zoom: number,
  defaultSpan: number,
): number {
  const maxSpan = Math.max(defaultSpan, SPECTROGRAM_MIN_VIEW_SPAN_SEC);
  const minSpan = Math.min(SPECTROGRAM_MIN_VIEW_SPAN_SEC, maxSpan);
  const z = Math.max(0, Math.min(1, zoom));
  return maxSpan - z * (maxSpan - minSpan);
}

/** Quantize a view window so nearby slider positions share one tile (cache-friendly). */
export function quantizeSpectrogramTileWindow(
  t0: number,
  t1: number,
  durationSec: number,
  quantumSec = 0.25,
): { t0: number; t1: number } {
  const duration = Math.max(0, durationSec);
  let span = Math.max(SPECTROGRAM_MIN_VIEW_SPAN_SEC, t1 - t0);
  if (quantumSec > 0) {
    span = Math.max(
      SPECTROGRAM_MIN_VIEW_SPAN_SEC,
      Math.round(span / quantumSec) * quantumSec,
    );
  }
  span = Math.min(span, Math.max(SPECTROGRAM_MIN_VIEW_SPAN_SEC, duration || span));
  const center = (t0 + t1) / 2;
  let qt0 =
    quantumSec > 0
      ? Math.round((center - span / 2) / quantumSec) * quantumSec
      : center - span / 2;
  qt0 = Math.max(0, Math.min(qt0, Math.max(0, duration - span)));
  return { t0: qt0, t1: qt0 + span };
}

/**
 * Extra time on each side of the live view when requesting a tile.
 * Lets horizontal pan use CSS translate before a new STFT is needed.
 */
export const SPECTROGRAM_TILE_OVERSCAN_RATIO = 0.75;

/** Fraction of the live span used as a soft edge (prefetch only — no display swap). */
export const SPECTROGRAM_TILE_EDGE_MARGIN_RATIO = 0.2;

/**
 * Expand [viewStart, viewEnd] with overscan, clamp to the file, then quantize.
 */
export function spectrogramTileOverscanWindow(
  viewStart: number,
  viewEnd: number,
  durationSec: number,
  overscanRatio = SPECTROGRAM_TILE_OVERSCAN_RATIO,
): { t0: number; t1: number } {
  const duration = Math.max(0, durationSec);
  const span = Math.max(SPECTROGRAM_MIN_VIEW_SPAN_SEC, viewEnd - viewStart);
  const pad = span * Math.max(0, overscanRatio);
  const targetSpan = Math.min(duration || span + 2 * pad, span + 2 * pad);
  let t0 = Math.max(0, viewStart - pad);
  let t1 = Math.min(duration, viewEnd + pad);
  if (t1 - t0 < targetSpan - 1e-6) {
    if (t0 <= 1e-9) {
      t1 = Math.min(duration, t0 + targetSpan);
    } else if (t1 >= duration - 1e-9) {
      t0 = Math.max(0, t1 - targetSpan);
    }
  }
  return quantizeSpectrogramTileWindow(t0, t1, duration);
}

/** True when the live view sticks out past the loaded tile (must refetch / swap). */
export function spectrogramViewOutsideTile(
  viewStart: number,
  viewEnd: number,
  tile: { t0: number; t1: number },
): boolean {
  return viewStart < tile.t0 - 1e-6 || viewEnd > tile.t1 + 1e-6;
}

/**
 * True when the view is still covered by the tile but near a soft edge
 * (warm the next overscan in cache — do not change the displayed tile URL).
 */
export function spectrogramViewNearTileEdge(
  viewStart: number,
  viewEnd: number,
  tile: { t0: number; t1: number },
  edgeMarginRatio = SPECTROGRAM_TILE_EDGE_MARGIN_RATIO,
): boolean {
  if (spectrogramViewOutsideTile(viewStart, viewEnd, tile)) return false;
  const span = Math.max(1e-6, viewEnd - viewStart);
  const margin = span * Math.max(0, edgeMarginRatio);
  return viewStart < tile.t0 + margin || viewEnd > tile.t1 - margin;
}

/**
 * True when a new displayed tile is required (hard miss only).
 * Soft-edge proximity is handled via prefetch, not URL swap.
 */
export function spectrogramViewNeedsTileRefresh(
  viewStart: number,
  viewEnd: number,
  tile: { t0: number; t1: number },
  _edgeMarginRatio = SPECTROGRAM_TILE_EDGE_MARGIN_RATIO,
): boolean {
  return spectrogramViewOutsideTile(viewStart, viewEnd, tile);
}

/** Raster width so overscanned tiles keep ~1:1 px density with the live view. */
export function spectrogramTilePixelWidth(
  plotWidthPx: number,
  tileT0: number,
  tileT1: number,
  visibleSpan: number,
  maxWidth = 4096,
): number {
  const tileSpan = Math.max(1e-6, tileT1 - tileT0);
  const vis = Math.max(1e-6, visibleSpan);
  const scaled = Math.round(Math.max(1, plotWidthPx) * (tileSpan / vis));
  return Math.max(64, Math.min(maxWidth, scaled));
}

/** Adjacent windows for background prefetch (same span as the loaded tile). */
export function spectrogramNeighborTileWindows(
  loaded: { t0: number; t1: number },
  durationSec: number,
): [{ t0: number; t1: number }, { t0: number; t1: number }] {
  const span = Math.max(SPECTROGRAM_MIN_VIEW_SPAN_SEC, loaded.t1 - loaded.t0);
  const left = quantizeSpectrogramTileWindow(
    loaded.t0 - span,
    loaded.t0,
    durationSec,
  );
  const right = quantizeSpectrogramTileWindow(
    loaded.t1,
    loaded.t1 + span,
    durationSec,
  );
  return [left, right];
}

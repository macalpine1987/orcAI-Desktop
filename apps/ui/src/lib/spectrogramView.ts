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
 * 1.25 ≈ one extra viewport each side — Hand drag stays smooth longer.
 */
export const SPECTROGRAM_TILE_OVERSCAN_RATIO = 1.25;

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

/**
 * Hard cap for STFT PNG width. Wider Retina/overscan requests used to hit
 * 3–4k and dominate resize / first-paint time; CSS scales the bitmap.
 */
export const SPECTROGRAM_TILE_MAX_WIDTH_PX = 2048;

/**
 * Hard cap for STFT PNG height. Fullscreen grows the plot well past this;
 * CSS scales the bitmap so maximize does not wait on a taller re-encode.
 */
export const SPECTROGRAM_TILE_MAX_HEIGHT_PX = 320;

/** ResizeObserver → tile width buckets (fewer abort/refetch storms). */
export const SPECTROGRAM_PLOT_WIDTH_STEP_PX = 64;
/** Layout height buckets for the plot box (overlays / CSS). */
export const SPECTROGRAM_PLOT_HEIGHT_STEP_PX = 32;
/** Coarser buckets for the STFT height query (fewer maximize refetches). */
export const SPECTROGRAM_TILE_HEIGHT_STEP_PX = 64;

/** Raster width so overscanned tiles keep ~1:1 px density with the live view. */
export function spectrogramTilePixelWidth(
  plotWidthPx: number,
  tileT0: number,
  tileT1: number,
  visibleSpan: number,
  maxWidth = SPECTROGRAM_TILE_MAX_WIDTH_PX,
): number {
  const tileSpan = Math.max(1e-6, tileT1 - tileT0);
  const vis = Math.max(1e-6, visibleSpan);
  const scaled = Math.round(Math.max(1, plotWidthPx) * (tileSpan / vis));
  const capped = Math.max(64, Math.min(maxWidth, scaled));
  return quantizeSpectrogramPlotPx(capped, SPECTROGRAM_PLOT_WIDTH_STEP_PX);
}

/** Raster height for the tile request — capped; plot CSS height may be taller. */
export function spectrogramTilePixelHeight(
  plotHeightPx: number,
  maxHeight = SPECTROGRAM_TILE_MAX_HEIGHT_PX,
  step = SPECTROGRAM_TILE_HEIGHT_STEP_PX,
): number {
  const capped = Math.max(160, Math.min(maxHeight, Math.max(1, plotHeightPx)));
  return quantizeSpectrogramPlotPx(capped, step);
}

/**
 * Convert a measured plot box to CSS px for tile requests.
 * ``getBoundingClientRect`` follows CSS ``zoom``; STFT width must stay at
 * layout px or 125% UI scale requests ~1.25× larger (slower) tiles.
 */
export function spectrogramPlotLayoutSize(
  rect: { width: number; height: number },
  uiZoom = 1,
  minHeight = 160,
): { width: number; height: number } {
  const zoom = Number.isFinite(uiZoom) && uiZoom > 0 ? uiZoom : 1;
  return {
    width: Math.max(1, Math.round(rect.width / zoom)),
    height: Math.max(minHeight, Math.round(rect.height / zoom)),
  };
}

/** Quantize layout px so ResizeObserver jitter does not abort STFT mid-flight. */
export function quantizeSpectrogramPlotPx(px: number, step = 32): number {
  const s = Math.max(1, Math.round(step));
  return Math.max(s, Math.round(px / s) * s);
}

/**
 * Overlay class-lanes must track the live CSS plot box (fillContainer stretch),
 * not the debounced/quantized STFT request size — otherwise bands thicken when
 * the canvas stretches taller than ``layoutHint``.
 */
export function spectrogramOverlayBoxSize(
  measured: { width: number; height: number },
  layoutHint?: { w: number; h: number } | null,
): { w: number; h: number } {
  if (measured.width > 0 && measured.height > 0) {
    return { w: measured.width, h: measured.height };
  }
  if (layoutHint != null && layoutHint.w > 0 && layoutHint.h > 0) {
    return { w: layoutHint.w, h: layoutHint.h };
  }
  return { w: 0, h: 0 };
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

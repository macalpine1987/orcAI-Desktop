/** Align a loaded spectrogram tile with the live view window (pan + zoom preview). */

export type SpectrogramTileViewTransform = {
  /**
   * Prefer these for layout: same % coordinate space as playhead / time axis.
   * Parent must be `overflow: hidden`; child uses width + marginLeft (no CSS transform).
   */
  widthPercent: number;
  marginLeftPercent: number;
  /** `loadedSpan / visibleSpan` — widthPercent / 100. */
  scaleX: number;
  /** Pixel form of marginLeft for a known plot width (tests / debugging). */
  translateXPx: number;
};

/**
 * Layout so a tile covering [loadedT0, loadedT1] matches the live XLim
 * [viewStart, viewStart+visibleSpan].
 *
 * Uses width/marginLeft percentages (not CSS transform) so the raster shares
 * the same horizontal mapping as the playhead and time-axis ticks.
 */
export function spectrogramTileViewTransform(params: {
  viewStart: number;
  visibleSpan: number;
  loadedT0: number;
  loadedT1: number;
  plotWidthPx: number;
}): SpectrogramTileViewTransform {
  const { viewStart, visibleSpan, loadedT0, loadedT1, plotWidthPx } = params;
  if (visibleSpan <= 0) {
    return {
      widthPercent: 100,
      marginLeftPercent: 0,
      scaleX: 1,
      translateXPx: 0,
    };
  }
  const loadedSpan = loadedT1 - loadedT0;
  if (loadedSpan <= 1e-6) {
    return {
      widthPercent: 100,
      marginLeftPercent: 0,
      scaleX: 1,
      translateXPx: 0,
    };
  }
  const scaleX = loadedSpan / visibleSpan;
  const marginLeftPercent = -((viewStart - loadedT0) / visibleSpan) * 100;
  const translateXPx =
    plotWidthPx > 0 ? (marginLeftPercent / 100) * plotWidthPx : 0;
  return {
    widthPercent: scaleX * 100,
    marginLeftPercent,
    scaleX,
    translateXPx,
  };
}

/** Horizontal pixel offset when span matches (pan only). */
export function spectrogramTilePanPx(params: {
  viewStart: number;
  visibleSpan: number;
  loadedT0: number;
  loadedT1: number;
  plotWidthPx: number;
}): number {
  const t = spectrogramTileViewTransform(params);
  if (Math.abs(t.scaleX - 1) > 1e-4) return 0;
  return t.translateXPx;
}

/** True when the live view does not exactly match the loaded tile window. */
export function spectrogramTileNeedsViewTransform(
  transform: SpectrogramTileViewTransform,
): boolean {
  return (
    Math.abs(transform.scaleX - 1) > 1e-4 ||
    Math.abs(transform.marginLeftPercent) > 0.01
  );
}

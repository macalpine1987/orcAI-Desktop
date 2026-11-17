import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { spectrogramTileUrl } from "../api/spectrogram";
import {
  SPECTROGRAM_DISPLAY_KIND,
  spectrogramNeighborTileWindows,
  spectrogramSegmentWindow,
  spectrogramTileOverscanWindow,
  spectrogramTilePixelHeight,
  spectrogramTilePixelWidth,
  spectrogramViewNearTileEdge,
  spectrogramViewOutsideTile,
} from "../lib/spectrogramView";

import { prefetchSpectrogramTileBlob } from "../lib/spectrogramTileCache";
import {
  spectrogramTileNeedsViewTransform,
  spectrogramTileViewTransform,
} from "../lib/spectrogramTilePan";

/** Settle delay before swapping STFT tile when the view leaves the loaded window. */
export const TILE_FETCH_DEBOUNCE_MS = 90;
/** Longer settle while Hand is armed (wheel / nudge) — fewer mid-pan STFTs. */
export const TILE_FETCH_DEBOUNCE_HAND_MS = 280;

type Args = {
  wavPath: string;
  channel: number;
  orcaiParameter: string | null | undefined;
  duration: number;
  viewStart: number;
  viewSpan: number;
  plotWidth: number;
  plotLayoutReady: boolean;
  specHeight: number;
  reloadKey: number;
  showSpectrogram: boolean;
  onViewportReady?: () => void;
  /**
   * While true (Hand pointer-drag), keep CSS-panning the loaded tile and do not
   * start a new STFT — swap once on release via flushTileFetch.
   */
  deferTileSwap?: boolean;
  /** Hand tool armed — use a longer debounce for wheel/button pans. */
  handPanArmed?: boolean;
};

export function useSpectrogramTileFetch({
  wavPath,
  channel,
  orcaiParameter,
  duration,
  viewStart,
  viewSpan,
  plotWidth,
  plotLayoutReady,
  specHeight,
  reloadKey,
  showSpectrogram,
  onViewportReady,
  deferTileSwap = false,
  handPanArmed = false,
}: Args) {
  const { t } = useTranslation();
  const [tileError, setTileError] = useState<string | null>(null);
  const [tileLoading, setTileLoading] = useState(true);

  const initialTileWindow = () =>
    spectrogramTileOverscanWindow(
      0,
      Math.min(duration, spectrogramSegmentWindow(0, duration).viewSpan),
      duration,
    );
  const [committedTileWindow, setCommittedTileWindow] = useState(initialTileWindow);
  const [tileFetchWindow, setTileFetchWindow] = useState(initialTileWindow);
  const tileFetchWindowRef = useRef(tileFetchWindow);
  const committedTileWindowRef = useRef(committedTileWindow);
  const viewWindowRef = useRef({ t0: 0, t1: 0 });

  const viewEnd = Math.min(duration, viewStart + viewSpan);
  const visibleSpan = Math.max(0.001, viewEnd - viewStart);
  viewWindowRef.current = { t0: viewStart, t1: viewEnd };
  committedTileWindowRef.current = committedTileWindow;
  tileFetchWindowRef.current = tileFetchWindow;

  // Debounced STFT swap — CSS-pan while the view is covered; soft edge only prefetches.
  // Hand pointer-drag: never swap mid-gesture (deferTileSwap); release calls flushTileFetch.
  useEffect(() => {
    if (!showSpectrogram || !plotLayoutReady) return;
    if (deferTileSwap) return;
    const delay = handPanArmed
      ? TILE_FETCH_DEBOUNCE_HAND_MS
      : TILE_FETCH_DEBOUNCE_MS;
    const id = window.setTimeout(() => {
      const loaded = committedTileWindowRef.current;
      const inflight = tileFetchWindowRef.current;

      if (!spectrogramViewOutsideTile(viewStart, viewEnd, loaded)) {
        if (spectrogramViewNearTileEdge(viewStart, viewEnd, loaded)) {
          const next = spectrogramTileOverscanWindow(viewStart, viewEnd, duration);
          if (
            Math.abs(next.t0 - loaded.t0) > 1e-6 ||
            Math.abs(next.t1 - loaded.t1) > 1e-6
          ) {
            const width = spectrogramTilePixelWidth(
              plotWidth,
              next.t0,
              next.t1,
              Math.max(0.001, viewEnd - viewStart),
            );
            prefetchSpectrogramTileBlob(
              spectrogramTileUrl({
                path: wavPath,
                t0: next.t0,
                t1: next.t1,
                width,
                height: spectrogramTilePixelHeight(specHeight),
                channel,
                orcai_parameter: orcaiParameter ?? undefined,
                display_kind: SPECTROGRAM_DISPLAY_KIND,
                colormap: "gray",
                _epoch: reloadKey,
              }),
            );
          }
        }
        return;
      }

      // Hard miss: swap only if inflight fetch does not already cover the view.
      if (!spectrogramViewOutsideTile(viewStart, viewEnd, inflight)) {
        return;
      }
      const next = spectrogramTileOverscanWindow(viewStart, viewEnd, duration);
      setTileFetchWindow((prev) =>
        Math.abs(prev.t0 - next.t0) < 1e-6 && Math.abs(prev.t1 - next.t1) < 1e-6
          ? prev
          : next,
      );
    }, delay);
    return () => window.clearTimeout(id);
  }, [
    viewStart,
    viewEnd,
    duration,
    plotWidth,
    plotLayoutReady,
    specHeight,
    wavPath,
    channel,
    orcaiParameter,
    reloadKey,
    showSpectrogram,
    deferTileSwap,
    handPanArmed,
  ]);

  const tileViewTransform = spectrogramTileViewTransform({
    viewStart,
    visibleSpan,
    loadedT0: committedTileWindow.t0,
    loadedT1: committedTileWindow.t1,
    plotWidthPx: plotLayoutReady ? plotWidth : 1,
  });
  const tileTransformActive = spectrogramTileNeedsViewTransform(tileViewTransform);

  useEffect(() => {
    const live = viewWindowRef.current;
    const w = spectrogramTileOverscanWindow(live.t0, live.t1, duration);
    setTileFetchWindow(w);
    setCommittedTileWindow(w);
  }, [wavPath, duration]);

  const tileRasterWidth = plotLayoutReady
    ? spectrogramTilePixelWidth(
        plotWidth,
        tileFetchWindow.t0,
        tileFetchWindow.t1,
        visibleSpan,
      )
    : 0;
  const tileRasterHeight = plotLayoutReady
    ? spectrogramTilePixelHeight(specHeight)
    : 0;

  const tileParams = useMemo(
    () => ({
      path: wavPath,
      t0: tileFetchWindow.t0,
      t1: tileFetchWindow.t1,
      width: tileRasterWidth,
      channel,
      orcai_parameter: orcaiParameter ?? undefined,
      display_kind: SPECTROGRAM_DISPLAY_KIND,
      colormap: "gray" as const,
      _epoch: reloadKey,
    }),
    [
      wavPath,
      tileFetchWindow.t0,
      tileFetchWindow.t1,
      tileRasterWidth,
      channel,
      orcaiParameter,
      reloadKey,
    ],
  );

  const grayTileSrc =
    plotLayoutReady && tileRasterWidth > 0 && tileRasterHeight > 0
      ? spectrogramTileUrl({
          ...tileParams,
          height: tileRasterHeight,
        })
      : "";
  const tileReloadToken = `${reloadKey}-${tileFetchWindow.t0}-${tileFetchWindow.t1}-${tileRasterWidth}-${tileRasterHeight}`;

  const prefetchNeighborTiles = useCallback(
    (loaded: { t0: number; t1: number }) => {
      if (!plotLayoutReady) return;
      const [left, right] = spectrogramNeighborTileWindows(loaded, duration);
      for (const win of [left, right]) {
        if (
          Math.abs(win.t0 - loaded.t0) < 1e-6 &&
          Math.abs(win.t1 - loaded.t1) < 1e-6
        ) {
          continue;
        }
        const width = spectrogramTilePixelWidth(
          plotWidth,
          win.t0,
          win.t1,
          visibleSpan,
        );
        prefetchSpectrogramTileBlob(
          spectrogramTileUrl({
            path: wavPath,
            t0: win.t0,
            t1: win.t1,
            width,
            height: tileRasterHeight,
            channel,
            orcai_parameter: orcaiParameter ?? undefined,
            display_kind: SPECTROGRAM_DISPLAY_KIND,
            colormap: "gray",
            _epoch: reloadKey,
          }),
        );
      }
    },
    [
      channel,
      duration,
      orcaiParameter,
      plotLayoutReady,
      plotWidth,
      reloadKey,
      tileRasterHeight,
      visibleSpan,
      wavPath,
    ],
  );

  const onTileLoading = useCallback(() => {
    setTileLoading(true);
    setTileError(null);
  }, []);

  const onTileLoaded = useCallback(() => {
    setTileLoading(false);
    setTileError(null);
    const loaded = tileFetchWindowRef.current;
    setCommittedTileWindow(loaded);
    prefetchNeighborTiles(loaded);
    onViewportReady?.();
  }, [prefetchNeighborTiles, onViewportReady]);

  const onTileFailed = useCallback(() => {
    setTileLoading(false);
    setTileError(t("spectrogram.tileLoadError"));
  }, [t]);

  const flushTileFetch = useCallback(() => {
    const live = viewWindowRef.current;
    const next = spectrogramTileOverscanWindow(live.t0, live.t1, duration);
    setTileFetchWindow(next);
  }, [duration]);

  /** Same % mapping as playhead / time ticks — avoid CSS transform (subpixel drift). */
  const tileMediaStyle: CSSProperties = tileTransformActive
    ? {
        width: `${tileViewTransform.widthPercent}%`,
        marginLeft: `${tileViewTransform.marginLeftPercent}%`,
        willChange: "margin-left, width",
      }
    : { width: "100%" };
  const showTileLoadingOverlay =
    (!plotLayoutReady || tileLoading) && !tileTransformActive;

  return {
    tileError,
    setTileError,
    tileLoading,
    tileFetchWindow,
    setTileFetchWindow,
    committedTileWindow,
    viewEnd,
    visibleSpan,
    grayTileSrc,
    tileReloadToken,
    tileMediaStyle,
    showTileLoadingOverlay,
    onTileLoading,
    onTileLoaded,
    onTileFailed,
    flushTileFetch,
  };
}

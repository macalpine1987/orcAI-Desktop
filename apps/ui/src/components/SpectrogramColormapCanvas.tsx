import { useCallback, useEffect, useRef } from "react";
import { grayToRgbaPixelsAsync } from "../lib/spectrogramColormapLut";
import { extractGrayLuminanceAsync } from "../lib/spectrogramGrayExtract";
import { fetchSpectrogramTileBlob } from "../lib/spectrogramTileCache";
import type { SpectrogramColormap } from "../lib/spectrogramView";

type Props = {
  /** Grayscale tile URL (`colormap=gray` on the sidecar). */
  grayTileUrl: string;
  colormap: SpectrogramColormap;
  /** Bust cache when the view window or file changes. */
  reloadToken: string;
  /** When the recording changes, drop the previous frame (keep it on zoom). */
  fileKey?: string;
  width: number;
  height: number;
  /**
   * Stretch to the parent box (studio plot). Avoids white gaps while
   * ResizeObserver / debounce lag behind CSS layout on window resize.
   */
  fillContainer?: boolean;
  alt: string;
  className?: string;
  invert?: boolean;
  onLoading?: () => void;
  onLoaded?: () => void;
  onFailed?: () => void;
};

/**
 * Audacity-style palette switching: fetch one grayscale tile, recolor in the
 * browser when Inferno/Viridis changes (no WebKit query-string cache issues).
 *
 * Keeps the last painted frame visible while a new tile loads (smooth zoom).
 * Switching recordings clears the frame so overlays cannot sit on the old plot.
 */
export function SpectrogramColormapCanvas({
  grayTileUrl,
  colormap,
  reloadToken,
  fileKey,
  width,
  height,
  fillContainer = false,
  alt,
  className,
  invert = false,
  onLoading,
  onLoaded,
  onFailed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grayRef = useRef<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
  } | null>(null);
  const colormapRef = useRef(colormap);
  colormapRef.current = colormap;
  const invertRef = useRef(invert);
  invertRef.current = invert;
  const onLoadingRef = useRef(onLoading);
  const onLoadedRef = useRef(onLoaded);
  const onFailedRef = useRef(onFailed);
  onLoadingRef.current = onLoading;
  onLoadedRef.current = onLoaded;
  onFailedRef.current = onFailed;
  const fileKeyRef = useRef(fileKey);

  const paintColormap = useCallback(
    async (
      map: SpectrogramColormap,
      inv = false,
      signal?: AbortSignal,
    ) => {
      const canvas = canvasRef.current;
      const gray = grayRef.current;
      if (!canvas || !gray) return;
      // Chunked remap yields like gray extract — palette switches stay responsive.
      const rgba = await grayToRgbaPixelsAsync(
        gray.pixels,
        gray.width,
        gray.height,
        map,
        inv,
        signal,
      );
      if (signal?.aborted) return;
      if (canvasRef.current !== canvas || grayRef.current !== gray) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(new ImageData(rgba, gray.width, gray.height), 0, 0);
    },
    [],
  );

  useEffect(() => {
    if (!grayTileUrl) return;
    const controller = new AbortController();
    const fileChanged = fileKey != null && fileKeyRef.current !== fileKey;
    fileKeyRef.current = fileKey;
    if (fileChanged) {
      grayRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    const firstPaint = grayRef.current == null;
    if (firstPaint || fileChanged) {
      onLoadingRef.current?.();
    }

    void fetchSpectrogramTileBlob(grayTileUrl, controller.signal)
      .then((blob) => {
        // Skip decode when the effect already aborted (unmount / new tile) —
        // avoids a transient ImageBitmap + RGBA copy that would only be closed.
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return createImageBitmap(blob);
      })
      .then(async (bitmap) => {
        try {
          if (controller.signal.aborted) return;
          const w = bitmap.width;
          const h = bitmap.height;
          const off = document.createElement("canvas");
          off.width = w;
          off.height = h;
          const ctx = off.getContext("2d");
          if (!ctx) throw new Error("2d context unavailable");
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(0, 0, w, h);
          // Chunked extract yields to the event loop — avoids main-thread jank
          // on large spectrogram tiles when switching recordings/zoom.
          const pixels = await extractGrayLuminanceAsync(
            data,
            w,
            h,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          grayRef.current = { pixels, width: w, height: h };
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = w;
            canvas.height = h;
          }
          await paintColormap(
            colormapRef.current,
            invertRef.current,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          onLoadedRef.current?.();
        } finally {
          bitmap.close();
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        onFailedRef.current?.();
      });

    return () => {
      controller.abort();
      // Drop the grayscale buffer so unmount does not keep a multi‑MB tile alive
      // until the next React GC of this fiber.
      grayRef.current = null;
    };
  }, [grayTileUrl, reloadToken, paintColormap, fileKey]);

  useEffect(() => {
    if (!grayRef.current) return;
    const controller = new AbortController();
    void paintColormap(colormap, invert, controller.signal).catch((err) => {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === "AbortError") return;
      if (import.meta.env.DEV) {
        console.warn("[silent:colormapPaint]", err);
      }
    });
    return () => controller.abort();
  }, [colormap, invert, paintColormap]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      width={width}
      height={height}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: fillContainer ? "100%" : `${height}px`,
      }}
    />
  );
}

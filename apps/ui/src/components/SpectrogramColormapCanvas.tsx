import { useCallback, useEffect, useRef } from "react";
import { grayToRgbaPixels } from "../lib/spectrogramColormapLut";
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

  const paintColormap = useCallback((map: SpectrogramColormap, inv = false) => {
    const canvas = canvasRef.current;
    const gray = grayRef.current;
    if (!canvas || !gray) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = grayToRgbaPixels(gray.pixels, gray.width, gray.height, map, inv);
    ctx.putImageData(new ImageData(rgba, gray.width, gray.height), 0, 0);
  }, []);

  useEffect(() => {
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
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (controller.signal.aborted) {
          bitmap.close();
          return;
        }
        const w = bitmap.width;
        const h = bitmap.height;
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const ctx = off.getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const { data } = ctx.getImageData(0, 0, w, h);
        const pixels = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) {
          pixels[i] = data[i * 4] ?? 0;
        }
        grayRef.current = { pixels, width: w, height: h };
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = w;
          canvas.height = h;
        }
        paintColormap(colormapRef.current, invertRef.current);
        onLoadedRef.current?.();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        onFailedRef.current?.();
      });

    return () => controller.abort();
  }, [grayTileUrl, reloadToken, paintColormap, fileKey]);

  useEffect(() => {
    if (grayRef.current) paintColormap(colormap, invert);
  }, [colormap, invert, paintColormap]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      width={width}
      height={height}
      className={className}
      style={{ display: "block", width: "100%", height: `${height}px` }}
    />
  );
}

import { useEffect, type RefObject } from "react";
import {
  SPECTROGRAM_PLOT_HEIGHT_STEP_PX,
  SPECTROGRAM_PLOT_WIDTH_STEP_PX,
  quantizeSpectrogramPlotPx,
  spectrogramPlotLayoutSize,
} from "../lib/spectrogramView";
import { readAppliedUiScale } from "../lib/uiScale";

/** Wait for flex/zoom/maximize layout to settle before committing tile raster size. */
export const PLOT_LAYOUT_DEBOUNCE_MS = 220;

const SPEC_HEIGHT_DEFAULT = 280;

type Args = {
  plotCanvasRef: RefObject<HTMLDivElement | null>;
  wavPath: string;
  studioChrome: boolean;
  setPlotWidth: (updater: (prev: number) => number) => void;
  setPlotHeight: (updater: (prev: number) => number) => void;
};

/** ResizeObserver → quantized plot width/height for STFT tiles. */
export function useSpectrogramPlotLayout({
  plotCanvasRef,
  wavPath,
  studioChrome,
  setPlotWidth,
  setPlotHeight,
}: Args): void {
  useEffect(() => {
    const el = plotCanvasRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const applySize = (raw: { width: number; height: number }) => {
      const layout = spectrogramPlotLayoutSize(raw, readAppliedUiScale());
      const width = quantizeSpectrogramPlotPx(
        layout.width,
        SPECTROGRAM_PLOT_WIDTH_STEP_PX,
      );
      const height = quantizeSpectrogramPlotPx(
        layout.height,
        SPECTROGRAM_PLOT_HEIGHT_STEP_PX,
      );
      setPlotWidth((prev) => (prev === width ? prev : width));
      if (studioChrome) {
        setPlotHeight((prev) => (prev === height ? prev : height));
      } else {
        setPlotHeight((prev) =>
          prev === SPEC_HEIGHT_DEFAULT ? prev : SPEC_HEIGHT_DEFAULT,
        );
      }
    };

    const scheduleSize = (raw: { width: number; height: number }) => {
      if (raw.width < 1 && raw.height < 1) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => applySize(raw), PLOT_LAYOUT_DEBOUNCE_MS);
    };

    const syncFromElement = () => {
      const rect = el.getBoundingClientRect();
      scheduleSize({ width: rect.width, height: rect.height });
    };

    syncFromElement();
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        syncFromElement();
        return;
      }
      const rect = el.getBoundingClientRect();
      let width = rect.width;
      let height = rect.height;
      // jsdom / zero boxes: fall back to contentRect from the observer.
      if (width < 1) width = entry.contentRect.width;
      if (height < 1) height = entry.contentRect.height;
      scheduleSize({ width, height });
    });
    ro.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
  }, [wavPath, studioChrome, plotCanvasRef, setPlotWidth, setPlotHeight]);
}

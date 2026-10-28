import { useCallback, useEffect } from "react";
import {
  resolveUiScaleFactor,
  type UiScalePreset,
} from "../lib/interfaceSettings";
import { applyUiScale } from "../lib/uiScale";
import {
  uiSetScale,
  windowIsFullscreen,
  windowSetFullscreen,
} from "../platform/windowChrome";

/** Sync shell chrome (scale, launch fullscreen) and F11 runtime fullscreen. */
export function useWindowChromeSync(
  uiScale: UiScalePreset,
  launchFullscreen: boolean,
) {
  useEffect(() => {
    const factor = resolveUiScaleFactor(uiScale);
    applyUiScale(factor);
    void uiSetScale(factor);
  }, [uiScale]);

  useEffect(() => {
    if (launchFullscreen) {
      void windowSetFullscreen(true);
    }
  }, [launchFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const current = await windowIsFullscreen();
    await windowSetFullscreen(!current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      e.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);
}

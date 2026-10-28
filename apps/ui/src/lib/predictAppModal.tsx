import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { getAppShellPortalHost } from "./appShellPortal";

/** Shared overlay class — centered, above app chrome (see analysis-lab.css). */
export const PREDICT_APP_MODAL_OVERLAY_CLASS = "predict-app-modal-overlay";

/**
 * Portal into the zoomed shell (`.app-shell-root`) so UI Scale 125% applies
 * to overlays. Fall back to `document.body` only if the shell is missing.
 */
export function PredictAppModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, getAppShellPortalHost());
}

import { type LabelsPreview } from "../../api/labels";
import {
  type SpectrogramColormap,
  isSpectrogramColormap,
} from "../../lib/spectrogramView";
import { type LabelLayerSource } from "../../lib/labelColors";
import { type OverlaySegment } from "../SpectrogramOverlay";

export const COLORMAP_STORAGE_KEY = "orcai.spectrogram.colormap";

export function loadStoredColormap(
  key: string,
  fallback: SpectrogramColormap,
): SpectrogramColormap {
  try {
    const v = localStorage.getItem(key);
    if (isSpectrogramColormap(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function loadColormap(): SpectrogramColormap {
  const stored = loadStoredColormap(COLORMAP_STORAGE_KEY, "inferno");
  return stored === "plasma" || stored === "magma" || stored === "cividis"
    ? "inferno"
    : stored;
}

export function tagSegments(
  preview: LabelsPreview,
  source: LabelLayerSource,
): OverlaySegment[] {
  return preview.segments.map((seg) => ({
    ...seg,
    source,
    time_unit: preview.time_unit,
  }));
}

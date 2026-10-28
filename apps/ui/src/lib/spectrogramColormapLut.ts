import type { SpectrogramColormap } from "./spectrogramView";

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Matches sidecar fallback LUTs when matplotlib is unavailable. */
function buildInfernoLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    lut[i * 3] = clamp255(1.2 * t * 255);
    lut[i * 3 + 1] = clamp255(t ** 1.5 * 255);
    lut[i * 3 + 2] = clamp255((1 - t) ** 0.5 * 255);
  }
  return lut;
}

function buildViridisLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    lut[i * 3] = clamp255(68 + 187 * t);
    lut[i * 3 + 1] = clamp255(1 + 254 * t);
    lut[i * 3 + 2] = clamp255(84 + 68 * (1 - t));
  }
  return lut;
}

/** Classic grayscale: quiet → black, loud → white. */
function buildGrayLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    lut[i * 3] = i;
    lut[i * 3 + 1] = i;
    lut[i * 3 + 2] = i;
  }
  return lut;
}

const LUT_BY_NAME: Record<SpectrogramColormap, Uint8ClampedArray> = {
  inferno: buildInfernoLut(),
  viridis: buildViridisLut(),
  gray: buildGrayLut(),
};

export function spectrogramColormapLut(name: SpectrogramColormap): Uint8ClampedArray {
  return LUT_BY_NAME[name];
}

/** Map single-channel luminance buffer to RGBA pixels (length = width * height * 4). */
export function grayToRgbaPixels(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  colormap: SpectrogramColormap,
  invert = false,
): Uint8ClampedArray {
  const lut = spectrogramColormapLut(colormap);
  const out = new Uint8ClampedArray(width * height * 4);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const g = invert ? 255 - (gray[i] ?? 0) : (gray[i] ?? 0);
    const li = g * 3;
    const o = i * 4;
    out[o] = lut[li] ?? 0;
    out[o + 1] = lut[li + 1] ?? 0;
    out[o + 2] = lut[li + 2] ?? 0;
    out[o + 3] = 255;
  }
  return out;
}

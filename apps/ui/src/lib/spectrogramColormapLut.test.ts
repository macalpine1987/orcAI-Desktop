import { describe, expect, it } from "vitest";
import { grayToRgbaPixels, spectrogramColormapLut } from "./spectrogramColormapLut";

describe("spectrogramColormapLut", () => {
  it("inferno and viridis LUTs differ", () => {
    const inferno = spectrogramColormapLut("inferno");
    const viridis = spectrogramColormapLut("viridis");
    let diff = 0;
    for (let i = 0; i < inferno.length; i++) {
      if (inferno[i] !== viridis[i]) diff++;
    }
    expect(diff).toBeGreaterThan(100);
  });

  it("gray LUT is identity luminance", () => {
    const gray = spectrogramColormapLut("gray");
    for (let i = 0; i < 256; i++) {
      expect(gray[i * 3]).toBe(i);
      expect(gray[i * 3 + 1]).toBe(i);
      expect(gray[i * 3 + 2]).toBe(i);
    }
  });

  it("grayToRgbaPixels can invert for light scientific canvas", () => {
    const gray = new Uint8ClampedArray([0, 255]);
    const normal = grayToRgbaPixels(gray, 2, 1, "gray", false);
    const inverted = grayToRgbaPixels(gray, 2, 1, "gray", true);
    expect(normal[0]).toBe(0);
    expect(inverted[0]).toBe(255);
    expect(inverted[3]).toBe(255);
  });

  it("grayToRgbaPixels maps gray ramp to RGB", () => {
    const gray = new Uint8ClampedArray([0, 64, 128, 255]);
    const inferno = grayToRgbaPixels(gray, 4, 1, "inferno");
    const viridis = grayToRgbaPixels(gray, 4, 1, "viridis");
    const classic = grayToRgbaPixels(gray, 4, 1, "gray");
    expect(inferno[0]).not.toBe(viridis[0]);
    expect(inferno[3]).toBe(255);
    expect(classic[0]).toBe(0);
    expect(classic[1]).toBe(0);
    expect(classic[2]).toBe(0);
    expect(classic[12]).toBe(255);
    expect(classic[13]).toBe(255);
    expect(classic[14]).toBe(255);
  });
});

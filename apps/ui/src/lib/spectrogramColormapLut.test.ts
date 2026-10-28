import { describe, expect, it } from "vitest";
import { grayToRgbaPixels, spectrogramColormapLut } from "./spectrogramColormapLut";
import { spectrogramColormapFromProject } from "./spectrogramView";

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

  it("matplotlib maps keep their published endpoints", () => {
    const inferno = spectrogramColormapLut("inferno");
    const viridis = spectrogramColormapLut("viridis");
    const plasma = spectrogramColormapLut("plasma");
    const cividis = spectrogramColormapLut("cividis");
    expect([inferno[0], inferno[1], inferno[2]]).toEqual([0, 0, 4]);
    expect([viridis[0], viridis[1], viridis[2]]).toEqual([68, 1, 84]);
    expect([plasma[0], plasma[1], plasma[2]]).toEqual([13, 8, 135]);
    expect([cividis[0], cividis[1], cividis[2]]).toEqual([0, 34, 78]);
    expect(inferno.length).toBe(768);
    expect(spectrogramColormapLut("magma").length).toBe(768);
    expect(spectrogramColormapLut("cividis").length).toBe(768);
  });

  it("an unset project colormap is Greys", () => {
    expect(spectrogramColormapFromProject(null)).toBe("gray");
    expect(spectrogramColormapFromProject(undefined)).toBe("gray");
    expect(spectrogramColormapFromProject("nope")).toBe("gray");
    expect(spectrogramColormapFromProject("plasma")).toBe("plasma");
  });

  it("Greys matches the matplotlib curve", () => {
    const gray = spectrogramColormapLut("gray");
    expect([gray[0], gray[1], gray[2]]).toEqual([255, 255, 255]);
    expect([gray[64 * 3], gray[64 * 3 + 1], gray[64 * 3 + 2]]).toEqual([
      217, 217, 217,
    ]);
    expect([gray[128 * 3], gray[128 * 3 + 1], gray[128 * 3 + 2]]).toEqual([
      149, 149, 149,
    ]);
    expect([gray[765], gray[766], gray[767]]).toEqual([0, 0, 0]);
    expect(gray.length).toBe(768);
  });

  it("grayToRgbaPixels can invert for light scientific canvas", () => {
    const gray = new Uint8ClampedArray([0, 255]);
    const normal = grayToRgbaPixels(gray, 2, 1, "gray", false);
    const inverted = grayToRgbaPixels(gray, 2, 1, "gray", true);
    expect(normal[0]).toBe(255);
    expect(inverted[0]).toBe(0);
    expect(inverted[3]).toBe(255);
  });

  it("grayToRgbaPixels maps gray ramp to RGB", () => {
    const gray = new Uint8ClampedArray([0, 64, 128, 255]);
    const inferno = grayToRgbaPixels(gray, 4, 1, "inferno");
    const viridis = grayToRgbaPixels(gray, 4, 1, "viridis");
    const classic = grayToRgbaPixels(gray, 4, 1, "gray");
    expect(inferno[0]).not.toBe(viridis[0]);
    expect(inferno[3]).toBe(255);
    expect(classic[0]).toBe(255);
    expect(classic[1]).toBe(255);
    expect(classic[2]).toBe(255);
    expect(classic[12]).toBe(0);
    expect(classic[13]).toBe(0);
    expect(classic[14]).toBe(0);
  });
});

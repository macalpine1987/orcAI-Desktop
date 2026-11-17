import { describe, expect, it } from "vitest";
import { extractGrayLuminanceAsync } from "./spectrogramGrayExtract";

describe("extractGrayLuminanceAsync", () => {
  it("pulls red channel into gray buffer", async () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const gray = await extractGrayLuminanceAsync(rgba, 2, 1);
    expect([...gray]).toEqual([10, 40]);
  });

  it("aborts when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const rgba = new Uint8ClampedArray(4 * 100);
    await expect(
      extractGrayLuminanceAsync(rgba, 10, 10, controller.signal, 4),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

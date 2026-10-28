import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { SpectrogramColormapCanvas } from "./SpectrogramColormapCanvas";

vi.mock("../lib/spectrogramTileCache", () => ({
  fetchSpectrogramTileBlob: vi.fn(() => new Promise(() => {})),
}));

describe("SpectrogramColormapCanvas", () => {
  it("signals loading again when the recording fileKey changes", async () => {
    const onLoading = vi.fn();
    const { root, unmount } = renderWithProviders(
      <SpectrogramColormapCanvas
        grayTileUrl="/tile?wav=a"
        colormap="gray"
        reloadToken="1"
        fileKey="/rec/a.wav"
        width={8}
        height={8}
        alt="spec"
        onLoading={onLoading}
      />,
    );
    expect(onLoading).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <SpectrogramColormapCanvas
          grayTileUrl="/tile?wav=b"
          colormap="gray"
          reloadToken="2"
          fileKey="/rec/b.wav"
          width={8}
          height={8}
          alt="spec"
          onLoading={onLoading}
        />,
      );
    });
    expect(onLoading).toHaveBeenCalledTimes(2);
    unmount();
  });
});

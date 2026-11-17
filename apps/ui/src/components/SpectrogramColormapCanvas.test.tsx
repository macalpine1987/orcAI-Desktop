import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { SpectrogramColormapCanvas } from "./SpectrogramColormapCanvas";
import { fetchSpectrogramTileBlob } from "../lib/spectrogramTileCache";

vi.mock("../lib/spectrogramTileCache", () => ({
  fetchSpectrogramTileBlob: vi.fn(() => new Promise(() => {})),
}));

describe("SpectrogramColormapCanvas", () => {
  it("stretches to the parent when fillContainer is set", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramColormapCanvas
        grayTileUrl="/tile?wav=a"
        colormap="gray"
        reloadToken="1"
        fileKey="/rec/a.wav"
        width={120}
        height={80}
        fillContainer
        alt="spec"
      />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas?.style.height).toBe("100%");
    expect(canvas?.style.width).toBe("100%");
    unmount();
  });

  it("keeps CSS 100% height after a quantized tile size change", async () => {
    const { container, root, unmount } = renderWithProviders(
      <SpectrogramColormapCanvas
        grayTileUrl="/tile?wav=a"
        colormap="gray"
        reloadToken="1"
        fileKey="/rec/a.wav"
        width={640}
        height={256}
        fillContainer
        alt="spec"
      />,
    );
    await act(async () => {
      root.render(
        <SpectrogramColormapCanvas
          grayTileUrl="/tile?wav=a"
          colormap="gray"
          reloadToken="2"
          fileKey="/rec/a.wav"
          width={704}
          height={320}
          fillContainer
          alt="spec"
        />,
      );
    });
    const canvas = container.querySelector("canvas");
    expect(canvas?.style.height).toBe("100%");
    expect(canvas?.getAttribute("height")).toBe("320");
    unmount();
  });

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

  it("skips createImageBitmap when aborted after the tile blob arrives", async () => {
    const close = vi.fn();
    const fetchMock = vi.mocked(fetchSpectrogramTileBlob);
    fetchMock.mockResolvedValueOnce(
      new Blob([new Uint8Array([0])], { type: "image/png" }),
    );
    const originalCreate = globalThis.createImageBitmap;
    const createSpy = vi.fn(async () =>
      ({
        width: 2,
        height: 2,
        close,
      }) as ImageBitmap,
    );
    globalThis.createImageBitmap =
      createSpy as unknown as typeof createImageBitmap;

    try {
      const { unmount } = renderWithProviders(
        <SpectrogramColormapCanvas
          grayTileUrl="/tile?abort"
          colormap="gray"
          reloadToken="abort-1"
          fileKey="/rec/a.wav"
          width={2}
          height={2}
          alt="spec"
        />,
      );
      // Unmount before decode — must not allocate an ImageBitmap at all.
      unmount();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(createSpy).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    } finally {
      globalThis.createImageBitmap = originalCreate;
      fetchMock.mockImplementation(() => new Promise(() => {}));
    }
  });

  it("closes ImageBitmap if decode finished after a late abort", async () => {
    const close = vi.fn();
    const fetchMock = vi.mocked(fetchSpectrogramTileBlob);
    fetchMock.mockResolvedValueOnce(
      new Blob([new Uint8Array([0])], { type: "image/png" }),
    );
    const originalCreate = globalThis.createImageBitmap;
    let releaseBitmap!: (bitmap: ImageBitmap) => void;
    const pending = new Promise<ImageBitmap>((resolve) => {
      releaseBitmap = resolve;
    });
    globalThis.createImageBitmap = (() =>
      pending) as unknown as typeof createImageBitmap;

    try {
      const { unmount } = renderWithProviders(
        <SpectrogramColormapCanvas
          grayTileUrl="/tile?late-abort"
          colormap="gray"
          reloadToken="abort-2"
          fileKey="/rec/a.wav"
          width={2}
          height={2}
          alt="spec"
        />,
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      unmount();
      await act(async () => {
        releaseBitmap({
          width: 2,
          height: 2,
          close,
        } as ImageBitmap);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(close).toHaveBeenCalled();
    } finally {
      globalThis.createImageBitmap = originalCreate;
      fetchMock.mockImplementation(() => new Promise(() => {}));
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const isTauri = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("./tauri", () => ({
  isTauri: () => isTauri(),
}));

import {
  uiGetScale,
  uiSetScale,
  windowClosePolicy,
  windowIsFullscreen,
  windowSetFullscreen,
} from "./windowChrome";

describe("windowChrome · shell stubs", () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReset();
  });

  it("browser fallback: stop_and_close, scale 1, not fullscreen", async () => {
    isTauri.mockReturnValue(false);
    expect(await windowClosePolicy()).toBe("stop_and_close");
    expect(await windowIsFullscreen()).toBe(false);
    expect(await uiGetScale()).toBe(1.0);
    await windowSetFullscreen(true);
    await uiSetScale(1.25);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps shell hide policy", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce("hide");
    expect(await windowClosePolicy()).toBe("hide");
    expect(invoke).toHaveBeenCalledWith("window_close_policy");
  });

  it("maps unknown policy to stop_and_close", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce("whatever");
    expect(await windowClosePolicy()).toBe("stop_and_close");
  });

  it("forwards fullscreen and scale invokes", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValue(undefined);
    await windowSetFullscreen(true);
    expect(invoke).toHaveBeenCalledWith("window_set_fullscreen", {
      enabled: true,
    });

    invoke.mockResolvedValueOnce(true);
    expect(await windowIsFullscreen()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("window_is_fullscreen");

    invoke.mockResolvedValueOnce(1.25);
    expect(await uiGetScale()).toBe(1.25);
    expect(invoke).toHaveBeenCalledWith("ui_get_scale");

    invoke.mockResolvedValueOnce(undefined);
    await uiSetScale(1.5);
    expect(invoke).toHaveBeenCalledWith("ui_set_scale", { scale: 1.5 });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderWithProviders } from "../test/render";
import { SpectrogramAudioPlayer } from "./SpectrogramAudioPlayer";

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({ online: true }),
}));

vi.mock("../api/audio", () => ({
  audioPlaybackUrl: () => "http://test/audio.wav",
  audioSegmentUrl: () => "http://test/segment.wav",
}));

describe("SpectrogramAudioPlayer", () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  const baseProps = {
    wavPath: "/tmp/test.wav",
    channel: 1,
    duration: 120,
    viewStart: 0,
    viewSpan: 30,
    playheadSec: 10,
    onPlayheadChange: vi.fn(),
    segmentRange: { t0: 5, t1: 15 },
    loopRegion: null,
    onLoopRegionToggle: vi.fn(),
    hasTimeSelection: false,
  };

  it("renders transport controls and clock", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} />,
    );
    expect(container.querySelector('[role="region"]')).toBeTruthy();
    expect(container.textContent).toContain("00:10.0");
    expect(container.textContent).toContain("02:00.0");
    expect(container.querySelector('[aria-label*="Go to start"]')).toBeTruthy();
    expect(container.querySelector('[aria-label*="Loop"]')).toBeTruthy();
    unmount();
  });

  it("toggles play and pause on one transport button", async () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const playBtn = container.querySelector<HTMLButtonElement>(
      '[aria-label="Play"]',
    );
    expect(playBtn).toBeTruthy();
    expect(playBtn?.disabled).toBe(false);
    expect(playBtn?.querySelector("svg")).toBeTruthy();
    await act(async () => {
      playBtn?.click();
    });
    const pauseBtn = container.querySelector<HTMLButtonElement>(
      '[aria-label="Pause"]',
    );
    expect(pauseBtn).toBeTruthy();
    await act(async () => {
      pauseBtn?.click();
    });
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Play"]'),
    ).toBeTruthy();
    unmount();
  });

  it("shows file duration in studio LCD while audio is preparing", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    const { unmount } = renderWithProviders(
      <SpectrogramAudioPlayer
        {...baseProps}
        studioTransport
        transportSlot={slot}
        lcdSlot={slot}
      />,
    );
    // m04 studio LCD: MM:SS, no fractional seconds (120s → 02:00)
    expect(slot.textContent).toContain("02:00");
    expect(slot.textContent).not.toMatch(/\d{2}:\d{2}\.\d/);
    expect(slot.textContent).not.toMatch(/loading/i);
    expect(slot.querySelector("[data-lcd-transport='idle']")).toBeTruthy();
    unmount();
    slot.remove();
  });

  it("shows play/pause on studio LCD position and clears on stop", async () => {
    const transportSlot = document.createElement("div");
    const lcdSlot = document.createElement("div");
    document.body.appendChild(transportSlot);
    document.body.appendChild(lcdSlot);
    const { unmount } = renderWithProviders(
      <SpectrogramAudioPlayer
        {...baseProps}
        studioTransport
        transportSlot={transportSlot}
        lcdSlot={lcdSlot}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(lcdSlot.querySelector("[data-lcd-transport='idle']")).toBeTruthy();
    // Transport overlay only on «Позиция»; clocks stay centered (absolute, no flex gap).
    expect(lcdSlot.querySelectorAll(".predict-logic-lcd-transport")).toHaveLength(1);
    expect(
      lcdSlot.querySelector(".predict-logic-lcd-transport.is-idle"),
    ).toBeTruthy();
    expect(lcdSlot.querySelectorAll(".predict-logic-lcd-panel-clock")).toHaveLength(
      3,
    );
    const positionClock = lcdSlot.querySelectorAll(
      ".predict-logic-lcd-panel-clock",
    )[0];
    const durationClock = lcdSlot.querySelectorAll(
      ".predict-logic-lcd-panel-clock",
    )[1];
    expect(positionClock?.textContent).toMatch(/\d{2}:\d{2}/);
    expect(
      positionClock?.parentElement?.querySelector(".predict-logic-lcd-transport"),
    ).toBeTruthy();
    expect(
      durationClock?.parentElement?.querySelector(".predict-logic-lcd-transport"),
    ).toBeNull();

    await act(async () => {
      transportSlot
        .querySelector<HTMLButtonElement>('[aria-label="Play"]')
        ?.click();
    });
    expect(lcdSlot.querySelector("[data-lcd-transport='playing']")).toBeTruthy();
    expect(lcdSlot.querySelectorAll(".predict-logic-lcd-transport")).toHaveLength(1);
    expect(
      lcdSlot.querySelector(".predict-logic-lcd-transport.is-playing"),
    ).toBeTruthy();

    await act(async () => {
      transportSlot
        .querySelector<HTMLButtonElement>('[aria-label="Pause"]')
        ?.click();
    });
    expect(lcdSlot.querySelector("[data-lcd-transport='paused']")).toBeTruthy();
    expect(
      lcdSlot.querySelector(".predict-logic-lcd-transport.is-paused"),
    ).toBeTruthy();

    await act(async () => {
      transportSlot
        .querySelector<HTMLButtonElement>('[aria-label="Stop"]')
        ?.click();
    });
    expect(lcdSlot.querySelector("[data-lcd-transport='idle']")).toBeTruthy();
    expect(lcdSlot.querySelectorAll(".predict-logic-lcd-transport")).toHaveLength(1);
    expect(
      lcdSlot.querySelector(".predict-logic-lcd-transport.is-idle"),
    ).toBeTruthy();

    unmount();
    transportSlot.remove();
    lcdSlot.remove();
  });

  it("stops playback and seeks to start on stop button", () => {
    const onPlayheadChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} onPlayheadChange={onPlayheadChange} />,
    );
    const btn = container.querySelector<HTMLButtonElement>('[aria-label="Stop"]');
    btn?.click();
    expect(onPlayheadChange).toHaveBeenCalledWith(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    unmount();
  });

  it("seeks to start on transport button", () => {
    const onPlayheadChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} onPlayheadChange={onPlayheadChange} />,
    );
    const btn = container.querySelector<HTMLButtonElement>(
      '[aria-label*="Go to start"]',
    );
    btn?.click();
    expect(onPlayheadChange).toHaveBeenCalledWith(0);
    unmount();
  });

  it("skips forward on transport button", () => {
    const onPlayheadChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} onPlayheadChange={onPlayheadChange} />,
    );
    const btn = container.querySelector<HTMLButtonElement>(
      '[aria-label*="Forward 5"]',
    );
    btn?.click();
    expect(onPlayheadChange).toHaveBeenCalledWith(15);
    unmount();
  });

  it("seeks audio currentTime when playhead moves during playback", async () => {
    const { container, root, unmount } = renderWithProviders(
      <SpectrogramAudioPlayer {...baseProps} playheadSec={10} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Play"]')?.click();
    });
    const audio = container.querySelector("audio");
    expect(audio).toBeTruthy();
    let currentTime = 10;
    Object.defineProperty(audio!, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        currentTime = v;
      },
    });
    const { I18nextProvider } = await import("react-i18next");
    const i18n = (await import("../i18n")).default;
    const { SaveNoticeProvider } = await import("../ui/saveNotice");
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SaveNoticeProvider>
            <SpectrogramAudioPlayer {...baseProps} playheadSec={55} />
          </SaveNoticeProvider>
        </I18nextProvider>,
      );
    });
    expect(currentTime).toBe(55);
    unmount();
  });
});

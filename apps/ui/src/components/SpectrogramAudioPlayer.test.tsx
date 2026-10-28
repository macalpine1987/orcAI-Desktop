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
      />,
    );
    // m04 studio LCD: compact MM:SS without tenths (120s → 02:00)
    expect(slot.textContent).toContain("02:00");
    expect(slot.textContent).not.toMatch(/\d:\d{2}:\d{2}\.\d/);
    expect(slot.textContent).not.toMatch(/loading/i);
    unmount();
    slot.remove();
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
});

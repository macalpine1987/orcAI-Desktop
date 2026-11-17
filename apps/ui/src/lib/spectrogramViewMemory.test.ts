import { describe, expect, it } from "vitest";
import { spectrogramSegmentWindow } from "./spectrogramView";
import {
  clearRememberedSpectrogramView,
  loadRememberedStudioVolume,
  rememberSpectrogramView,
  rememberStudioVolume,
  resolveSpectrogramRememberedView,
  spectrogramViewStorageKey,
} from "./spectrogramViewMemory";
import { clearDesktopWebStorage } from "../platform/desktopReset";

const view = {
  viewStart: 12,
  viewSpan: 8,
  playheadSec: 14,
  selected: { t0: 13, t1: 15, label: "WH" },
};

describe("spectrogram view memory", () => {
  it("uses the default window when nothing is saved or duration is zero", () => {
    const fresh = spectrogramSegmentWindow(0, 90);
    expect(resolveSpectrogramRememberedView("/a.wav", 90, "p1")).toMatchObject({
      viewStart: fresh.viewStart,
      viewSpan: fresh.viewSpan,
      playheadSec: 0,
      selected: null,
    });
    expect(resolveSpectrogramRememberedView("/a.wav", 0, "p1").playheadSec).toBe(0);
    expect(resolveSpectrogramRememberedView("/a.wav", 0, "p1").selected).toBeNull();
  });

  it("restores a window and clamps a playhead that falls outside it", () => {
    rememberSpectrogramView("/a.wav", view, "p1");
    expect(resolveSpectrogramRememberedView("/a.wav", 90, "p1")).toMatchObject(view);

    rememberSpectrogramView("/a.wav", { ...view, playheadSec: 80 }, "p1");
    expect(resolveSpectrogramRememberedView("/a.wav", 90, "p1").playheadSec).toBe(12);

    rememberSpectrogramView("/a.wav", { ...view, viewStart: 200, viewSpan: 30 }, "p1");
    const clamped = resolveSpectrogramRememberedView("/a.wav", 40, "p1");
    expect(clamped.viewSpan).toBe(30);
    expect(clamped.viewStart).toBe(10);
    expect(clamped.playheadSec).toBe(14);

    rememberSpectrogramView(
      "/a.wav",
      {
        ...view,
        viewStart: 200,
        viewSpan: 30,
        playheadSec: 0,
      },
      "p1",
    );
    expect(resolveSpectrogramRememberedView("/a.wav", 40, "p1").playheadSec).toBe(10);
  });

  it("does not inherit another project's playhead for the same WAV path", () => {
    rememberSpectrogramView("/shared.wav", view, "old-project");
    expect(
      resolveSpectrogramRememberedView("/shared.wav", 90, "new-project").playheadSec,
    ).toBe(0);
    expect(
      resolveSpectrogramRememberedView("/shared.wav", 90, "old-project").playheadSec,
    ).toBe(14);
  });

  it("scopes storage keys by project id", () => {
    expect(spectrogramViewStorageKey("proj-a", "/x.wav")).toBe("proj-a\0/x.wav");
    expect(spectrogramViewStorageKey(null, "/x.wav")).toBe("/x.wav");
  });

  it("drops one recording and keeps the map to 40 entries", () => {
    rememberSpectrogramView("/keep.wav", view, "p1");
    rememberSpectrogramView("/drop.wav", view, "p1");
    clearRememberedSpectrogramView("/drop.wav", "p1");
    expect(resolveSpectrogramRememberedView("/keep.wav", 90, "p1").viewStart).toBe(12);
    expect(resolveSpectrogramRememberedView("/drop.wav", 90, "p1").viewStart).toBe(0);

    for (let i = 0; i < 41; i += 1) {
      rememberSpectrogramView(`/n${i}.wav`, view, "p1");
    }
    expect(resolveSpectrogramRememberedView("/n0.wav", 90, "p1").viewStart).toBe(0);
    expect(resolveSpectrogramRememberedView("/n40.wav", 90, "p1").viewStart).toBe(12);
    const raw = localStorage.getItem("orcai-spectrogram-view");
    expect(Object.keys(JSON.parse(raw ?? "{}"))).toHaveLength(40);
  });

  it("remembers one studio volume in the range 0–1", () => {
    expect(loadRememberedStudioVolume()).toBe(1);
    rememberStudioVolume(0.35);
    expect(loadRememberedStudioVolume()).toBeCloseTo(0.35);
    rememberStudioVolume(2);
    expect(loadRememberedStudioVolume()).toBe(1);
    rememberStudioVolume(-1);
    expect(loadRememberedStudioVolume()).toBe(0);
  });

  it("is cleared by the existing spectrogram storage prefix", () => {
    rememberSpectrogramView("/a.wav", view, "p1");
    rememberStudioVolume(0.2);
    clearDesktopWebStorage();
    expect(localStorage.getItem("orcai-spectrogram-view")).toBeNull();
    expect(localStorage.getItem("orcai-spectrogram-volume")).toBeNull();
    expect(loadRememberedStudioVolume()).toBe(1);
  });
});

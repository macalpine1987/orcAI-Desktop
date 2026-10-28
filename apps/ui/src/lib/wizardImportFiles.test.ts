import { describe, expect, it } from "vitest";
import {
  applyImportResultToWizardPicks,
  filterWavImportPaths,
  formatWavOnlyImportError,
  mergeWizardImportPicks,
  splitPathsForWizardImport,
  wizardImportPicksFromImported,
  wizardImportPicksFromPaths,
} from "./wizardImportFiles";

describe("wizardImportPicksFromPaths", () => {
  it("accepts WAV paths only", () => {
    const { picks, rejected } = splitPathsForWizardImport([
      "/x/song.flac",
      "/x/a.wav",
    ]);
    expect(picks).toHaveLength(1);
    expect(picks[0]?.recordingName).toBe("a.wav");
    expect(rejected).toEqual(["song.flac"]);
  });

  it("builds picks from paths", () => {
    const picks = wizardImportPicksFromPaths(["/x/a.wav"]);
    expect(picks[0]?.sourcePath).toBe("/x/a.wav");
    expect(picks[0]?.status).toBe("pending");
  });
});

describe("wizardImportPicksFromImported", () => {
  it("uses server dest names", () => {
    const picks = wizardImportPicksFromImported([
      {
        source: "/x/song.wav",
        dest: "/proj/recordings/song (1).wav",
        name: "song (1).wav",
        kind: "wav",
      },
    ]);
    expect(picks[0]?.recordingName).toBe("song (1).wav");
    expect(picks[0]?.status).toBe("imported");
  });
});

describe("mergeWizardImportPicks", () => {
  it("dedupes by source path", () => {
    const a = wizardImportPicksFromPaths(["/a.wav"]);
    const b = wizardImportPicksFromPaths(["/b.wav"]);
    const merged = mergeWizardImportPicks(a, b);
    expect(merged).toHaveLength(2);
  });
});

describe("formatWavOnlyImportError", () => {
  const t = (key: string, opts?: Record<string, unknown>) => {
    if (key === "audioImport.wavOnlyOne") {
      return `WAV only: ${opts?.name}`;
    }
    return `WAV only: ${opts?.names}`;
  };

  it("formats one rejected file", () => {
    expect(formatWavOnlyImportError(t, ["song.mp3"])).toContain("song.mp3");
  });

  it("returns null when all paths are wav", () => {
    expect(formatWavOnlyImportError(t, [])).toBeNull();
  });
});

describe("filterWavImportPaths", () => {
  it("separates wav and other extensions", () => {
    const { wavPaths, rejected } = filterWavImportPaths([
      "/a.wav",
      "/b.flac",
      "/c.WAV",
    ]);
    expect(wavPaths).toEqual(["/a.wav", "/c.WAV"]);
    expect(rejected).toEqual(["b.flac"]);
  });
});

describe("applyImportResultToWizardPicks", () => {
  it("marks failed imports", () => {
    const prev = wizardImportPicksFromPaths(["/ok.wav", "/bad.wav"]);
    const next = applyImportResultToWizardPicks(
      prev,
      [
        {
          source: "/ok.wav",
          dest: "/p/ok.wav",
          name: "ok.wav",
          kind: "wav",
        },
      ],
      [{ path: "/bad.wav", error: "decode error" }],
    );
    const failed = next.find((p) => p.sourcePath === "/bad.wav");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("decode error");
  });
});

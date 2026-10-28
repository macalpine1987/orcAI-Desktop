import { describe, expect, it } from "vitest";
import {
  formatPartialImportError,
  recordingsMatchingImport,
} from "./importProjectAudio";
import type { ProjectRecording } from "../api/projects";

function rec(
  name: string,
  path: string,
): ProjectRecording {
  return {
    name,
    path,
    rel_path: name,
    size_bytes: 1000,
    modified_at: 0,
    sample_rate_hz: 48_000,
    bit_depth: 16,
    duration_sec: 1,
  };
}

describe("recordingsMatchingImport", () => {
  it("matches import by dest path and output name", () => {
    const recordings = [
      rec("song.wav", "/proj/recordings/song.wav"),
      rec("other.wav", "/proj/recordings/other.wav"),
    ];
    const imported = [
      {
        source: "/Users/x/song.wav",
        dest: "/proj/recordings/song.wav",
        name: "song.wav",
        kind: "wav" as const,
      },
    ];
    expect(recordingsMatchingImport(recordings, imported)).toEqual([
      recordings[0],
    ]);
  });

  it("returns empty when job imported nothing", () => {
    expect(recordingsMatchingImport([rec("a.wav", "/p/a.wav")], [])).toEqual(
      [],
    );
  });
});

describe("formatPartialImportError", () => {
  it("lists failed basenames", () => {
    const msg = formatPartialImportError([
      { path: "/x/bad.wav", error: "decode error" },
    ]);
    expect(msg).toContain("bad.wav");
    expect(msg).toContain("decode error");
  });
});

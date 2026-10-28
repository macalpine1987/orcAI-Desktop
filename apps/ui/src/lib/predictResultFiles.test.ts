import { describe, expect, it } from "vitest";
import { recognizedQueueFiles } from "./predictResultFiles";
import type { PredictQueue } from "../workspace/predictQueue";

function queueWith(
  files: PredictQueue["files"],
): PredictQueue {
  return {
    projectId: "p1",
    projectDir: "/proj",
    files,
    activeFileName: files[0]?.name ?? null,
    selectedNames: files.map((f) => f.name),
    batchSelectionExplicit: true,
  };
}

describe("recognizedQueueFiles", () => {
  it("includes done, filtered, and running wav rows", () => {
    const q = queueWith([
      {
        name: "a.wav",
        path: "/a.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "pending",
      },
      {
        name: "b.wav",
        path: "/b.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done",
      },
      {
        name: "c.wav",
        path: "/c.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "filtered",
      },
      {
        name: "d.wav",
        path: "/d.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "failed",
      },
      {
        name: "e.wav",
        path: "/e.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "running",
      },
    ]);
    expect(recognizedQueueFiles(q).map((f) => f.name)).toEqual([
      "b.wav",
      "c.wav",
      "e.wav",
    ]);
  });

  it("onlyWithLabels keeps rows that have a label path", () => {
    const q = queueWith([
      {
        name: "labeled.wav",
        path: "/labeled.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done",
        labelPath: "/labeled_predicted.txt",
      },
      {
        name: "bare.wav",
        path: "/bare.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done",
      },
    ]);
    expect(
      recognizedQueueFiles(q, { onlyWithLabels: true }).map((f) => f.name),
    ).toEqual(["labeled.wav"]);
  });
});

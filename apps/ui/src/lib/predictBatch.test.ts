import { describe, expect, it } from "vitest";
import {
  canUseCsvPredictBatch,
  csvPredictCliRecordingPath,
  countPredictRunnable,
  filterNeedsOverwrite,
  isCsvPredictSelectionSubset,
  matchPredictBatchResultToQueueFile,
  parsePredictFileLogLine,
  predictBatchProgressUnits,
  predictFileNeedsOverwrite,
  predictFileQueuePatchesFromLog,
  predictFilesToRun,
  predictRecordingStem,
  predictSelectionCsvPath,
  resolveFilterOverwrite,
  resolvePredictOverwrite,
  selectedFileNamesForRun,
} from "./predictBatch";
import type { PredictQueue } from "../workspace/predictQueue";

function makeQueue(): PredictQueue {
  return {
    projectId: "p1",
    projectDir: "/proj",
    files: [
      {
        name: "a.wav",
        path: "/proj/a.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "pending",
      },
      {
        name: "b.wav",
        path: "/proj/b.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done",
        labelPath: "/proj/b.txt",
      },
      {
        name: "c.wav",
        path: "/proj/c.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "filtered",
        labelPath: "/proj/c.txt",
        filteredPath: "/proj/c_filtered.txt",
      },
    ],
    activeFileName: "a.wav",
    selectedNames: ["a.wav", "b.wav"],
    batchSelectionExplicit: true,
  };
}

describe("predictBatch", () => {
  it("selectedFileNamesForRun returns batch selection", () => {
    expect(selectedFileNamesForRun(makeQueue())).toEqual(["a.wav", "b.wav"]);
  });

  it("predictFileNeedsOverwrite detects prior results", () => {
    const q = makeQueue();
    expect(predictFileNeedsOverwrite(q.files[0]!)).toBe(false);
    expect(predictFileNeedsOverwrite(q.files[1]!)).toBe(true);
    expect(
      predictFileNeedsOverwrite({
        ...q.files[0]!,
        status: "failed",
        error: "boom",
      }),
    ).toBe(false);
  });

  it("predictFilesToRun excludes running files", () => {
    const q = makeQueue();
    q.files[0]!.status = "running";
    expect(predictFilesToRun(q, ["a.wav", "b.wav"]).map((f) => f.name)).toEqual([
      "b.wav",
    ]);
  });

  it("resolvePredictOverwrite respects settings and prior output", () => {
    const q = makeQueue();
    expect(resolvePredictOverwrite(q.files[0]!, false)).toBe(false);
    expect(resolvePredictOverwrite(q.files[0]!, true)).toBe(true);
    expect(resolvePredictOverwrite(q.files[1]!, false)).toBe(true);
  });

  it("filterNeedsOverwrite detects filtered output", () => {
    const q = makeQueue();
    expect(filterNeedsOverwrite(q.files[1]!)).toBe(false);
    expect(filterNeedsOverwrite(q.files[2]!)).toBe(true);
  });

  it("resolveFilterOverwrite respects settings and filtered status", () => {
    const q = makeQueue();
    expect(resolveFilterOverwrite(q.files[1]!, false)).toBe(false);
    expect(resolveFilterOverwrite(q.files[2]!, false)).toBe(true);
    expect(resolveFilterOverwrite(q.files[2]!, true)).toBe(true);
  });

  it("countPredictRunnable matches runnable files", () => {
    const q = makeQueue();
    expect(countPredictRunnable(q, ["a.wav", "b.wav"])).toBe(2);
  });

  it("canUseCsvPredictBatch requires a recording table and WAV rows", () => {
    const q = makeQueue();
    expect(canUseCsvPredictBatch(q.files.filter((f) => f.kind === "wav"), null)).toBe(
      false,
    );
    expect(
      canUseCsvPredictBatch(q.files.filter((f) => f.kind === "wav"), "/p/recording_table.csv"),
    ).toBe(true);
  });

  it("csv CLI path uses the stable subset table when selection is partial", () => {
    const pending = makeQueue().files.filter((f) => f.name === "a.wav");
    const rows = [{ recording: "a" }, { recording: "b" }];
    expect(isCsvPredictSelectionSubset(pending, rows)).toBe(true);
    expect(
      csvPredictCliRecordingPath({
        tablePath: "/proj/recording_table.csv",
        projectDir: "/proj",
        pending,
        tableRows: rows,
      }),
    ).toBe(predictSelectionCsvPath("/proj"));
    expect(
      csvPredictCliRecordingPath({
        tablePath: "/proj/recording_table.csv",
        projectDir: "/proj",
        pending: makeQueue().files.filter((f) => f.kind === "wav"),
        tableRows: [
          { recording: "a" },
          { recording: "b" },
          { recording: "c" },
        ],
      }),
    ).toBe("/proj/recording_table.csv");
  });

  it("predictRecordingStem strips .wav", () => {
    expect(predictRecordingStem("clip_a.wav")).toBe("clip_a");
    expect(predictRecordingStem("clip_a")).toBe("clip_a");
  });

  it("parsePredictFileLogLine reads the latest structured line", () => {
    expect(
      parsePredictFileLogLine([
        "Model: orcai-isl-v1",
        "[predict-file] 1/3 a",
        "[predict-file] 2/3 b",
      ]),
    ).toEqual({ current: 2, total: 3, stem: "b" });
  });

  it("predictBatchProgressUnits gives half-credit for the in-flight file", () => {
    expect(predictBatchProgressUnits({ current: 1, total: 3 })).toBe(0.5);
    expect(predictBatchProgressUnits({ current: 2, total: 3 })).toBe(1.5);
    expect(predictBatchProgressUnits({ current: 1, total: 1 }, 0.8)).toBe(0.8);
  });

  it("predictFileQueuePatchesFromLog marks prior files done", () => {
    const q = makeQueue();
    const pending = q.files.filter((f) => f.kind === "wav");
    const patches = predictFileQueuePatchesFromLog(
      pending,
      { current: 2, total: 2, stem: "b" },
      (f) => `${f.path}.pred`,
    );
    expect(patches).toEqual([
      { name: "a.wav", status: "done", labelPath: "/proj/a.wav.pred" },
      { name: "b.wav", status: "running" },
    ]);
  });

  it("matchPredictBatchResultToQueueFile matches by stem", () => {
    const q = makeQueue();
    const hit = matchPredictBatchResultToQueueFile(q.files[0]!, [
      { recording: "a", label_path: "/p/a_predicted.txt", status: "completed" },
    ]);
    expect(hit?.label_path).toBe("/p/a_predicted.txt");
  });
});

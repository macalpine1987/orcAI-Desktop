import { describe, expect, it } from "vitest";
import { buildPredictCliLine, shellQuote } from "./predictCliLine";
import {
  collisionEntriesFromSelection,
  collisionEntriesFromTableSelection,
  estimatePredictEtaSeconds,
  filterPredictQueueFiles,
  formatPredictEta,
  hasSharedOutputChannelCollision,
  hasSharedOutputMultiFileRisk,
  channelForQueueFile,
  channelMapFromRecordingTableRows,
  matchesPredictQueueFilter,
} from "./predictQueueStudio";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";

describe("predictCliLine", () => {
  it("quotes unsafe paths like shlex", () => {
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("plain")).toBe("plain");
    expect(shellQuote("/tmp/a.wav")).toBe("/tmp/a.wav");
    expect(shellQuote("/tmp/a b.wav")).toBe("'/tmp/a b.wav'");
  });

  it("builds predict line matching sidecar flag order", () => {
    const line = buildPredictCliLine({
      recording_path: "/p/rec.wav",
      channel: 1,
      model: "orcai-isl-v1",
      output_path: "default",
      threshold: 0.5,
      overwrite: false,
      save_probabilities: true,
      label_suffix: "*",
      verbosity: 2,
      project_dir: "/p",
      recording_names: ["rec"],
    });
    expect(line.startsWith("orcai predict /p/rec.wav")).toBe(true);
    expect(line).toContain("-c 1");
    expect(line).toContain("-m orcai-isl-v1");
    expect(line).toContain("-o default");
    expect(line).toContain("-th 0.5");
    expect(line).toContain("-sp");
    expect(line).not.toContain("-ow");
    expect(line).toContain("-ls '*'");
    expect(line).toContain("-v 2");
    expect(line).not.toContain("project_dir");
    expect(line).not.toContain("recording_names");
  });

  it("uses -md instead of -m when model_dir set", () => {
    const line = buildPredictCliLine({
      recording_path: "/p/a.wav",
      model_dir: "/p/models/run1",
      channel: 2,
      threshold: 0.4,
      output_path: "default",
      verbosity: 1,
    });
    expect(line).toContain("-md /p/models/run1");
    expect(line).not.toMatch(/(^|\s)-m(\s|$)/);
  });
});

describe("predictQueueStudio", () => {
  const file = (
    over: Partial<PredictQueueFile> & Pick<PredictQueueFile, "name" | "status">,
  ): PredictQueueFile => ({
    path: `/p/${over.name}`,
    kind: "wav",
    bit_depth: 16,
    sample_rate_hz: 48_000,
    duration_sec: 100,
    ...over,
  });

  it("filters all / new / failed", () => {
    expect(matchesPredictQueueFilter(file({ name: "a.wav", status: "pending" }), "new")).toBe(
      true,
    );
    expect(matchesPredictQueueFilter(file({ name: "a.wav", status: "done" }), "new")).toBe(
      false,
    );
    expect(matchesPredictQueueFilter(file({ name: "a.wav", status: "failed" }), "failed")).toBe(
      true,
    );
    const queue: PredictQueue = {
      projectId: "p1",
      projectDir: "/p",
      files: [
        file({ name: "a.wav", status: "pending" }),
        file({ name: "b.wav", status: "failed" }),
        file({ name: "c.wav", status: "done" }),
      ],
      activeFileName: null,
      selectedNames: [],
    };
    expect(filterPredictQueueFiles(queue, "failed").map((f) => f.name)).toEqual([
      "b.wav",
    ]);
  });

  it("estimates ETA from durations with fallback", () => {
    expect(estimatePredictEtaSeconds([])).toBe(0);
    expect(estimatePredictEtaSeconds([{ duration_sec: 100 }])).toBe(35);
    expect(
      estimatePredictEtaSeconds([{ duration_sec: null }, { duration_sec: null }]),
    ).toBe(90);
    expect(formatPredictEta(35)).toBe("~35s");
    expect(formatPredictEta(90)).toBe("~1m 30s");
  });

  it("detects shared -o channel collision on same stem", () => {
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out",
        entries: [
          { recordingStem: "clip", channel: 1 },
          { recordingStem: "clip", channel: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "default",
        entries: [
          { recordingStem: "clip", channel: 1 },
          { recordingStem: "clip", channel: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out",
        entries: collisionEntriesFromSelection(
          ["a.wav", "b.wav"],
          { "a.wav": 1, "b.wav": 1 },
          1,
        ),
      }),
    ).toBe(false);
  });

  it("builds channel map from recording_table rows for collision check", () => {
    const map = channelMapFromRecordingTableRows([
      { recording: "clip", channel: 1 },
      { recording: "clip", channel: null }, // ignored
      { recording: "other.wav", channel: 2 },
    ]);
    expect(map.clip).toBe(1);
    expect(map["clip.wav"]).toBe(1);
    expect(map["other.wav"]).toBe(2);
    expect(map.other).toBe(2);

    expect(
      collisionEntriesFromSelection(["clip.wav"], map, 9)[0]?.channel,
    ).toBe(1);
  });

  it("detects multi-channel same stem from recording_table rows (D-01)", () => {
    const entries = collisionEntriesFromTableSelection(
      ["clip.wav"],
      [
        { recording: "clip", channel: 1 },
        { recording: "clip", channel: 2 },
      ],
      1,
    );
    expect(entries).toEqual([
      { recordingStem: "clip", channel: 1 },
      { recordingStem: "clip", channel: 2 },
    ]);
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out/all.txt",
        entries,
      }),
    ).toBe(true);
  });

  it("resolves playback channel from predicted path then table", () => {
    expect(
      channelForQueueFile(
        {
          name: "clip.wav",
          labelPath: "/p/clip_c2_orcai-isl-v1_predicted.txt",
        },
        [{ recording: "clip", channel: 1 }],
        1,
      ),
    ).toBe(2);
    expect(
      channelForQueueFile({ name: "clip.wav" }, [{ recording: "clip", channel: 3 }], 1),
    ).toBe(3);
  });

  it("warns on shared -o file with several WAVs, not on a directory path", () => {
    expect(
      hasSharedOutputMultiFileRisk({ outputPath: "/out/all.txt", fileCount: 2 }),
    ).toBe(true);
    expect(
      hasSharedOutputMultiFileRisk({ outputPath: "/out/labels", fileCount: 2 }),
    ).toBe(false);
    expect(
      hasSharedOutputMultiFileRisk({ outputPath: "/out/all.jsonl", fileCount: 2 }),
    ).toBe(true);
  });
});

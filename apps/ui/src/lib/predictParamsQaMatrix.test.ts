/**
 * Senior QA matrix: each Predict Parameters setting → job params → CLI flags.
 * Run: npm run test -- src/lib/predictParamsQaMatrix.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  collisionEntriesFromSelection,
  collisionEntriesFromTableSelection,
  hasSharedOutputChannelCollision,
} from "./predictQueueStudio";
import {
  buildPredictJobParams,
  DEFAULT_PREDICT_SETTINGS,
  type PredictSettings,
} from "../workspace/predictSettings";
import type { OrcaiModel } from "../api/models";
import { buildPredictCliLine } from "./predictCliLine";

const models: OrcaiModel[] = [
  { id: "orcai-isl-v1", name: "orcai-isl-v1", path: "", kind: "builtin" },
  {
    id: "trained-1",
    name: "trained-1",
    path: "/models/trained-1",
    kind: "trained",
  },
];

function cli(
  patch: Partial<PredictSettings>,
  recordingPath = "/demo/a.wav",
  model = "orcai-isl-v1",
  modelDir?: string,
): string {
  const settings: PredictSettings = { ...DEFAULT_PREDICT_SETTINGS, ...patch };
  const params = buildPredictJobParams(
    settings,
    recordingPath,
    "/demo",
    model,
    models,
    modelDir ?? settings.modelDir,
  );
  return buildPredictCliLine(params);
}

describe("QA matrix · Predict Parameters → CLI", () => {
  it("defaults include -c -m -o -th -ls -v; omit boolean flags", () => {
    const line = cli({});
    expect(line).toContain("orcai predict /demo/a.wav");
    expect(line).toContain("-c 1");
    expect(line).toContain("-m orcai-isl-v1");
    expect(line).toContain("-o default");
    expect(line).toContain("-th 0.5");
    expect(line).toContain("-ls '*'");
    expect(line).toContain("-v 2");
    expect(line).not.toContain("-ow");
    expect(line).not.toContain("-sp");
    expect(line).not.toContain("-cdl");
    expect(line).not.toContain("-bdr");
  });

  it("channel → -c", () => {
    expect(cli({ channel: 3 })).toContain("-c 3");
  });

  it("threshold → -th", () => {
    expect(cli({ threshold: 0.75 })).toContain("-th 0.75");
  });

  it("labelSuffix → -ls", () => {
    expect(cli({ labelSuffix: "_x" })).toContain("-ls _x");
  });

  it("blank labelSuffix is an empty -ls, not the Click default star", () => {
    const line = cli({ labelSuffix: "  " });
    expect(line).toContain("-ls ''");
    expect(line).not.toContain("-ls *");
  });

  it("outputPath → -o", () => {
    expect(cli({ outputPath: "/tmp/out.txt" })).toContain("-o /tmp/out.txt");
  });

  it("empty outputPath falls back to default (no none/null save mode)", () => {
    const line = cli({ outputPath: "" });
    expect(line).toContain("-o default");
    expect(line).not.toMatch(/-o none|-o null/);
  });

  it("overwrite → -ow", () => {
    expect(cli({ overwrite: true })).toContain("-ow");
  });

  it("saveProbabilities → -sp", () => {
    expect(cli({ saveProbabilities: true })).toContain("-sp");
  });

  it("callDurationLimits → -cdl", () => {
    expect(
      cli({
        callDurationFilter: true,
        callDurationLimits: "/demo/limits.json",
      }),
    ).toContain("-cdl /demo/limits.json");
  });

  it("duration JSON path without opt-in does not emit -cdl", () => {
    expect(cli({ callDurationLimits: "/demo/limits.json" })).not.toContain(
      "-cdl",
    );
  });

  it("verbosity still applied from settings (no UI, but in CLI)", () => {
    expect(cli({ verbosity: 0 })).toContain("-v 0");
    expect(cli({ verbosity: 3 })).toContain("-v 3");
  });

  it("baseDirRecording → -bdr for WAV, omitted for CSV table", () => {
    expect(cli({ baseDirRecording: "/demo/recordings" })).toContain(
      "-bdr /demo/recordings",
    );
    expect(
      cli(
        { baseDirRecording: "/demo/recordings" },
        "/demo/recording_table.csv",
      ),
    ).not.toContain("-bdr");
  });

  it("trained model emits -md (and -m name; sidecar does the same)", () => {
    const line = cli({}, "/demo/a.wav", "trained-1", "/models/trained-1");
    expect(line).toContain("-md /models/trained-1");
    expect(line).toContain("-m trained-1");
  });

  it("flag order matches sidecar predict options (token-aware)", () => {
    const line = cli({
      channel: 2,
      threshold: 0.4,
      outputPath: "/o",
      overwrite: true,
      saveProbabilities: true,
      baseDirRecording: "/rec",
      callDurationFilter: true,
      callDurationLimits: "/cdl.json",
      labelSuffix: "*",
      verbosity: 1,
    });
    // Avoid false positives: "-v" ⊂ "orcai-isl-v1"
    const tokens = line.split(/\s+/);
    const order = ["-c", "-m", "-o", "-th", "-ow", "-sp", "-bdr", "-cdl", "-ls", "-v"];
    let last = -1;
    for (const flag of order) {
      const i = tokens.indexOf(flag);
      expect(i, flag).toBeGreaterThan(last);
      last = i;
    }
  });
});

describe("QA · channel collision wiring", () => {
  it("BUG fixed: table selection surfaces multi-channel collision for shared -o", () => {
    const entries = collisionEntriesFromTableSelection(
      ["clip.wav"],
      [
        { recording: "clip", channel: 1 },
        { recording: "clip", channel: 2 },
      ],
      1,
    );
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out/all.txt",
        entries,
      }),
    ).toBe(true);
  });

  it("empty channel map still cannot detect multi-channel (legacy PredictPage bug)", () => {
    const entries = collisionEntriesFromSelection(
      ["clip.wav", "clip.wav"],
      {},
      1,
    );
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out/all.txt",
        entries,
      }),
    ).toBe(false);
  });

  it("shared .txt multi-file risk is separate (sharedOutputMultiFile)", () => {
    expect(
      hasSharedOutputChannelCollision({
        outputPath: "/out/all.txt",
        entries: collisionEntriesFromSelection(["a.wav", "b.wav"], {}, 1),
      }),
    ).toBe(false);
  });
});

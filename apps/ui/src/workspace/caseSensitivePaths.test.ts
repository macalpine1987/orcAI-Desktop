import { describe, expect, it } from "vitest";
import type { ProjectRecord, ProjectRecording } from "../api/projects";
import {
  batchSelectedNames,
  buildPredictQueue,
  isFileSelectedForPredict,
  namesMatchExact,
  sanitizePredictQueue,
  setQueueSelection,
  type PredictQueue,
} from "./predictQueue";

function project(path = "/tmp/proj"): ProjectRecord {
  return {
    id: "p1",
    path,
    display_name: "Test",
    description: "",
    orcai_name: "test",
    project_kind: "recognition",
    created_at: 0,
    updated_at: 0,
    recording_table_path: `${path}/recording_table.csv`,
    recordings_dir: `${path}/recordings`,
    wav_count: 1,
    initialized: true,
  };
}

function rec(name: string, root = "/tmp/proj"): ProjectRecording {
  return {
    name,
    path: `${root}/recordings/${name}`,
    rel_path: name,
    size_bytes: 100,
    modified_at: 0,
    sample_rate_hz: 48_000,
    bit_depth: 16,
    duration_sec: 1,
  };
}

describe("case-sensitive paths · ", () => {
  it("namesMatchExact is case-sensitive", () => {
    expect(namesMatchExact("Whale.wav", "Whale.wav")).toBe(true);
    expect(namesMatchExact("Whale.wav", "whale.wav")).toBe(false);
    expect(namesMatchExact("Whale.wav", "WHALE.WAV")).toBe(false);
    expect(namesMatchExact("", "")).toBe(true);
  });

  it("buildPredictQueue Set/has matching is case-sensitive", () => {
    const whale = rec("Whale.wav");
    expect(buildPredictQueue(project(), [whale], ["whale.wav"])).toBeNull();
    const q = buildPredictQueue(project(), [whale], ["Whale.wav"]);
    expect(q?.files).toHaveLength(1);
    expect(q?.files[0]?.name).toBe("Whale.wav");
  });

  it("does not collapse differently cased names in a Set", () => {
    const names = new Set(["Whale.wav", "whale.wav"]);
    expect(names.size).toBe(2);
    expect(names.has("Whale.wav")).toBe(true);
    expect(names.has("whale.wav")).toBe(true);
    expect(names.has("WHALE.WAV")).toBe(false);
  });

  it("keeps Whale.wav and whale.wav as distinct queue rows (Linux)", () => {
    const rows = [rec("Whale.wav"), rec("whale.wav")];
    const q = buildPredictQueue(project(), rows, ["Whale.wav", "whale.wav"]);
    expect(q?.files.map((f) => f.name)).toEqual(["Whale.wav", "whale.wav"]);
    expect(q?.files).toHaveLength(2);
  });

  it("batchSelectedNames does not fuzzy-match case", () => {
    const q = buildPredictQueue(
      project(),
      [rec("Whale.wav"), rec("Orca.wav")],
      ["Whale.wav"],
    )!;
    expect(q.files.map((f) => f.name)).toEqual(["Whale.wav", "Orca.wav"]);
    expect(batchSelectedNames(q)).toEqual(["Whale.wav"]);
    expect(isFileSelectedForPredict(q, "Whale.wav")).toBe(true);
    expect(isFileSelectedForPredict(q, "whale.wav")).toBe(false);
    expect(isFileSelectedForPredict(q, "Orca.wav")).toBe(false);
  });

  it("setQueueSelection + sanitize drop wrong-case names", () => {
    const base = buildPredictQueue(
      project(),
      [rec("Whale.wav")],
      ["Whale.wav"],
    )!;
    const wrongCase: PredictQueue = setQueueSelection(base, ["whale.wav"]);
    expect(wrongCase.selectedNames).toEqual(["whale.wav"]);
    const cleaned = sanitizePredictQueue(wrongCase);
    // Explicit selection of a non-matching name is dropped; empty + explicit stays empty.
    expect(cleaned.selectedNames).toEqual([]);
    expect(cleaned.batchSelectionExplicit).toBe(true);
    expect(batchSelectedNames(cleaned)).toEqual([]);
  });

  it("Windows-style project paths still match names by exact case", () => {
    const root = "C:\\Users\\lab\\proj";
    const whale = rec("Whale.wav", root.replace(/\\/g, "/"));
    // Simulate Windows recording path with backslashes in path field.
    const winRec: ProjectRecording = {
      ...whale,
      path: `${root}\\recordings\\Whale.wav`,
    };
    const q = buildPredictQueue(project(root), [winRec], ["Whale.wav"]);
    expect(q?.files[0]?.name).toBe("Whale.wav");
    expect(buildPredictQueue(project(root), [winRec], ["whale.wav"])).toBeNull();
  });
});

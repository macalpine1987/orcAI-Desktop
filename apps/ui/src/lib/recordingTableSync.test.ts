import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../api/projects";
import {
  addedCallNames,
  callsMissingFromClassColumns,
  parameterCallNames,
  recordingTableSyncModeAfterAdd,
  recordingTableSyncModeAfterDelete,
  recordingTableSyncOptions,
  shouldSyncRecordingTableAfterDelete,
} from "./recordingTableSync";

const base: ProjectRecord = {
  id: "p1",
  path: "/tmp/p",
  display_name: "P",
  description: "",
  orcai_name: "p",
  project_kind: "recognition",
  created_at: 0,
  updated_at: 0,
  recording_table_path: null,
  recordings_dir: "/tmp/p/recordings",
  wav_count: 0,
  initialized: false,
};

describe("recordingTableSync", () => {
  it("maps modes to API flags", () => {
    expect(recordingTableSyncOptions("create")).toEqual({
      overwrite: false,
      update_table: false,
    });
    expect(recordingTableSyncOptions("merge")).toEqual({
      overwrite: false,
      update_table: true,
    });
    expect(recordingTableSyncOptions("rebuild")).toEqual({
      overwrite: true,
      update_table: false,
    });
  });

  it("picks merge after add when table exists", () => {
    expect(
      recordingTableSyncModeAfterAdd({
        ...base,
        recording_table_path: "/tmp/p/recording_table.csv",
      }),
    ).toBe("merge");
    expect(recordingTableSyncModeAfterAdd(base)).toBe("create");
  });

  it("picks merge after partial delete when table exists", () => {
    expect(
      recordingTableSyncModeAfterDelete({
        ...base,
        recording_table_path: "/tmp/p/recording_table.csv",
        wav_count: 2,
      }),
    ).toBe("merge");
  });

  it("uses rebuild when table remains after all wavs removed", () => {
    expect(
      recordingTableSyncModeAfterDelete({
        ...base,
        recording_table_path: "/tmp/p/recording_table.csv",
        wav_count: 0,
      }),
    ).toBe("rebuild");
  });

  it("skips sync job when no wavs and no table path", () => {
    expect(shouldSyncRecordingTableAfterDelete(base)).toBe(false);
    expect(
      shouldSyncRecordingTableAfterDelete({
        ...base,
        recording_table_path: "/tmp/p/recording_table.csv",
        wav_count: 0,
      }),
    ).toBe(true);
    expect(
      shouldSyncRecordingTableAfterDelete({ ...base, wav_count: 1 }),
    ).toBe(true);
  });

  it("creates table after delete when no table existed", () => {
    expect(recordingTableSyncModeAfterDelete(base)).toBe("create");
  });

  it("detects call names added in a parameter save", () => {
    const before = parameterCallNames('{"calls":["BR","WHISTLE"]}');
    const after = parameterCallNames('{"calls":["WHISTLE","KAV"," BR "]}');
    expect(before).toEqual(["BR", "WHISTLE"]);
    expect(after).toEqual(["WHISTLE", "KAV", "BR"]);
    expect(addedCallNames(before ?? [], after ?? [])).toEqual(["KAV"]);
    expect(parameterCallNames('{"seed":1}')).toBeNull();
    expect(
      callsMissingFromClassColumns(["BR", "KAV"], ["BR", "WHISTLE"]),
    ).toBe(true);
    expect(callsMissingFromClassColumns(["BR"], ["BR", "WHISTLE"])).toBe(false);
  });
});

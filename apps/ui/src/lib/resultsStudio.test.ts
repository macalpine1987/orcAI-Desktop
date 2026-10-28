import { describe, expect, it } from "vitest";
import type { ResultsSummaryRow } from "../api/results";
import {
  filterResultsRows,
  formatKpiDuration,
  formatResultsModels,
  formatResultsThresholds,
  groupRowsByRecording,
  rowsToAudacityText,
  rowsToCsv,
  classChartColumns,
  seedResultsMinProb,
  sortResultsRows,
  shouldKeepNavLabelOverride,
  suggestedAudacityName,
  summarizeResultsRows,
  DEFAULT_RESULTS_SORT,
} from "./resultsStudio";

function row(
  partial: Partial<ResultsSummaryRow> & Pick<ResultsSummaryRow, "id" | "label">,
): ResultsSummaryRow {
  return {
    recording: "a.wav",
    wav_path: "/p/a.wav",
    label_path: "/p/a_c1_orcai-isl-v1_predicted.txt",
    start_sec: 1,
    stop_sec: 2,
    duration_sec: 1,
    mean_p: 0.8,
    model: "orcai-isl-v1",
    channel: 1,
    ...partial,
  };
}

describe("resultsStudio", () => {
  it("filters by recording, class, probability and duration", () => {
    const rows = [
      row({ id: "1", label: "WHISTLE", recording: "a.wav", mean_p: 0.9, duration_sec: 0.4 }),
      row({ id: "2", label: "BUZZ", recording: "b.wav", mean_p: 0.2, duration_sec: 2 }),
    ];
    const visible = filterResultsRows(rows, {
      recording: "a.wav",
      classLabel: "WHISTLE",
      minProb: 0.5,
      fileQuery: "",
      minDuration: 0.2,
      maxDuration: 1,
    });
    expect(visible.map((r) => r.id)).toEqual(["1"]);
  });

  it("csv export contains only given rows and type column", () => {
    const csv = rowsToCsv(
      [row({ id: "1", label: "WHISTLE", recording: "a.wav" })],
      () => "whistles",
    );
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("class,type");
    expect(lines[1]).toContain("whistles");
    expect(csv).not.toContain("b.wav");
  });

  it("audacity export is tab-separated start/stop/label per recording", () => {
    const grouped = groupRowsByRecording([
      row({ id: "1", label: "WHISTLE", recording: "a.wav", start_sec: 1.5, stop_sec: 2 }),
      row({ id: "2", label: "BUZZ", recording: "b.wav" }),
    ]);
    expect(grouped.size).toBe(2);
    const firstGroup = [...grouped.values()][0] ?? [];
    const text = rowsToAudacityText(firstGroup);
    const cols = text.trim().split("\t");
    expect(cols[2]).toBe("WHISTLE");
    expect(suggestedAudacityName("a.wav")).toBe("a_audacity.txt");
  });

  it("hides predicted rows that have no mean_p when minProb is set", () => {
    const rows = [
      row({ id: "1", label: "WHISTLE", mean_p: null, kind: "predicted" }),
      row({ id: "2", label: "BUZZ", mean_p: 0.9, kind: "predicted" }),
    ];
    const visible = filterResultsRows(rows, {
      recording: "",
      classLabel: "",
      minProb: 0.5,
      fileQuery: "",
      minDuration: null,
      maxDuration: null,
    });
    expect(visible.map((r) => r.id)).toEqual(["2"]);
  });

  it("does not hide annotation rows that have no mean_p when minProb is set", () => {
    const rows = [
      row({
        id: "1",
        label: "WHISTLE",
        mean_p: null,
        kind: "annotation",
      }),
      row({ id: "2", label: "BUZZ", mean_p: 0.2, kind: "predicted" }),
    ];
    const visible = filterResultsRows(rows, {
      recording: "",
      classLabel: "",
      minProb: 0.5,
      fileQuery: "",
      minDuration: null,
      maxDuration: null,
    });
    expect(visible.map((r) => r.id)).toEqual(["1"]);
  });

  it("keeps Results→Analysis label override until the nav WAV is active", () => {
    expect(
      shouldKeepNavLabelOverride({
        navLabel: "/p/a_predicted.txt",
        navWav: "/p/a.wav",
        activeWav: "/p/other.wav",
        matchedNavWav: false,
      }),
    ).toEqual({ keep: true, matched: false });
    expect(
      shouldKeepNavLabelOverride({
        navLabel: "/p/a_predicted.txt",
        navWav: "/p/a.wav",
        activeWav: "/p/a.wav",
        matchedNavWav: false,
      }),
    ).toEqual({ keep: true, matched: true });
    expect(
      shouldKeepNavLabelOverride({
        navLabel: "/p/a_predicted.txt",
        navWav: "/p/a.wav",
        activeWav: "/p/other.wav",
        matchedNavWav: true,
      }),
    ).toEqual({ keep: false, matched: true });
    expect(
      shouldKeepNavLabelOverride({
        navLabel: undefined,
        navWav: "/p/a.wav",
        activeWav: "/p/other.wav",
        matchedNavWav: false,
      }),
    ).toEqual({ keep: false, matched: false });
  });

  it("filters by filename query", () => {
    const rows = [
      row({ id: "1", label: "WHISTLE", recording: "01 Just Passing Through.wav" }),
      row({ id: "2", label: "BUZZ", recording: "07 Fjord Echo.wav" }),
    ];
    const visible = filterResultsRows(rows, {
      ...{
        recording: "",
        classLabel: "",
        minProb: null,
        minDuration: null,
        maxDuration: null,
      },
      fileQuery: "fjord",
    });
    expect(visible.map((r) => r.id)).toEqual(["2"]);
  });

  it("summarizes KPI and class buckets from the given rows", () => {
    const rows = [
      row({
        id: "1",
        label: "WHISTLE",
        recording: "a.wav",
        duration_sec: 2,
        mean_p: 0.9,
      }),
      row({
        id: "2",
        label: "WHISTLE",
        recording: "a.wav",
        duration_sec: 1,
        mean_p: 0.7,
      }),
      row({
        id: "3",
        label: "BUZZ",
        recording: "b.wav",
        duration_sec: 4,
        mean_p: 0.2,
      }),
    ];
    const view = summarizeResultsRows(rows);
    expect(view.detection_count).toBe(3);
    expect(view.recording_count).toBe(2);
    expect(view.duration_sec).toBe(7);
    expect(view.mean_p).toBeCloseTo(0.6);
    expect(view.classes).toEqual([
      { label: "WHISTLE", count: 2, duration_sec: 3 },
      { label: "BUZZ", count: 1, duration_sec: 4 },
    ]);

    const byFile = summarizeResultsRows(
      filterResultsRows(rows, {
        recording: "a.wav",
        classLabel: "",
        minProb: null,
        fileQuery: "",
        minDuration: null,
        maxDuration: null,
      }),
    );
    expect(byFile.detection_count).toBe(2);
    expect(byFile.recording_count).toBe(1);
    expect(byFile.classes.map((item) => item.label)).toEqual(["WHISTLE"]);

    const byClass = summarizeResultsRows(
      filterResultsRows(rows, {
        recording: "",
        classLabel: "BUZZ",
        minProb: null,
        fileQuery: "",
        minDuration: null,
        maxDuration: null,
      }),
    );
    expect(byClass.detection_count).toBe(1);
    expect(byClass.mean_p).toBeCloseTo(0.2);
    expect(byClass.classes).toEqual([{ label: "BUZZ", count: 1, duration_sec: 4 }]);
  });

  it("formats KPI duration as mm:ss", () => {
    expect(formatKpiDuration(18 * 60 + 24)).toBe("18:24");
    expect(formatKpiDuration(3661)).toBe("1:01:01");
  });

  it("sorts by class code", () => {
    const sorted = sortResultsRows(
      [
        row({ id: "1", label: "WHISTLE" }),
        row({ id: "2", label: "BUZZ" }),
      ],
      { key: "label", dir: "asc" },
      () => "x",
    );
    expect(sorted.map((r) => r.label)).toEqual(["BUZZ", "WHISTLE"]);
  });

  it("auto-sorts by recording name, then start time within a file", () => {
    const sorted = sortResultsRows(
      [
        row({
          id: "late-01",
          label: "BUZZ",
          recording: "01 Just Passing Through.wav",
          start_sec: 80,
        }),
        row({
          id: "fjord",
          label: "WHISTLE",
          recording: "07 Fjord Echo.wav",
          start_sec: 3,
        }),
        row({
          id: "early-01",
          label: "WHISTLE",
          recording: "01 Just Passing Through.wav",
          start_sec: 14,
        }),
        row({
          id: "ten",
          label: "BR",
          recording: "10 Last Words.wav",
          start_sec: 1,
        }),
      ],
      DEFAULT_RESULTS_SORT,
      () => "x",
    );
    expect(sorted.map((r) => r.id)).toEqual(["early-01", "late-01", "fjord", "ten"]);
  });

  it("formats missing model/threshold as dash", () => {
    expect(formatResultsModels([])).toBe("—");
    expect(formatResultsThresholds([])).toBe("—");
    expect(formatResultsModels(["orcai-isl-v1"])).toBe("orcai-isl-v1");
  });

  it("seeds minProb only for the predicted source", () => {
    expect(seedResultsMinProb("predicted", [0.5, 0.8])).toBe(0.5);
    expect(seedResultsMinProb("filtered", [0.5])).toBeNull();
    expect(seedResultsMinProb("annotations", [0.5])).toBeNull();
    expect(seedResultsMinProb("predicted", [])).toBeNull();
  });

  it("keeps a selected class column at count 0 when minProb hid its rows", () => {
    const cols = classChartColumns([{ label: "WHISTLE", count: 4, duration_sec: 2 }], "BUZZ");
    expect(cols.find((item) => item.label === "BUZZ")).toEqual({
      label: "BUZZ",
      count: 0,
      duration_sec: 0,
    });
    expect(cols.find((item) => item.label === "WHISTLE")?.count).toBe(4);
  });
});

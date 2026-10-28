import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PredictQueueFile } from "../workspace/predictQueue";

const { exportAudacityLabelsMock, pickDirectoryMock, isTauriMock } = vi.hoisted(
  () => ({
    exportAudacityLabelsMock: vi.fn(),
    pickDirectoryMock: vi.fn(),
    isTauriMock: vi.fn(),
  }),
);

vi.mock("../api/labels", () => ({
  exportAudacityLabels: exportAudacityLabelsMock,
}));

vi.mock("../platform/dialog", () => ({
  basename: (p: string) => p.split(/[/\\]/).pop() ?? p,
  isAbsolutePath: (p: string) => p.startsWith("/"),
  pickDirectory: pickDirectoryMock,
}));

vi.mock("../platform/tauri", () => ({
  isTauri: isTauriMock,
}));

import { exportPackageFilesToAudacity } from "./exportAnalysisAudacity";

const wavFile: PredictQueueFile = {
  name: "a.wav",
  path: "/data/a.wav",
  kind: "wav",
  bit_depth: 16,
  sample_rate_hz: 48_000,
  duration_sec: 120,
  status: "done",
  labelPath: "/data/a_predicted.txt",
};

describe("exportPackageFilesToAudacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(false);
    exportAudacityLabelsMock.mockResolvedValue({
      output_path: "/tmp/a_audacity.txt",
      line_count: 1,
    });
  });

  it("skips files without label path", async () => {
    const pending: PredictQueueFile = {
      ...wavFile,
      name: "b.wav",
      status: "pending",
      labelPath: undefined,
    };
    const res = await exportPackageFilesToAudacity({
      files: [wavFile, pending],
      selectedNames: new Set(["a.wav", "b.wav"]),
      channel: 1,
      modelId: "m1",
    });
    expect(res.exported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(exportAudacityLabelsMock).toHaveBeenCalledTimes(1);
  });

  it("writes to folder on Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue("/out");
    exportAudacityLabelsMock.mockResolvedValue({ output_path: "/out/a_audacity.txt" });

    const res = await exportPackageFilesToAudacity({
      files: [wavFile],
      selectedNames: new Set(["a.wav"]),
      channel: 1,
      modelId: "m1",
    });

    expect(res.exported).toBe(1);
    expect(exportAudacityLabelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: "/out/a_predicted_audacity.txt",
      }),
    );
  });

  it("returns cancelled when directory pick dismissed", async () => {
    isTauriMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(null);

    const res = await exportPackageFilesToAudacity({
      files: [wavFile],
      selectedNames: new Set(["a.wav"]),
      channel: 1,
      modelId: "m1",
    });

    expect(res.cancelled).toBe(true);
    expect(exportAudacityLabelsMock).not.toHaveBeenCalled();
  });

  it("counts explicit empty exports separately", async () => {
    isTauriMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue("/out");
    exportAudacityLabelsMock.mockResolvedValue({
      output_path: "/out/a_audacity.txt",
      line_count: 0,
    });

    const res = await exportPackageFilesToAudacity({
      files: [wavFile],
      selectedNames: new Set(["a.wav"]),
      channel: 1,
      modelId: "m1",
    });

    expect(res.exported).toBe(0);
    expect(res.empty).toBe(1);
  });
});

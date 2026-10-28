import { describe, expect, it } from "vitest";
import {
  canOpenSpectrogramForFile,
  canOpenSpectrogramView,
  defaultAnalysisLabelKind,
  hasRecognizedWithoutLabelsInFiles,
  isRecognitionComplete,
  originalLabelPathForQueueFile,
  packageQueueFiles,
  pendingBatchPredictFiles,
  pickPackageFileForSpectrogram,
  pickSpectrogramNavTarget,
  predictResultsTabEnabled,
  resolveAnalysisLabelPath,
  resolveQueueUnavailable,
  shouldShowQueueLoading,
  spectrogramTabEnabled,
} from "./predictQueueUi";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";

const CH = 1;
const MODEL = "orcai-isl-v1";

function wav(
  name: string,
  status: PredictQueueFile["status"],
  extra?: Partial<PredictQueueFile>,
): PredictQueueFile {
  return {
    name,
    path: `/p/${name}`,
    kind: "wav",
    bit_depth: 16,
    sample_rate_hz: 48_000,
    duration_sec: 10,
    status,
    ...extra,
  };
}

describe("resolveQueueUnavailable", () => {
  it("prioritizes missing active project", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: false,
        queueLoading: false,
        projectLoadFailed: true,
        projectInitialized: false,
      }),
    ).toBe("no_project");
  });

  it("detects deleted project after load", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: true,
        queueLoading: false,
        projectLoadFailed: true,
      }),
    ).toBe("project_missing");
  });

  it("blocks uninitialized project", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: true,
        queueLoading: false,
        projectLoadFailed: false,
        projectInitialized: false,
      }),
    ).toBe("not_initialized");
  });

  it("allows ready project", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: true,
        queueLoading: false,
        projectLoadFailed: false,
        projectInitialized: true,
      }),
    ).toBeNull();
  });

  it("does not report missing project while still loading", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: true,
        queueLoading: true,
        projectLoadFailed: true,
      }),
    ).toBeNull();
  });

  it("does not block uninitialized project while loading", () => {
    expect(
      resolveQueueUnavailable({
        hasActiveProject: true,
        queueLoading: true,
        projectLoadFailed: false,
        projectInitialized: false,
      }),
    ).toBeNull();
  });
});

describe("shouldShowQueueLoading", () => {
  it("shows loading only for active project without blockers", () => {
    expect(
      shouldShowQueueLoading({
        hasActiveProject: true,
        queueLoading: true,
        queueUnavailable: null,
      }),
    ).toBe(true);
    expect(
      shouldShowQueueLoading({
        hasActiveProject: false,
        queueLoading: true,
        queueUnavailable: null,
      }),
    ).toBe(false);
    expect(
      shouldShowQueueLoading({
        hasActiveProject: true,
        queueLoading: true,
        queueUnavailable: "not_initialized",
      }),
    ).toBe(false);
  });
});

describe("isRecognitionComplete", () => {
  it("accepts done and filtered wav", () => {
    expect(isRecognitionComplete(wav("a.wav", "done"))).toBe(true);
    expect(isRecognitionComplete(wav("b.wav", "filtered"))).toBe(true);
  });

  it("rejects pending and csv", () => {
    expect(isRecognitionComplete(wav("c.wav", "pending"))).toBe(false);
    expect(
      isRecognitionComplete({
        name: "t.csv",
        path: "/t.csv",
        kind: "csv_table",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "done",
      }),
    ).toBe(false);
  });
});

describe("predictResultsTabEnabled", () => {
  const queue: PredictQueue = {
    projectId: "p1",
    projectDir: "/proj",
    activeFileName: "a.wav",
    selectedNames: [],
    files: [wav("a.wav", "pending"), wav("b.wav", "done")],
  };

  it("requires at least one recognized or running wav", () => {
    expect(predictResultsTabEnabled(queue, true)).toBe(true);
    expect(
      predictResultsTabEnabled(
        { ...queue, files: [wav("a.wav", "pending")] },
        true,
      ),
    ).toBe(false);
    expect(
      predictResultsTabEnabled(
        { ...queue, files: [wav("a.wav", "running")] },
        true,
      ),
    ).toBe(true);
    expect(predictResultsTabEnabled(null, true)).toBe(false);
    expect(predictResultsTabEnabled(queue, false)).toBe(false);
  });
});

describe("pickSpectrogramNavTarget", () => {
  const queue: PredictQueue = {
    projectId: "p1",
    projectDir: "/proj",
    projectName: "Proj",
    activeFileName: "b.wav",
    selectedNames: [],
    files: [
      wav("a.wav", "pending"),
      wav("b.wav", "done", { labelPath: "/labels/b.txt" }),
    ],
  };

  it("prefers active file when recognized", () => {
    expect(pickSpectrogramNavTarget(queue, CH, MODEL)).toEqual({
      wavPath: "/p/b.wav",
      labelPath: "/labels/b.txt",
    });
  });

  it("falls back to first recognized file", () => {
    const q = { ...queue, activeFileName: "a.wav" };
    expect(pickSpectrogramNavTarget(q, CH, MODEL)?.wavPath).toBe("/p/b.wav");
  });

  it("returns null when nothing recognized", () => {
    expect(
      pickSpectrogramNavTarget(
        {
          ...queue,
          files: [wav("a.wav", "pending")],
        },
        CH,
        MODEL,
      ),
    ).toBeNull();
  });

  it("infers label path for done wav without stored path", () => {
    expect(
      pickSpectrogramNavTarget(
        {
          ...queue,
          files: [wav("b.wav", "done")],
        },
        CH,
        MODEL,
      ),
    ).toEqual({
      wavPath: "/p/b.wav",
      labelPath: "/p/b_c1_orcai-isl-v1_predicted.txt",
    });
  });

  it("uses filtered path when present", () => {
    expect(
      pickSpectrogramNavTarget(
        {
        ...queue,
        files: [
          wav("b.wav", "filtered", {
            filteredPath: "/labels/b_filt.txt",
          }),
        ],
        },
        CH,
        MODEL,
      ),
    ).toEqual({
      wavPath: "/p/b.wav",
      labelPath: "/labels/b_filt.txt",
    });
  });
});

describe("canOpenSpectrogramView", () => {
  it("mirrors pickSpectrogramNavTarget", () => {
    const queue: PredictQueue = {
      projectId: "p1",
      projectDir: "/proj",
      projectName: "Proj",
      activeFileName: "b.wav",
      selectedNames: [],
      files: [wav("b.wav", "done", { labelPath: "/l/b.txt" })],
    };
    expect(canOpenSpectrogramView(queue, CH, MODEL)).toBe(true);
    expect(canOpenSpectrogramView(null, CH, MODEL)).toBe(false);
  });
});

describe("spectrogramTabEnabled", () => {
  it("is true when queue has wav files and is ready", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/p",
      files: [
        {
          name: "a.wav",
          path: "/p/a.wav",
          kind: "wav" as const,
          bit_depth: null,
          sample_rate_hz: null,
          duration_sec: null,
          status: "pending" as const,
        },
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav"],
    };
    expect(spectrogramTabEnabled(queue, true)).toBe(true);
    expect(spectrogramTabEnabled(null, true)).toBe(false);
    expect(spectrogramTabEnabled(queue, false)).toBe(false);
  });
});

describe("pendingBatchPredictFiles", () => {
  it("includes selected wav rows except running; done only when explicitly selected", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/p",
      files: [
        wav("a.wav", "pending"),
        wav("b.wav", "failed"),
        wav("c.wav", "done"),
        wav("d.wav", "running"),
        {
          name: "t.csv",
          path: "/t.csv",
          kind: "csv_table" as const,
          bit_depth: null,
          sample_rate_hz: null,
          duration_sec: null,
          status: "pending" as const,
        },
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav", "c.wav", "d.wav"],
    };
    expect(
      pendingBatchPredictFiles({
        ...queue,
        batchSelectionExplicit: false,
      }).map((f) => f.name),
    ).toEqual(["a.wav", "b.wav"]);
    expect(
      pendingBatchPredictFiles({
        ...queue,
        batchSelectionExplicit: true,
      }).map((f) => f.name),
    ).toEqual(["a.wav", "b.wav", "c.wav"]);
  });
});

describe("package-scoped queue helpers", () => {
  const queue: PredictQueue = {
    projectId: "p1",
    projectDir: "/p",
    files: [
      wav("in.wav", "done", { labelPath: "/p/in.txt" }),
      wav("out.wav", "pending"),
      wav("pending.wav", "pending"),
    ],
    activeFileName: "pending.wav",
    selectedNames: [],
  };

  it("packageQueueFiles preserves package order", () => {
    expect(packageQueueFiles(queue, ["pending.wav", "in.wav"]).map((f) => f.name)).toEqual(
      ["pending.wav", "in.wav"],
    );
  });

  it("hasRecognizedWithoutLabelsInFiles scopes to listed files", () => {
    expect(hasRecognizedWithoutLabelsInFiles(queue, ["in.wav"], CH, MODEL)).toBe(
      false,
    );
    expect(hasRecognizedWithoutLabelsInFiles(queue, ["pending.wav"], CH, MODEL)).toBe(
      false,
    );
    const missingLabels: PredictQueue = {
      ...queue,
      files: [wav("gone.wav", "done"), ...queue.files],
    };
    expect(
      hasRecognizedWithoutLabelsInFiles(missingLabels, ["gone.wav"], CH, MODEL),
    ).toBe(true);
  });

  it("pickPackageFileForSpectrogram prefers labeled peer over pending active", () => {
    expect(
      pickPackageFileForSpectrogram(queue, ["in.wav", "pending.wav"], CH, MODEL),
    ).toBe("in.wav");
  });

  it("canOpenSpectrogramForFile allows done and running without stored labels", () => {
    expect(canOpenSpectrogramForFile(queue.files[0]!, CH, MODEL)).toBe(true);
    expect(canOpenSpectrogramForFile(queue.files[2]!, CH, MODEL)).toBe(false);
    expect(canOpenSpectrogramForFile(wav("x.wav", "done"), CH, MODEL)).toBe(true);
    expect(canOpenSpectrogramForFile(wav("y.wav", "running"), CH, MODEL)).toBe(
      true,
    );
  });
});

describe("resolveAnalysisLabelPath", () => {
  it("prefers filtered when that kind is selected", () => {
    const file = wav("a.wav", "filtered", {
      labelPath: "/p/a_c1_orcai-isl-v1_predicted.txt",
      filteredPath: "/p/a_c1_orcai-isl-v1_predicted_filtered.txt",
    });
    expect(defaultAnalysisLabelKind(file)).toBe("filtered");
    expect(resolveAnalysisLabelPath(file, "filtered", CH, MODEL)).toBe(
      "/p/a_c1_orcai-isl-v1_predicted_filtered.txt",
    );
    expect(resolveAnalysisLabelPath(file, "original", CH, MODEL)).toBe(
      "/p/a_c1_orcai-isl-v1_predicted.txt",
    );
  });

  it("does not treat a filtered path stored on labelPath as original", () => {
    const file = wav("a.wav", "filtered", {
      labelPath: "/p/a_predicted_filtered.txt",
    });
    expect(originalLabelPathForQueueFile(file, CH, MODEL)).toBe(
      "/p/a_c1_orcai-isl-v1_predicted.txt",
    );
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  activateQueueByWavPath,
  adoptPendingPredictQueue,
  appendImportedToQueue,
  appendRecordingsToQueue,
  applyPredictHintsToQueue,
  buildPredictQueue,
  buildPredictQueueFromTable,
  defaultPredictBatchSelection,
  dropCompletedFromPredictSelection,
  ensurePredictSelectionForOverwrite,
  finalizePredictSelectionAfterRun,
  mergeFileIntoQueue,
  persistPredictQueue,
  preserveExplicitPredictSelection,
  queueFromNavigation,
  refreshQueueFromRecordings,
  resolveFilterPredictedPath,
  sanitizePredictQueue,
  selectAllPredictBatch,
  selectDefaultPredictBatch,
  syncQueueWithProjectRecordings,
} from "./predictQueue";
import { loadWorkspace, saveWorkspace } from "./storage";
import type { ProjectRecord, ProjectRecording } from "../api/projects";

describe("buildPredictQueue", () => {
  const project: ProjectRecord = {
    id: "p1",
    path: "/tmp/proj",
    display_name: "Test",
    description: "",
    orcai_name: "test",
    project_kind: "recognition",
    created_at: 0,
    updated_at: 0,
    recording_table_path: "/tmp/proj/recording_table.csv",
    recordings_dir: "/tmp/proj/recordings",
    wav_count: 2,
    initialized: true,
  };

  const recordings: ProjectRecording[] = [
    {
      name: "a.wav",
      path: "/tmp/proj/recordings/a.wav",
      rel_path: "a.wav",
      size_bytes: 100,
      modified_at: 0,
      sample_rate_hz: 48_000,
      bit_depth: 16,
      duration_sec: 12.5,
    },
    {
      name: "b.wav",
      path: "/tmp/proj/recordings/b.wav",
      rel_path: "b.wav",
      size_bytes: 200,
      modified_at: 0,
      sample_rate_hz: 96_000,
      bit_depth: 24,
      duration_sec: 60,
    },
  ];

  it("builds full project list with pre-checked Projects subset", () => {
    const q = buildPredictQueue(project, recordings, new Set(["b.wav"]));
    expect(q?.files.map((f) => f.name)).toEqual(["a.wav", "b.wav"]);
    expect(q?.files[1]?.name).toBe("b.wav");
    expect(q?.files[1]?.kind).toBe("wav");
    expect(q?.activeFileName).toBe("b.wav");
    expect(q?.files[1]?.bit_depth).toBe(24);
    expect(q?.files[1]?.size_bytes).toBe(200);
    expect(q?.selectedNames).toEqual(["b.wav"]);
    expect(q?.batchSelectionExplicit).toBe(true);
  });

  it("keeps recognized + new when Projects selection is applied with hints", () => {
    const q = buildPredictQueue(project, recordings, new Set(["a", "b"]));
    expect(q).toBeTruthy();
    const next = applyPredictHintsToQueue(q!, [
      {
        recording: "a",
        predict_status: "done",
        predicted_path: "/tmp/proj/recordings/a_predicted.txt",
      },
      {
        recording: "b",
        predict_status: "none",
        predicted_path: null,
      },
    ]);
    expect(next.files.find((f) => f.name === "a.wav")?.status).toBe("done");
    expect(next.files.find((f) => f.name === "b.wav")?.status).toBe("pending");
    expect(next.selectedNames.sort()).toEqual(["a.wav", "b.wav"]);
    expect(next.batchSelectionExplicit).toBe(true);
  });

  it("matches Projects table stems without .wav suffix", () => {
    const q = buildPredictQueue(project, recordings, new Set(["a"]));
    expect(q?.files).toHaveLength(2);
    expect(q?.selectedNames).toEqual(["a.wav"]);
    expect(q?.activeFileName).toBe("a.wav");
  });

  it("returns null when nothing selected", () => {
    expect(buildPredictQueue(project, recordings, new Set())).toBeNull();
  });
});

describe("sanitizePredictQueue", () => {
  it("removes csv_table rows from persisted queue", () => {
    const q = sanitizePredictQueue({
      projectId: "p1",
      projectDir: "/tmp",
      files: [
        {
          name: "a.wav",
          path: "/tmp/a.wav",
          kind: "wav",
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "pending",
        },
        {
          name: "recording_table.csv",
          path: "/tmp/recording_table.csv",
          kind: "csv_table",
          bit_depth: null,
          sample_rate_hz: null,
          duration_sec: null,
          status: "pending",
        },
      ],
      activeFileName: "recording_table.csv",
      selectedNames: ["recording_table.csv", "a.wav"],
    });
    expect(q.files.map((f) => f.name)).toEqual(["a.wav"]);
    expect(q.activeFileName).toBe("a.wav");
    expect(q.selectedNames).toEqual(["a.wav"]);
  });
});

describe("buildPredictQueueFromTable", () => {
  it("creates csv_table queue entry", () => {
    const project: ProjectRecord = {
      id: "p1",
      path: "/tmp/proj",
      display_name: "Test",
      description: "",
      orcai_name: "test",
      project_kind: "recognition",
      created_at: 0,
      updated_at: 0,
      recording_table_path: "/tmp/proj/recording_table.csv",
      recordings_dir: "/tmp/proj/recordings",
      wav_count: 0,
      initialized: true,
    };
    const q = buildPredictQueueFromTable(project, project.recording_table_path!);
    expect(q.files[0]?.kind).toBe("csv_table");
    expect(q.activeFileName).toBe("recording_table.csv");
  });
});

describe("appendImportedToQueue", () => {
  const project: ProjectRecord = {
    id: "p1",
    path: "/tmp/proj",
    display_name: "Test",
    description: "",
    orcai_name: "test",
    project_kind: "recognition",
    created_at: 0,
    updated_at: 0,
    recording_table_path: null,
    recordings_dir: "/tmp/proj/recordings",
    wav_count: 1,
    initialized: true,
  };

  it("appends without loading full project when queue was empty", () => {
    const q = appendImportedToQueue(project, null, [
      {
        name: "new.wav",
        path: "/tmp/proj/recordings/new.wav",
        rel_path: "new.wav",
        size_bytes: 1,
        modified_at: 0,
        sample_rate_hz: 48_000,
        bit_depth: 16,
        duration_sec: 1,
      },
    ]);
    expect(q.files).toHaveLength(1);
    expect(q.files[0]?.name).toBe("new.wav");
    expect(q.activeFileName).toBe("new.wav");
  });
});

describe("mergeFileIntoQueue", () => {
  it("dedupes by path", () => {
    const q = mergeFileIntoQueue(
      {
        projectId: "p1",
        projectDir: "/tmp",
        files: [
          {
            name: "a.wav",
            path: "/tmp/a.wav",
            kind: "wav",
            bit_depth: 16,
            sample_rate_hz: 48_000,
            duration_sec: 10,
            status: "done",
            labelPath: "/tmp/a_predicted.txt",
          },
        ],
        activeFileName: "a.wav",
        selectedNames: ["a.wav"],
      },
      {
        name: "a.wav",
        path: "/tmp/a.wav",
        kind: "wav",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
        labelPath: "/tmp/new.txt",
      },
      { activeProjectId: "p1", projectDir: "/tmp", projectName: null },
    );
    expect(q.files).toHaveLength(1);
    expect(q.files[0]?.labelPath).toBe("/tmp/new.txt");
    expect(q.files[0]?.status).toBe("done");
  });

  it("keeps distinct paths when basename matches", () => {
    const q = mergeFileIntoQueue(
      {
        projectId: "p1",
        projectDir: "/tmp",
        files: [
          {
            name: "a.wav",
            path: "/tmp/old/a.wav",
            kind: "wav",
            bit_depth: 16,
            sample_rate_hz: 48_000,
            duration_sec: 10,
            status: "done",
          },
        ],
        activeFileName: "a.wav",
        selectedNames: ["a.wav"],
      },
      {
        name: "a.wav",
        path: "/tmp/new/a.wav",
        kind: "wav",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
      },
      { activeProjectId: "p1", projectDir: "/tmp", projectName: null },
    );
    expect(q.files).toHaveLength(2);
    expect(q.files.map((f) => f.path).sort()).toEqual([
      "/tmp/new/a.wav",
      "/tmp/old/a.wav",
    ]);
    expect(q.activeFileName).toBe("a.wav");
  });
});

describe("pending predict queue", () => {
  const project: ProjectRecord = {
    id: "p1",
    path: "/proj",
    display_name: "Demo",
    description: "",
    orcai_name: "demo",
    project_kind: "recognition",
    created_at: 0,
    updated_at: 0,
    recording_table_path: "/proj/recording_table.csv",
    recordings_dir: "/proj/recordings",
    wav_count: 0,
    initialized: false,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("stores queue without project in pendingPredictQueue", () => {
    const q = mergeFileIntoQueue(
      null,
      {
        name: "open.wav",
        path: "/tmp/open.wav",
        kind: "wav",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
      },
      { activeProjectId: null, projectDir: null, projectName: null },
    );
    persistPredictQueue(q);
    expect(loadWorkspace().pendingPredictQueue?.files).toHaveLength(1);
    expect(loadWorkspace().predictQueue).toBeNull();
  });

  it("adopts pending queue when project becomes active", () => {
    const pending = mergeFileIntoQueue(
      null,
      {
        name: "open.wav",
        path: "/tmp/open.wav",
        kind: "wav",
        bit_depth: null,
        sample_rate_hz: null,
        duration_sec: null,
        status: "pending",
      },
      { activeProjectId: null, projectDir: null, projectName: null },
    );
    saveWorkspace({ pendingPredictQueue: pending });
    const adopted = adoptPendingPredictQueue(project, null);
    expect(adopted?.projectId).toBe("p1");
    expect(adopted?.files[0]?.path).toBe("/tmp/open.wav");
    expect(loadWorkspace().pendingPredictQueue).toBeNull();
  });
});

describe("syncQueueWithProjectRecordings", () => {
  const project: ProjectRecord = {
    id: "p1",
    path: "/tmp/proj",
    display_name: "Test",
    description: "",
    orcai_name: "test",
    project_kind: "recognition",
    created_at: 0,
    updated_at: 0,
    recording_table_path: null,
    recordings_dir: "/tmp/proj/recordings",
    wav_count: 2,
    initialized: true,
  };

  const recordings: ProjectRecording[] = [
    {
      name: "a.wav",
      path: "/tmp/proj/recordings/a.wav",
      rel_path: "a.wav",
      size_bytes: 100,
      modified_at: 0,
      sample_rate_hz: 48_000,
      bit_depth: 16,
      duration_sec: 1,
    },
    {
      name: "b.wav",
      path: "/tmp/proj/recordings/b.wav",
      rel_path: "b.wav",
      size_bytes: 100,
      modified_at: 0,
      sample_rate_hz: 48_000,
      bit_depth: 16,
      duration_sec: 2,
    },
  ];

  it("expands to full project list while keeping pre-checked subset", () => {
    const prev = buildPredictQueue(project, recordings, new Set(["b.wav"]))!;
    expect(prev.files.map((f) => f.name)).toEqual(["a.wav", "b.wav"]);
    expect(prev.selectedNames).toEqual(["b.wav"]);
    const next = syncQueueWithProjectRecordings(project, recordings, prev);
    expect(next.files.map((f) => f.name)).toEqual(["a.wav", "b.wav"]);
    expect(next.selectedNames).toEqual(["b.wav"]);
    expect(next.batchSelectionExplicit).toBe(true);
  });

  it("preserves explicit empty selection on sync", () => {
    const prev = {
      ...buildPredictQueue(project, recordings, new Set(["a.wav", "b.wav"]))!,
      selectedNames: [],
      batchSelectionExplicit: true,
    };
    const next = syncQueueWithProjectRecordings(project, recordings, prev);
    expect(next.selectedNames).toEqual([]);
    expect(next.batchSelectionExplicit).toBe(true);
  });

  it("drops deleted project recordings instead of keeping them as external", () => {
    const prev = buildPredictQueue(project, recordings, new Set(["a.wav", "b.wav"]))!;
    const next = syncQueueWithProjectRecordings(project, [recordings[0]!], prev);
    expect(next.files.map((f) => f.name)).toEqual(["a.wav"]);
  });

  it("keeps truly external wav paths outside the project directory", () => {
    const prev = {
      ...buildPredictQueue(project, recordings, new Set(["a.wav"]))!,
      files: [
        ...buildPredictQueue(project, recordings, new Set(["a.wav"]))!.files,
        {
          name: "expert.wav",
          path: "/Volumes/field/expert.wav",
          kind: "wav" as const,
          bit_depth: 16,
          sample_rate_hz: 48_000,
          duration_sec: 1,
          status: "pending" as const,
        },
      ],
    };
    const next = syncQueueWithProjectRecordings(project, [recordings[0]!], prev);
    expect(next.files.map((f) => f.name)).toEqual(["a.wav", "expert.wav"]);
  });
});

describe("refreshQueueFromRecordings", () => {
  it("drops removed wav rows under the project directory", () => {
    const refreshed = refreshQueueFromRecordings(
      {
        projectId: "p1",
        projectDir: "/tmp",
        files: [
          {
            name: "gone.wav",
            path: "/tmp/gone.wav",
            kind: "wav",
            bit_depth: 16,
            sample_rate_hz: 48_000,
            duration_sec: 1,
            status: "pending",
          },
          {
            name: "recording_table.csv",
            path: "/tmp/recording_table.csv",
            kind: "csv_table",
            bit_depth: null,
            sample_rate_hz: null,
            duration_sec: null,
            status: "pending",
          },
        ],
        activeFileName: "gone.wav",
        selectedNames: ["gone.wav"],
      },
      [],
    );
    expect(refreshed.files).toEqual([]);
    expect(refreshed.activeFileName).toBeNull();
  });
});

describe("queueFromNavigation", () => {
  it("returns null for null state (sidebar navigation)", () => {
    expect(
      queueFromNavigation(null, {
        activeProjectId: "p1",
        projectDir: "/tmp",
        projectName: null,
      }),
    ).toBeNull();
  });
});

describe("activateQueueByWavPath", () => {
  const queue = {
    projectId: "p1",
    projectDir: "/p",
    projectName: "P",
    files: [
      {
        name: "a.wav",
        path: "/p/a.wav",
        kind: "wav" as const,
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 1,
        status: "done" as const,
        labelPath: "/p/a_c1_orcai-isl-v1_predicted.txt",
      },
    ],
    activeFileName: "a.wav",
    selectedFileNames: ["a.wav"],
    updatedAt: 0,
  };

  it("writes nav filtered labels onto filteredPath, not the original labelPath", () => {
    const next = activateQueueByWavPath(
      queue,
      "/p/a.wav",
      "/p/a_c1_orcai-isl-v1_predicted_filtered.txt",
    );
    expect(next.files[0]?.filteredPath).toBe(
      "/p/a_c1_orcai-isl-v1_predicted_filtered.txt",
    );
    expect(next.files[0]?.labelPath).toBe("/p/a_c1_orcai-isl-v1_predicted.txt");
  });
});

describe("resolveFilterPredictedPath", () => {
  it("infers path when done without labelPath", () => {
    const path = resolveFilterPredictedPath(
      {
        name: "a.wav",
        path: "/data/a.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 5,
        status: "done",
      },
      1,
      "orcai-isl-v1",
    );
    expect(path).toBe("/data/a_c1_orcai-isl-v1_predicted.txt");
  });

  it("does not feed *_predicted_filtered.txt back into filter-predictions", () => {
    const path = resolveFilterPredictedPath(
      {
        name: "a.wav",
        path: "/data/a.wav",
        kind: "wav",
        bit_depth: 16,
        sample_rate_hz: 48_000,
        duration_sec: 5,
        status: "filtered",
        labelPath: "/data/a_c1_orcai-isl-v1_predicted_filtered.txt",
      },
      1,
      "orcai-isl-v1",
    );
    expect(path).toBe("/data/a_c1_orcai-isl-v1_predicted.txt");
  });
});

describe("predict batch default selection", () => {
  const wav = (
    name: string,
    status: "pending" | "done" | "failed" | "filtered",
  ) => ({
    name,
    path: `/tmp/${name}`,
    kind: "wav" as const,
    bit_depth: 16,
    sample_rate_hz: 48_000,
    duration_sec: 1,
    status,
  });

  it("defaultPredictBatchSelection keeps pending and failed only", () => {
    expect(
      defaultPredictBatchSelection([
        wav("a.wav", "done"),
        wav("b.wav", "pending"),
        wav("c.wav", "failed"),
        wav("d.wav", "filtered"),
      ]),
    ).toEqual(["b.wav", "c.wav"]);
  });

  it("defaultPredictBatchSelection skips pending rows that already have labels", () => {
    expect(
      defaultPredictBatchSelection([
        {
          ...wav("a.wav", "pending"),
          labelPath: "/p/a_predicted.txt",
        },
        wav("b.wav", "pending"),
      ]),
    ).toEqual(["b.wav"]);
  });

  it("applyPredictHintsToQueue marks done and drops them from selection", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "pending"), wav("b.wav", "pending")],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: false,
    };
    const next = applyPredictHintsToQueue(queue, [
      {
        recording: "a",
        predict_status: "done",
        predicted_path: "/tmp/a_predicted.txt",
      },
    ]);
    expect(next.files[0]?.status).toBe("done");
    expect(next.files[0]?.labelPath).toBe("/tmp/a_predicted.txt");
    expect(next.selectedNames).toEqual(["b.wav"]);
  });

  it("applyPredictHintsToQueue keeps select-all including recognized", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "pending"), wav("b.wav", "pending")],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: true,
    };
    const next = applyPredictHintsToQueue(queue, [
      {
        recording: "a",
        predict_status: "done",
        predicted_path: "/tmp/a_predicted.txt",
      },
    ]);
    expect(next.selectedNames).toEqual(["a.wav", "b.wav"]);
  });

  it("selectAll includes done; selectDefault drops them", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "b.wav",
      selectedNames: ["b.wav"],
      batchSelectionExplicit: true,
    };
    expect(selectAllPredictBatch(queue).selectedNames).toEqual([
      "a.wav",
      "b.wav",
    ]);
    expect(selectDefaultPredictBatch(queue).selectedNames).toEqual(["b.wav"]);
  });

  it("dropCompletedFromPredictSelection removes done and filtered", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [
        wav("a.wav", "done"),
        wav("b.wav", "pending"),
        wav("c.wav", "failed"),
        wav("d.wav", "filtered"),
      ],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav", "c.wav", "d.wav"],
      batchSelectionExplicit: true,
    };
    expect(dropCompletedFromPredictSelection(queue).selectedNames).toEqual([
      "b.wav",
      "c.wav",
    ]);
  });

  it("finalizePredictSelectionAfterRun keeps done when overwrite is on", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: true,
    };
    expect(
      finalizePredictSelectionAfterRun(queue, true).selectedNames,
    ).toEqual(["a.wav", "b.wav"]);
    expect(
      finalizePredictSelectionAfterRun(queue, false).selectedNames,
    ).toEqual(["b.wav"]);
  });

  it("ensurePredictSelectionForOverwrite selects all when only completed remain", () => {
    const allDone = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "filtered")],
      activeFileName: "a.wav",
      selectedNames: [],
      batchSelectionExplicit: true,
    };
    expect(ensurePredictSelectionForOverwrite(allDone).selectedNames).toEqual([
      "a.wav",
      "b.wav",
    ]);

    const withPending = {
      ...allDone,
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      selectedNames: [],
    };
    expect(ensurePredictSelectionForOverwrite(withPending).selectedNames).toEqual(
      ["b.wav"],
    );
  });

  it("dropCompleted materializes implicit pending selection instead of emptying it", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "b.wav",
      selectedNames: [],
      batchSelectionExplicit: false,
    };
    const next = dropCompletedFromPredictSelection(queue);
    expect(next.selectedNames).toEqual(["b.wav"]);
    expect(next.batchSelectionExplicit).toBe(true);
  });

  it("overwrite off then on restores a runnable selection", () => {
    const implicit = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "b.wav",
      selectedNames: [],
      batchSelectionExplicit: false,
    };
    const afterOff = dropCompletedFromPredictSelection(implicit);
    expect(afterOff.selectedNames).toEqual(["b.wav"]);
    expect(
      ensurePredictSelectionForOverwrite(afterOff).selectedNames,
    ).toEqual(["b.wav"]);

    const allDoneEmpty = {
      ...implicit,
      files: [wav("a.wav", "done"), wav("b.wav", "filtered")],
      selectedNames: [],
      batchSelectionExplicit: true,
    };
    const afterOffAllDone = dropCompletedFromPredictSelection(allDoneEmpty);
    expect(afterOffAllDone.selectedNames).toEqual([]);
    expect(
      ensurePredictSelectionForOverwrite(afterOffAllDone).selectedNames,
    ).toEqual(["a.wav", "b.wav"]);
  });

  it("preserveExplicitPredictSelection keeps latest checkboxes after a stale fetch", () => {
    const fetched = {
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "a.wav",
      selectedNames: [],
      batchSelectionExplicit: true,
    };
    const latest = {
      ...fetched,
      selectedNames: ["a.wav", "b.wav"],
    };
    expect(
      preserveExplicitPredictSelection(fetched, latest).selectedNames,
    ).toEqual(["a.wav", "b.wav"]);
  });

  it("sanitize drops completed from non-explicit selection", () => {
    const q = sanitizePredictQueue({
      projectId: "p1",
      projectDir: "/tmp",
      files: [wav("a.wav", "done"), wav("b.wav", "pending")],
      activeFileName: "a.wav",
      selectedNames: ["a.wav", "b.wav"],
      batchSelectionExplicit: false,
    });
    expect(q.selectedNames).toEqual(["b.wav"]);
  });

  it("appendRecordingsToQueue selects new files without re-adding done", () => {
    const queue = {
      projectId: "p1",
      projectDir: "/tmp/proj",
      files: [wav("a.wav", "done")],
      activeFileName: "a.wav",
      selectedNames: [],
      batchSelectionExplicit: true,
    };
    const next = appendRecordingsToQueue(queue, [
      {
        name: "b.wav",
        path: "/tmp/proj/b.wav",
        rel_path: "b.wav",
        size_bytes: 1,
        modified_at: 0,
        sample_rate_hz: 48_000,
        bit_depth: 16,
        duration_sec: 1,
      },
    ]);
    expect(next.selectedNames).toEqual(["b.wav"]);
    expect(next.files.map((f) => f.name)).toEqual(["a.wav", "b.wav"]);
  });
});

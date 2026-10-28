import { describe, expect, it } from "vitest";
import {
  finetuneApplyStillSameBase,
  finetuneClassStatus,
  finetuneDataStepCanNext,
  finetuneBaseSharesExamples,
  finetuneExampleClassIds,
  finetuneHasNoNewExamples,
  finetuneInheritedMatches,
  finetuneLockMatchesSelection,
  finetuneOutputCollidesWithBase,
  finetuneSelectionMatchesBase,
  forceFinetuneLocks,
  formatFinetuneArchLine,
  formatFinetuneInputLine,
  formatFinetuneSpectroLine,
  mergeFinetuneClasses,
  snapshotFinetuneLocks,
  suggestFinetuneModelName,
  type FinetuneApplyStatus,
  type FinetuneLockSnapshot,
} from "./finetune";
import { emptyDraft, FACTORY_SPECTRO, parseParameterIntoDraft } from "./defaults";

const LOCK_ISL: FinetuneLockSnapshot = {
  path: "/proj/models/orcai-isl-v1",
  calls: ["SS"],
  spectro: {},
  model: {},
};

describe("finetune helpers (m13)", () => {
  it("matches base selection by id or path leaf", () => {
    expect(finetuneSelectionMatchesBase("orcai-isl-v1", "orcai-isl-v1")).toBe(
      true,
    );
    expect(
      finetuneSelectionMatchesBase(
        "orcai-isl-v1",
        "/models/orcai-isl-v1",
      ),
    ).toBe(true);
    expect(
      finetuneSelectionMatchesBase("orcai-isl-v1", "/models/other"),
    ).toBe(false);
    expect(finetuneLockMatchesSelection(LOCK_ISL, "orcai-isl-v1")).toBe(true);
    expect(finetuneLockMatchesSelection(LOCK_ISL, "other")).toBe(false);
    expect(finetuneLockMatchesSelection(null, "orcai-isl-v1")).toBe(false);
  });

  /**
   * Regression: «Далее» must stay enabled when a lock for the current base
   * exists even if applyStatus is not ``ready`` (Strict Mode cancel left
   * status on loading/idle while lock was already committed).
   */
  it("data-step Next: lock match unlocks regardless of loading/idle/ready", () => {
    const statuses: FinetuneApplyStatus[] = ["idle", "loading", "ready"];
    for (const applyStatus of statuses) {
      expect(
        finetuneDataStepCanNext({
          baseModel: "orcai-isl-v1",
          engineReady: true,
          applyStatus,
          lock: LOCK_ISL,
        }),
        `expected Next with status=${applyStatus}`,
      ).toBe(true);
      // Absolute path selection vs lock leaf — same base.
      expect(
        finetuneDataStepCanNext({
          baseModel: "/proj/models/orcai-isl-v1",
          engineReady: true,
          applyStatus,
          lock: LOCK_ISL,
        }),
      ).toBe(true);
    }
  });

  it("data-step Next: blocked without base, engine, lock, or on error", () => {
    expect(
      finetuneDataStepCanNext({
        baseModel: "",
        engineReady: true,
        applyStatus: "ready",
        lock: LOCK_ISL,
      }),
    ).toBe(false);
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: false,
        applyStatus: "ready",
        lock: LOCK_ISL,
      }),
    ).toBe(false);
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: true,
        applyStatus: "ready",
        lock: null,
      }),
    ).toBe(false);
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: true,
        applyStatus: "loading",
        lock: null,
      }),
    ).toBe(false);
    // Stale lock for another model must not unlock Next.
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-nor-v1",
        engineReady: true,
        applyStatus: "ready",
        lock: LOCK_ISL,
      }),
    ).toBe(false);
    // Hard error blocks even with a matching lock (retry path).
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: true,
        applyStatus: "error",
        lock: LOCK_ISL,
      }),
    ).toBe(false);
  });

  it("data-step Next: never keys only on ready without lock match", () => {
    // Former bug pattern: `status === "ready" && Boolean(lock)` with wrong base.
    expect(
      finetuneDataStepCanNext({
        baseModel: "other-model",
        engineReady: true,
        applyStatus: "ready",
        lock: LOCK_ISL,
      }),
    ).toBe(false);
    // And the inverse: loading + matching lock must not stay blocked.
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: true,
        applyStatus: "loading",
        lock: LOCK_ISL,
      }),
    ).toBe(true);
  });

  it("QA-M1: Launch and Next share readiness (lock + engine, not status===ready)", () => {
    const shared = {
      baseModel: "orcai-isl-v1",
      engineReady: true,
      lock: LOCK_ISL,
    } as const;
    // Former Launch-only gate would block here; Next must stay unlocked too.
    expect(
      finetuneDataStepCanNext({ ...shared, applyStatus: "loading" }),
    ).toBe(true);
    expect(
      finetuneDataStepCanNext({ ...shared, applyStatus: "idle" }),
    ).toBe(true);
    expect(
      finetuneDataStepCanNext({ ...shared, applyStatus: "ready" }),
    ).toBe(true);
    // Sidecar-only / engine down blocks both.
    expect(
      finetuneDataStepCanNext({
        ...shared,
        engineReady: false,
        applyStatus: "ready",
      }),
    ).toBe(false);
  });

  it("apply commit: still same base after Strict Mode cancel", () => {
    expect(
      finetuneApplyStillSameBase({
        scenario: "finetune",
        selection: "orcai-isl-v1",
        applyBaseId: "orcai-isl-v1",
        applyBasePath: "/proj/models/orcai-isl-v1",
      }),
    ).toBe(true);
    expect(
      finetuneApplyStillSameBase({
        scenario: "finetune",
        selection: "/proj/models/orcai-isl-v1",
        applyBaseId: "orcai-isl-v1",
        applyBasePath: "/proj/models/orcai-isl-v1",
      }),
    ).toBe(true);
    expect(
      finetuneApplyStillSameBase({
        scenario: "finetune",
        selection: "orcai-nor-v1",
        applyBaseId: "orcai-isl-v1",
        applyBasePath: "/proj/models/orcai-isl-v1",
      }),
    ).toBe(false);
    expect(
      finetuneApplyStillSameBase({
        scenario: "from_scratch",
        selection: "orcai-isl-v1",
        applyBaseId: "orcai-isl-v1",
        applyBasePath: "/proj/models/orcai-isl-v1",
      }),
    ).toBe(false);
  });

  it("suggests *-ft name and bumps -ftN when taken", () => {
    expect(suggestFinetuneModelName("orcai-isl-v1")).toBe("orcai-isl-v1-ft");
    expect(suggestFinetuneModelName("orcai-isl-v1-ft")).toBe("orcai-isl-v1-ft");
    expect(
      suggestFinetuneModelName("orcai-isl-v1", ["orcai-isl-v1-ft"]),
    ).toBe("orcai-isl-v1-ft2");
    expect(
      suggestFinetuneModelName("orcai-isl-v1", [
        "orcai-isl-v1-ft",
        "orcai-isl-v1-ft2",
      ]),
    ).toBe("orcai-isl-v1-ft3");
  });

  it("merges base calls with annotation counts", () => {
    const rows = mergeFinetuneClasses(
      ["WHISTLE", "HERDING"],
      [
        {
          id: "WHISTLE",
          count: 2410,
          recordings: 10,
          duration_sec: 1,
          coverage: 1,
          selected: false,
        },
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.count).toBe(2410);
    expect(rows[0]?.selected).toBe(true);
    expect(rows[1]?.count).toBe(0);
    expect(rows[1]?.selected).toBe(true);
  });

  it("class status matches m13 thresholds", () => {
    expect(finetuneClassStatus(2410)).toBe("ok");
    expect(finetuneClassStatus(200)).toBe("ok");
    expect(finetuneClassStatus(199)).toBe("few");
    expect(finetuneClassStatus(88)).toBe("few");
    expect(finetuneClassStatus(0)).toBe("none");
  });

  it("blocks a base model with no annotation class in common", () => {
    const examples = finetuneExampleClassIds(
      [
        { id: "KAV", count: 4 },
        { id: "BR", count: 0 },
      ],
      ["MEX"],
    );
    expect(examples).toEqual(["KAV", "MEX"]);
    expect(
      finetuneBaseSharesExamples(
        ["BR", "BUZZ", "HERDING", "PHS", "SS", "TAILSLAP", "WHISTLE"],
        examples,
      ),
    ).toBe(false);
    expect(finetuneBaseSharesExamples(["KAV", "QAL"], examples)).toBe(true);
    expect(finetuneBaseSharesExamples(["WHISTLE"], ["WHISTLE"])).toBe(true);
    expect(finetuneBaseSharesExamples(["KAV"], [])).toBe(false);
    expect(
      finetuneDataStepCanNext({
        baseModel: "orcai-isl-v1",
        engineReady: true,
        applyStatus: "ready",
        lock: { ...LOCK_ISL },
        sharesExamples: false,
      }),
    ).toBe(false);
  });

  it("detects no new examples / base overwrite", () => {
    expect(
      finetuneHasNoNewExamples([
        {
          id: "A",
          count: 0,
          recordings: 0,
          duration_sec: 0,
          coverage: 0,
          selected: true,
        },
      ]),
    ).toBe(true);
    expect(
      finetuneHasNoNewExamples([
        {
          id: "A",
          count: 1,
          recordings: 1,
          duration_sec: 0,
          coverage: 0,
          selected: true,
        },
      ]),
    ).toBe(false);
    expect(finetuneOutputCollidesWithBase("orcai-isl-v1", "/m/orcai-isl-v1")).toBe(
      true,
    );
    expect(finetuneOutputCollidesWithBase("orcai-isl-v1-ft", "/m/orcai-isl-v1")).toBe(
      false,
    );
  });

  it("INV-2: force locks + match after tamper", () => {
    const draft = emptyDraft("demo");
    draft.scenario = "finetune";
    draft.spectro = { ...FACTORY_SPECTRO, nfft: 512 };
    draft.model.architecture = "ResNetLSTM";
    draft.model.filters = "30,40,50,60";
    draft.model.kernel_size = 5;
    draft.model.lstm_units = 128;
    draft.classes = mergeFinetuneClasses(["WHISTLE"], []);
    const lock = snapshotFinetuneLocks(draft, "/models/base", ["WHISTLE"]);
    draft.spectro.nfft = 1024;
    expect(finetuneInheritedMatches(draft, lock.spectro, lock.model)).toBe(false);
    const fixed = forceFinetuneLocks(draft, lock);
    expect(fixed.spectro.nfft).toBe(512);
    expect(finetuneInheritedMatches(fixed, lock.spectro, lock.model)).toBe(true);
  });

  it("parses snippets + spectrogram.duration fallback", () => {
    const draft = emptyDraft("demo");
    const withSnippets = parseParameterIntoDraft(draft, {
      spectrogram: {
        sampling_rate: 48000,
        nfft: 512,
        n_overlap: 256,
        freq_range: [0, 16000],
        quantiles: [0.01, 0.999],
        duration: 99,
      },
      snippets: {
        snippet_duration: 4,
        snippets_per_sec: 3,
        segment_duration: 200,
        fraction_removal: 0.1,
      },
    });
    expect(withSnippets.spectro.snippet_duration).toBe(4);
    expect(withSnippets.spectro.nfft).toBe(512);

    const durationOnly = parseParameterIntoDraft(draft, {
      spectrogram: {
        sampling_rate: 48000,
        nfft: 512,
        n_overlap: 256,
        freq_range: [0, 16000],
        quantiles: [0.01, 0.999],
        duration: 4,
      },
    });
    expect(durationOnly.spectro.snippet_duration).toBe(4);
  });

  it("formats inheritance lines", () => {
    const s = { ...FACTORY_SPECTRO };
    expect(formatFinetuneSpectroLine(s, "en")).toContain("nfft");
    expect(formatFinetuneInputLine(s, "ru")).toContain("сниппет");
    expect(
      formatFinetuneArchLine(
        {
          name: "x",
          architecture: "ResNetLSTM",
          filters: "30,40,50,60",
          kernel_size: 5,
          dropout_rate: 0.2,
          lstm_units: 128,
          conv_initializer: "he_normal",
          lstm_initializer: "glorot_uniform",
          epochs: 50,
          batch_size: 64,
          learning_rate: "0.001",
          monitor: "val_mba",
          early_stopping_patience: 10,
          reduce_lr_patience: 5,
          reduce_lr_factor: 0.5,
          reduce_lr_min_learning_rate: "1e-7",
          call_weights: "none",
          shuffle: true,
          seed: 1,
          n_batch_train: 1,
          n_batch_val: 1,
          n_batch_test: 1,
        },
        "ru",
      ),
    ).toContain("фильтры");
  });
});

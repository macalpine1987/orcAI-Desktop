import type {
  CallWeightsMethod,
  HpsFields,
  ModelFields,
  SpectroFields,
  TrainWizardDraft,
} from "./types";

/** Spectrogram / snippets defaults from orcAI ``default_orcai_parameter.json``. */
export const FACTORY_SPECTRO: SpectroFields = {
  sampling_rate: 48000,
  nfft: 512,
  n_overlap: 256,
  freq_low: 0,
  freq_high: 16000,
  quantile_low: 0.01,
  quantile_high: 0.999,
  snippet_duration: 4,
  snippets_per_sec: 3,
  segment_duration: 200,
  fraction_removal: 0.99,
  train: 0.8,
  val: 0.1,
  test: 0.1,
};

/** Wizard model defaults. Kernel/dropout follow the publication guide (orcai-ms-code:
 *  5 / 0.3); remaining fields match orcAI ``default_orcai_parameter.json``. */
export const FACTORY_MODEL: ModelFields = {
  name: "orcai-model",
  architecture: "ResNetLSTM",
  filters: "30, 40, 50, 60",
  epochs: 30,
  kernel_size: 5,
  batch_size: 64,
  dropout_rate: 0.3,
  learning_rate: "1e-4",
  lstm_units: 128,
  conv_initializer: "he_normal",
  lstm_initializer: "glorot_uniform",
  monitor: "val_MBA",
  early_stopping_patience: 10,
  reduce_lr_patience: 3,
  reduce_lr_factor: 0.5,
  reduce_lr_min_learning_rate: "1e-7",
  call_weights: "none",
  shuffle: true,
  seed: 0,
  n_batch_train: 3750,
  n_batch_val: 375,
  n_batch_test: 375,
};

/** Common Keras initializers offered in the wizard (orcAI defaults included). */
export const KERAS_INITIALIZERS = [
  "he_normal",
  "he_uniform",
  "glorot_uniform",
  "glorot_normal",
  "lecun_normal",
  "orthogonal",
] as const;

export const CALL_WEIGHT_METHODS: readonly CallWeightsMethod[] = [
  "none",
  "balanced",
  "max",
  "uniform",
] as const;

/** Mirrors orcAI ``orcai/defaults/default_hps_parameter.json``. */
export const FACTORY_HPS: HpsFields = {
  filters_set1: "10, 20, 30, 40",
  filters_set2: "20, 30, 40, 50",
  filters_set3: "30, 40, 50, 60",
  lstm_units: "64, 128",
  dropout_rate: "0.3, 0.4, 0.5",
  kernel_size: "3, 5, 7",
  batch_size: "64",
  tuner_max_epochs: 15,
  tuner_early_stopping_patience: 10,
};

export function emptyDraft(projectHint?: string): TrainWizardDraft {
  const slug = (projectHint || "model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return {
    scenario: "from_scratch",
    step: "scenario",
    finetuneBaseModel: null,
    recordingTableRel: DEFAULT_RECORDING_TABLE_REL,
    annotationsRel: DEFAULT_ANNOTATIONS_REL,
    equivalencesRel: DEFAULT_EQUIVALENCES_REL,
    equivalencesMap: {},
    classes: [],
    spectro: { ...FACTORY_SPECTRO },
    model: {
      ...FACTORY_MODEL,
      name: slug ? `orcai-${slug}` : FACTORY_MODEL.name,
    },
    includeHpsearch: false,
    hps: { ...FACTORY_HPS },
    testAfterTrain: false,
    compression: "GZIP",
  };
}

export function parseParameterIntoDraft(
  draft: TrainWizardDraft,
  data: Record<string, unknown>,
): TrainWizardDraft {
  const spectro = { ...draft.spectro };
  const model = { ...draft.model };
  const s = data.spectrogram as Record<string, unknown> | undefined;
  const sn = data.snippets as Record<string, unknown> | undefined;
  const m = data.model as Record<string, unknown> | undefined;
  if (s) {
    if (typeof s.sampling_rate === "number") spectro.sampling_rate = s.sampling_rate;
    if (typeof s.nfft === "number") spectro.nfft = s.nfft;
    if (typeof s.n_overlap === "number") spectro.n_overlap = s.n_overlap;
    const fr = s.freq_range;
    if (Array.isArray(fr) && fr.length >= 2) {
      spectro.freq_low = Number(fr[0]);
      spectro.freq_high = Number(fr[1]);
    }
    const q = s.quantiles;
    if (Array.isArray(q) && q.length >= 2) {
      spectro.quantile_low = Number(q[0]);
      spectro.quantile_high = Number(q[1]);
    }
  }
  if (sn) {
    if (typeof sn.snippet_duration === "number") spectro.snippet_duration = sn.snippet_duration;
    if (typeof sn.snippets_per_sec === "number") spectro.snippets_per_sec = sn.snippets_per_sec;
    if (typeof sn.segment_duration === "number") spectro.segment_duration = sn.segment_duration;
    if (typeof sn.fraction_removal === "number") spectro.fraction_removal = sn.fraction_removal;
    if (typeof sn.train === "number") spectro.train = sn.train;
    if (typeof sn.val === "number") spectro.val = sn.val;
    if (typeof sn.test === "number") spectro.test = sn.test;
  }
  // Fallback: orcAI parameter may only list snippet length under spectrogram.duration.
  if (
    s &&
    typeof s.duration === "number" &&
    !(sn && typeof sn.snippet_duration === "number")
  ) {
    spectro.snippet_duration = Number(s.duration);
  }
  if (m) {
    if (typeof m.epochs === "number") model.epochs = m.epochs;
    if (typeof m.batch_size === "number") model.batch_size = m.batch_size;
    if (typeof m.kernel_size === "number") model.kernel_size = m.kernel_size;
    if (typeof m.dropout_rate === "number") model.dropout_rate = m.dropout_rate;
    if (typeof m.lstm_units === "number") model.lstm_units = m.lstm_units;
    if (typeof m.conv_initializer === "string" && m.conv_initializer.trim()) {
      model.conv_initializer = m.conv_initializer.trim();
    }
    if (typeof m.lstm_initializer === "string" && m.lstm_initializer.trim()) {
      model.lstm_initializer = m.lstm_initializer.trim();
    }
    if (typeof m.learning_rate === "number") model.learning_rate = String(m.learning_rate);
    if (typeof m.learning_rate === "string" && m.learning_rate.trim()) {
      model.learning_rate = m.learning_rate.trim();
    }
    if (typeof m.monitor === "string") model.monitor = m.monitor;
    if (typeof m.EarlyStopping_patience === "number") {
      model.early_stopping_patience = m.EarlyStopping_patience;
    }
    if (typeof m.ReduceLROnPlateau_patience === "number") {
      model.reduce_lr_patience = m.ReduceLROnPlateau_patience;
    }
    if (typeof m.ReduceLROnPlateau_factor === "number") {
      model.reduce_lr_factor = m.ReduceLROnPlateau_factor;
    }
    if (typeof m.ReduceLROnPlateau_min_learning_rate === "number") {
      model.reduce_lr_min_learning_rate = String(m.ReduceLROnPlateau_min_learning_rate);
    }
    if (
      typeof m.ReduceLROnPlateau_min_learning_rate === "string" &&
      m.ReduceLROnPlateau_min_learning_rate.trim()
    ) {
      model.reduce_lr_min_learning_rate = m.ReduceLROnPlateau_min_learning_rate.trim();
    }
    if (m.call_weights === null || m.call_weights === undefined) {
      model.call_weights = "none";
    } else if (
      m.call_weights === "balanced" ||
      m.call_weights === "max" ||
      m.call_weights === "uniform"
    ) {
      model.call_weights = m.call_weights;
    }
    if (typeof m.shuffle === "boolean") model.shuffle = m.shuffle;
    if (typeof m.n_batch_train === "number") model.n_batch_train = m.n_batch_train;
    if (typeof m.n_batch_val === "number") model.n_batch_val = m.n_batch_val;
    if (typeof m.n_batch_test === "number") model.n_batch_test = m.n_batch_test;
    if (Array.isArray(m.filters)) model.filters = m.filters.join(", ");
  }
  if (typeof data.architecture === "string") {
    const a = data.architecture;
    if (a === "ResNetLSTM" || a === "ResNet1DConv") model.architecture = a;
  }
  if (typeof data.name === "string" && data.name.trim()) model.name = data.name.trim();
  model.seed = normalizeOrcaiSeed(data.seed, model.seed);
  const calls = data.calls;
  let classes = draft.classes;
  if (Array.isArray(calls) && calls.every((c) => typeof c === "string")) {
    const selected = new Set(calls as string[]);
    classes = draft.classes.map((c) => ({ ...c, selected: selected.has(c.id) }));
  }
  return { ...draft, spectro, model, classes };
}

function parsePositiveFloat(raw: string, fallback: number): number {
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function draftToParameterJson(draft: TrainWizardDraft): Record<string, unknown> {
  const filters = draft.model.filters
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  const lr = parsePositiveFloat(draft.model.learning_rate, 1e-4);
  const minLr = parsePositiveFloat(draft.model.reduce_lr_min_learning_rate, 1e-7);
  const convInit = (draft.model.conv_initializer || "he_normal").trim() || "he_normal";
  const lstmInit =
    (draft.model.lstm_initializer || "glorot_uniform").trim() || "glorot_uniform";
  const callWeights =
    draft.model.call_weights === "none" || !draft.model.call_weights
      ? null
      : draft.model.call_weights;
  return {
    name: draft.model.name,
    architecture: draft.model.architecture,
    model: {
      epochs: draft.model.epochs,
      batch_size: draft.model.batch_size,
      filters: filters.length ? filters : [30, 40, 50, 60],
      conv_initializer: convInit,
      kernel_size: draft.model.kernel_size,
      dropout_rate: draft.model.dropout_rate,
      lstm_units: draft.model.lstm_units,
      lstm_initializer: lstmInit,
      n_batch_train: draft.model.n_batch_train,
      n_batch_val: draft.model.n_batch_val,
      n_batch_test: draft.model.n_batch_test,
      shuffle: draft.model.shuffle,
      learning_rate: lr,
      EarlyStopping_patience: draft.model.early_stopping_patience,
      ReduceLROnPlateau_patience: draft.model.reduce_lr_patience,
      ReduceLROnPlateau_factor: draft.model.reduce_lr_factor,
      ReduceLROnPlateau_min_learning_rate: minLr,
      call_weights: callWeights,
      monitor: draft.model.monitor,
    },
    spectrogram: {
      sampling_rate: draft.spectro.sampling_rate,
      nfft: draft.spectro.nfft,
      n_overlap: draft.spectro.n_overlap,
      freq_range: [draft.spectro.freq_low, draft.spectro.freq_high],
      quantiles: [draft.spectro.quantile_low, draft.spectro.quantile_high],
      duration: draft.spectro.snippet_duration,
    },
    calls: draft.classes.filter((c) => c.selected).map((c) => c.id),
    snippets: {
      segment_duration: draft.spectro.segment_duration,
      snippets_per_sec: draft.spectro.snippets_per_sec,
      snippet_duration: draft.spectro.snippet_duration,
      fraction_removal: draft.spectro.fraction_removal,
      train: draft.spectro.train,
      val: draft.spectro.val,
      test: draft.spectro.test,
    },
    seed: normalizeOrcaiSeed(draft.model.seed),
  };
}

function parseNumList(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

function parseIntList(raw: string): number[] {
  return parseNumList(raw).map((n) => Math.trunc(n));
}

/** Shape expected by orcAI ``hpsearch`` / ``default_hps_parameter.json``. */
export function draftToHpsParameterJson(hps: HpsFields): Record<string, unknown> {
  return {
    filters: {
      set1: parseIntList(hps.filters_set1),
      set2: parseIntList(hps.filters_set2),
      set3: parseIntList(hps.filters_set3),
    },
    lstm_units: parseIntList(hps.lstm_units),
    dropout_rate: parseNumList(hps.dropout_rate),
    kernel_size: parseIntList(hps.kernel_size),
    batch_size: parseIntList(hps.batch_size),
    tuner: {
      max_epochs: Math.max(1, Math.trunc(hps.tuner_max_epochs) || 15),
      early_stopping_patience: Math.max(
        0,
        Math.trunc(hps.tuner_early_stopping_patience) || 0,
      ),
    },
  };
}

export function hpsFileNameForModel(modelName: string): string {
  const safe = (modelName.trim() || "model").replace(/[^\w.\-]+/g, "_");
  return `${safe}_hps_parameter.json`;
}

/**
 * orcAI ``init`` writes ``numpy.random.SeedSequence().entropy`` (huge int).
 * JSON→JS turns it into a float; SeedSequence then fails with "seed must be integer".
 * Keep only JS-safe integers for Desktop-authored parameter files.
 */
export function normalizeOrcaiSeed(raw: unknown, fallback = 0): number {
  if (typeof raw === "bigint") {
    const asNum = Number(raw % BigInt(Number.MAX_SAFE_INTEGER));
    return Number.isFinite(asNum) ? Math.abs(Math.trunc(asNum)) : fallback;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      if (/^\d+$/.test(raw.trim())) {
        return normalizeOrcaiSeed(BigInt(raw.trim()), fallback);
      }
    } catch {
      /* fall through */
    }
    const n = Number(raw);
    if (Number.isFinite(n)) return normalizeOrcaiSeed(n, fallback);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isSafeInteger(raw)) return raw >= 0 ? raw : Math.abs(raw);
    // Float from JSON (e.g. 5.82e+37): derive a stable safe int.
    const truncated = Math.trunc(raw);
    if (Number.isSafeInteger(truncated)) return Math.abs(truncated);
    const asStr = raw.toExponential(15);
    let hash = 0;
    for (let i = 0; i < asStr.length; i += 1) {
      hash = (hash * 31 + asStr.charCodeAt(i)) >>> 0;
    }
    return hash || fallback;
  }
  return Number.isSafeInteger(fallback) ? fallback : 0;
}

export function formatCallsLiteral(calls: string[]): string {
  return `calls = [${calls.join(", ")}]`;
}

/**
 * Parse a number input without turning "", ".", "-" into 0/NaN mid-edit.
 * Incomplete or invalid text keeps ``fallback`` (previous draft value).
 */
export function parseWizardNumber(raw: string, fallback: number): number {
  const t = raw.trim().replace(",", ".");
  if (!t || t === "-" || t === "." || t === "-.") return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

export function splitSumOk(spectro: SpectroFields): boolean {
  const s = spectro.train + spectro.val + spectro.test;
  return Math.abs(s - 1) < 1e-6;
}

/** Rough snippet estimate for step 3. */
export function estimateSnippets(
  annotatedRecordings: number,
  spectro: SpectroFields,
): { snippets: number; gb: number; minutes: number } {
  const perRec =
    Math.max(1, annotatedRecordings) *
    spectro.segment_duration *
    spectro.snippets_per_sec *
    (1 - Math.min(0.999, Math.max(0, spectro.fraction_removal)) * 0.15);
  const snippets = Math.round(perRec * Math.max(1, annotatedRecordings));
  const gb = Math.round((snippets * 0.00008) * 10) / 10;
  const minutes = Math.max(1, Math.round(snippets / 1600));
  return { snippets, gb, minutes };
}

/** Rough train ETA for step 4 (m11); baseline ≈ 4h10m at factory epochs×batches. */
export function estimateTrain(model: ModelFields): { hours: number; minutes: number } {
  const work = Math.max(1, model.epochs) * Math.max(1, model.n_batch_train);
  const baseline = 30 * 3750;
  const totalMin = Math.max(1, Math.round((work / baseline) * 250));
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

/** Duration as «H ч M м» for wizard class table (m09). */
export function formatDurationHm(sec: number): { h: number; m: number } | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return { h, m: m === 60 ? 59 : m };
}

/** Prefer project-relative path when the absolute path is under projectDir. */
export function toProjectRelativePath(absPath: string, projectDir: string): string {
  const norm = absPath.replace(/\\/g, "/");
  const root = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root && (norm === root || norm.startsWith(`${root}/`))) {
    const rel = norm.slice(root.length).replace(/^\//, "");
    return rel || ".";
  }
  return absPath;
}

export const DEFAULT_RECORDING_TABLE_REL = "recording_table.csv";
export const DEFAULT_ANNOTATIONS_REL = "annotations/";
export const DEFAULT_EQUIVALENCES_REL = "call_equivalences.json";

/** True when path is absolute or escapes the project with ``..``. */
export function isOutsideProjectPath(path: string, projectDir: string): boolean {
  const raw = (path || "").trim().replace(/\\/g, "/");
  if (!raw || raw === "." || raw === "./") return false;
  if (/^[a-zA-Z]:\//.test(raw) || raw.startsWith("/")) {
    const root = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!root) return true;
    return !(raw === root || raw.startsWith(`${root}/`));
  }
  const parts = raw.split("/").filter(Boolean);
  return parts.includes("..");
}

/**
 * Wizard step 2 paths must stay inside the project (m08/m09).
 * External absolute paths (annotation import source, other Mac) → defaults.
 */
export function sanitizeWizardDataPaths(
  paths: {
    recordingTableRel: string;
    annotationsRel: string;
    equivalencesRel: string;
  },
  projectDir: string | null | undefined,
): {
  recordingTableRel: string;
  annotationsRel: string;
  equivalencesRel: string;
} {
  const root = (projectDir || "").trim();
  const fix = (value: string, fallback: string, dirSlash = false): string => {
    let v = (value || "").trim() || fallback;
    if (root) {
      if (isOutsideProjectPath(v, root)) return fallback;
      v = toProjectRelativePath(v, root);
      if (isOutsideProjectPath(v, root)) return fallback;
    } else if (/^[a-zA-Z]:\//.test(v.replace(/\\/g, "/")) || v.startsWith("/")) {
      return fallback;
    }
    if (dirSlash && !v.endsWith("/")) v = `${v}/`;
    return v || fallback;
  };
  return {
    recordingTableRel: fix(paths.recordingTableRel, DEFAULT_RECORDING_TABLE_REL),
    annotationsRel: fix(paths.annotationsRel, DEFAULT_ANNOTATIONS_REL, true),
    equivalencesRel: fix(paths.equivalencesRel, DEFAULT_EQUIVALENCES_REL),
  };
}

/** Canonical in-project layout for wizard step 2 (never the annotation import source). */
export function projectWizardDataPaths(projectDir?: string | null): {
  recordingTableRel: string;
  annotationsRel: string;
  equivalencesRel: string;
} {
  return sanitizeWizardDataPaths(
    {
      recordingTableRel: DEFAULT_RECORDING_TABLE_REL,
      annotationsRel: DEFAULT_ANNOTATIONS_REL,
      equivalencesRel: DEFAULT_EQUIVALENCES_REL,
    },
    projectDir,
  );
}

/** Absolute path under the project for display in step-2 inputs. */
export function wizardPathAbsolute(
  projectDir: string | null | undefined,
  rel: string,
): string {
  const root = (projectDir || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const clean = (rel || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!root) return clean;
  if (!clean) return root;
  return `${root}/${clean}`;
}

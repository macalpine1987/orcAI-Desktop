/** finetune helpers (m13 · locked inheritance + class status). */

import type { ClassStatRow, ModelFields, SpectroFields, TrainWizardDraft } from "./types";

/** Fields fixed by the base model's weight shape / spectrogram (m13). */
export const FINETUNE_LOCKED_SPECTRO: ReadonlyArray<keyof SpectroFields> = [
  "sampling_rate",
  "nfft",
  "n_overlap",
  "freq_low",
  "freq_high",
  "quantile_low",
  "quantile_high",
  "snippet_duration",
  "snippets_per_sec",
  "segment_duration",
  "fraction_removal",
];

export const FINETUNE_LOCKED_MODEL: ReadonlyArray<keyof ModelFields> = [
  "architecture",
  "filters",
  "kernel_size",
  "dropout_rate",
  "lstm_units",
  "conv_initializer",
  "lstm_initializer",
];

/**
 * Below this count → «мало примеров».
 * m13: BR=88 → few; SS=512 → ok. Soft heuristic (not an orcAI hard limit).
 */
export const FINETUNE_FEW_EXAMPLES_THRESHOLD = 200;

export type FinetuneClassStatus = "ok" | "few" | "none";

/** Snapshot of locked fields applied from the base (INV-2). */
export type FinetuneLockSnapshot = {
  path: string;
  calls: string[];
  spectro: Partial<SpectroFields>;
  model: Partial<ModelFields>;
};

export function finetuneClassStatus(count: number): FinetuneClassStatus {
  if (count <= 0) return "none";
  if (count < FINETUNE_FEW_EXAMPLES_THRESHOLD) return "few";
  return "ok";
}

/** Suggest a new catalog name that does not overwrite the base folder. */
export function suggestFinetuneModelName(
  baseName: string,
  takenNames?: Iterable<string>,
): string {
  const clean = (baseName || "model").trim().replace(/\/+$/, "");
  const leaf = clean.split(/[/\\]/).filter(Boolean).pop() || "model";
  const stem = leaf.replace(/-ft\d*$/i, "");
  const taken = new Set(
    [...(takenNames ?? [])]
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  );
  const first = `${stem}-ft`;
  if (!taken.has(first.toLowerCase())) return first;
  let n = 2;
  while (taken.has(`${stem}-ft${n}`.toLowerCase())) n += 1;
  return `${stem}-ft${n}`;
}

/**
 * Keep base ``calls`` order and selection; attach annotation stats when present.
 * Classes with zero new examples stay selected (weights keep the head).
 */
export function mergeFinetuneClasses(
  baseCalls: string[],
  annotationRows: ClassStatRow[],
): ClassStatRow[] {
  const byId = new Map(annotationRows.map((r) => [r.id, r]));
  return baseCalls.map((id) => {
    const found = byId.get(id);
    if (found) return { ...found, selected: true };
    return {
      id,
      count: 0,
      recordings: 0,
      duration_sec: 0,
      coverage: 0,
      selected: true,
    };
  });
}

export function finetuneClassesWithoutExamples(classes: ClassStatRow[]): ClassStatRow[] {
  return classes.filter((c) => c.selected && c.count <= 0);
}

/** Annotation labels that actually occur (class stats plus unlisted names). */
export function finetuneExampleClassIds(
  stats: ReadonlyArray<{ id: string; count: number }>,
  unlisted: readonly string[] = [],
): string[] {
  const ids = new Set<string>();
  for (const row of stats) {
    const id = row.id.trim();
    if (id && row.count > 0) ids.add(id);
  }
  for (const label of unlisted) {
    const name = label.trim();
    if (name) ids.add(name);
  }
  return [...ids];
}

/**
 * Fine-tune can proceed when at least one base class is present in the
 * annotations. Other base classes keep their weights.
 */
export function finetuneBaseSharesExamples(
  modelCalls: readonly string[] | null | undefined,
  exampleIds: readonly string[],
): boolean {
  const examples = new Set(exampleIds.map((id) => id.trim()).filter(Boolean));
  if (!examples.size) return false;
  return (modelCalls ?? []).some((call) => examples.has(call.trim()));
}

/** True when every selected class has zero new examples (useless finetune). */
export function finetuneHasNoNewExamples(classes: ClassStatRow[]): boolean {
  const selected = classes.filter((c) => c.selected);
  if (!selected.length) return true;
  return selected.every((c) => c.count <= 0);
}

export function finetuneBaseLeaf(pathOrId: string | null | undefined): string {
  if (!pathOrId?.trim()) return "";
  const clean = pathOrId.trim().replace(/\/+$/, "");
  return clean.split(/[/\\]/).filter(Boolean).pop() || clean;
}

/** True when UI selection still refers to the same base as the lock / apply target. */
export function finetuneSelectionMatchesBase(
  selection: string | null | undefined,
  basePathOrId: string | null | undefined,
): boolean {
  const sel = selection?.trim() ?? "";
  const base = basePathOrId?.trim() ?? "";
  if (!sel || !base) return false;
  if (sel === base) return true;
  return finetuneBaseLeaf(sel) === finetuneBaseLeaf(base);
}

/** Lock is still valid for the current finetuneBaseModel selection. */
export function finetuneLockMatchesSelection(
  lock: FinetuneLockSnapshot | null | undefined,
  selection: string | null | undefined,
): boolean {
  if (!lock?.path) return false;
  return finetuneSelectionMatchesBase(selection, lock.path);
}

/** Apply / inherit lifecycle for the finetune data step. */
export type FinetuneApplyStatus = "idle" | "loading" | "ready" | "error";

/**
 * Shared readiness for finetune «Далее» (data step) and Launch (preflight).
 *
 * Requires real ``engineReady`` (sidecar + orcAI), a lock that matches the
 * selected base, and no hard apply error. Matching lock unlocks even when
 * status is still ``loading`` / ``idle`` (Strict Mode can cancel the apply
 * effect after the lock is committed). Never require ``status === "ready"``
 * alone — that stuck Next; Launch must not reintroduce that gate.
 */
export function finetuneDataStepCanNext(opts: {
  baseModel: string | null | undefined;
  engineReady: boolean;
  applyStatus: FinetuneApplyStatus;
  lock: FinetuneLockSnapshot | null | undefined;
  /** False when the base shares no annotation class. Omitted while unknown. */
  sharesExamples?: boolean;
}): boolean {
  if (!opts.baseModel?.trim()) return false;
  if (opts.sharesExamples === false) return false;
  if (!opts.engineReady) return false;
  if (!finetuneLockMatchesSelection(opts.lock, opts.baseModel)) return false;
  // Hard apply error: block until retry clears / replaces the lock.
  if (opts.applyStatus === "error") return false;
  return true;
}

/**
 * After an async apply finishes, commit lock/draft only if the user still has
 * the same base selected (id or path leaf). Used when the effect was cancelled
 * (Strict Mode) but the selection did not change.
 */
export function finetuneApplyStillSameBase(opts: {
  scenario: string | null | undefined;
  selection: string | null | undefined;
  applyBaseId: string;
  applyBasePath: string;
}): boolean {
  if (opts.scenario !== "finetune") return false;
  return (
    finetuneSelectionMatchesBase(opts.selection, opts.applyBaseId) ||
    finetuneSelectionMatchesBase(opts.selection, opts.applyBasePath)
  );
}

/** Output folder name must not equal the base model leaf (base unchanged). */
export function finetuneOutputCollidesWithBase(
  outputName: string,
  basePathOrId: string | null | undefined,
): boolean {
  const out = outputName.trim().toLowerCase();
  const base = finetuneBaseLeaf(basePathOrId).toLowerCase();
  return Boolean(out && base && out === base);
}

/** One-line spectro summary for the m13 inheritance box. */
export function formatFinetuneSpectroLine(
  s: SpectroFields,
  locale: "ru" | "en" = "en",
): string {
  const rate = Number(s.sampling_rate).toLocaleString(
    locale === "ru" ? "ru-RU" : "en-US",
  );
  const hz = locale === "ru" ? "Гц" : "Hz";
  return `${rate} ${hz} · nfft ${s.nfft} · overlap ${s.n_overlap} · ${s.freq_low}–${Number(s.freq_high).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")} ${hz}`;
}

/** Input shape line (snippet + quantiles). */
export function formatFinetuneInputLine(
  s: SpectroFields,
  locale: "ru" | "en" = "en",
): string {
  if (locale === "ru") {
    return `сниппет ${s.snippet_duration} с · квантили ${s.quantile_low}–${s.quantile_high}`;
  }
  return `snippet ${s.snippet_duration}s · quantiles ${s.quantile_low}–${s.quantile_high}`;
}

/** Architecture / filters line from draft model block. */
export function formatFinetuneArchLine(
  m: ModelFields,
  locale: "ru" | "en" = "en",
): string {
  const filters = String(m.filters || "").replace(/,/g, "/").replace(/\s+/g, "");
  if (locale === "ru") {
    return `${m.architecture} · фильтры ${filters} · ядро ${m.kernel_size} · LSTM ${m.lstm_units}`;
  }
  return `${m.architecture} · filters ${filters} · kernel ${m.kernel_size} · LSTM ${m.lstm_units}`;
}

/** Soft check: draft spectro/arch match what was applied from the base (INV-2). */
export function finetuneInheritedMatches(
  draft: TrainWizardDraft,
  baseSpectro: Partial<SpectroFields> | null | undefined,
  baseModel: Partial<ModelFields> | null | undefined,
): boolean {
  if (!baseSpectro && !baseModel) return true;
  if (baseSpectro) {
    for (const key of FINETUNE_LOCKED_SPECTRO) {
      if (baseSpectro[key] === undefined) continue;
      if (
        Number(draft.spectro[key]) !== Number(baseSpectro[key]) &&
        String(draft.spectro[key]) !== String(baseSpectro[key])
      ) {
        return false;
      }
    }
  }
  if (baseModel) {
    for (const key of FINETUNE_LOCKED_MODEL) {
      if (baseModel[key] === undefined) continue;
      if (String(draft.model[key]) !== String(baseModel[key])) return false;
    }
  }
  return true;
}

/** Re-apply locked spectro / arch / calls from the base snapshot (submit-time INV-2). */
export function forceFinetuneLocks(
  draft: TrainWizardDraft,
  lock: FinetuneLockSnapshot,
): TrainWizardDraft {
  const spectro = { ...draft.spectro };
  for (const key of FINETUNE_LOCKED_SPECTRO) {
    const v = lock.spectro[key];
    if (v !== undefined) {
      (spectro as Record<string, unknown>)[key] = v;
    }
  }
  const model = { ...draft.model };
  for (const key of FINETUNE_LOCKED_MODEL) {
    const v = lock.model[key];
    if (v !== undefined) {
      (model as Record<string, unknown>)[key] = v;
    }
  }
  const classes = lock.calls.length
    ? mergeFinetuneClasses(lock.calls, draft.classes)
    : draft.classes;
  return {
    ...draft,
    spectro,
    model,
    classes,
  };
}

/** Build INV-2 snapshot from a draft after base parameters were applied. */
export function snapshotFinetuneLocks(
  draft: TrainWizardDraft,
  path: string,
  calls: string[],
): FinetuneLockSnapshot {
  const spectro: Partial<SpectroFields> = {};
  for (const key of FINETUNE_LOCKED_SPECTRO) {
    spectro[key] = draft.spectro[key];
  }
  const model: Partial<ModelFields> = {};
  for (const key of FINETUNE_LOCKED_MODEL) {
    model[key] = draft.model[key] as never;
  }
  return { path, calls: [...calls], spectro, model };
}

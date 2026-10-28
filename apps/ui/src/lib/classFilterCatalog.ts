import type { OrcaiModel } from "../api/models";
import { formatDetectionClassCode } from "./labelColors";

/** Builtin parameter.json `calls` when the catalog row has not loaded them yet. */
const BUILTIN_MODEL_CALLS: Record<string, readonly string[]> = {
  "orcai-isl-v1": ["BR", "BUZZ", "HERDING", "PHS", "SS", "TAILSLAP", "WHISTLE"],
  "orcai-nor-v1": ["BR", "BUZZ", "HERDING", "PHS", "SS", "TAILSLAP", "WHISTLE"],
};

export type ClassFilterEntry = {
  label: string;
  count: number;
};

function cleanCalls(calls: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of calls ?? []) {
    const name = raw.trim();
    if (!name) continue;
    const code = formatDetectionClassCode(name);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(name);
  }
  return out;
}

/**
 * Class names of the model selected for recognition.
 * `null` — the model is not in the catalog yet (do not invent the builtin seven).
 * A trained model uses its own `calls`, never the publication list.
 */
export function callsForSelectedModel(
  models: readonly OrcaiModel[],
  modelId: string,
  modelDir?: string | null,
): string[] | null {
  const id = modelId.trim();
  const dir = modelDir?.trim() ?? "";
  const model = models.find(
    (row) => row.id === id || (dir !== "" && row.path === dir),
  );
  if (!model) return BUILTIN_MODEL_CALLS[id] ? [...BUILTIN_MODEL_CALLS[id]] : null;
  const fromParameter = cleanCalls(model.calls);
  if (fromParameter.length > 0) return fromParameter;
  const builtin = BUILTIN_MODEL_CALLS[model.id] ?? BUILTIN_MODEL_CALLS[id];
  return builtin ? [...builtin] : null;
}

function collapseByCode(entries: readonly ClassFilterEntry[]): ClassFilterEntry[] {
  const rows: ClassFilterEntry[] = [];
  const indexByCode = new Map<string, number>();
  for (const entry of entries) {
    const code = formatDetectionClassCode(entry.label);
    const at = indexByCode.get(code);
    if (at == null) {
      indexByCode.set(code, rows.length);
      rows.push(entry);
      continue;
    }
    const prev = rows[at];
    rows[at] = { label: prev.label, count: prev.count + entry.count };
  }
  return rows;
}

/**
 * Filter rows for the recognition class rail.
 * With a model catalog, every class of that model is listed (count 0 if absent
 * from the file). Classes that are not in the model are not added.
 * Without a catalog, only classes actually present in the file are shown.
 */
export function classFilterRows(
  modelClasses: readonly string[] | null,
  entries: readonly ClassFilterEntry[],
): ClassFilterEntry[] {
  if (modelClasses == null) return collapseByCode(entries);
  const catalog = cleanCalls(modelClasses);
  const used = new Set<number>();
  const rows: ClassFilterEntry[] = [];
  for (const name of catalog) {
    const code = formatDetectionClassCode(name);
    let count = 0;
    let label = name;
    let tookFileLabel = false;
    entries.forEach((entry, index) => {
      if (used.has(index)) return;
      if (formatDetectionClassCode(entry.label) !== code) return;
      used.add(index);
      count += entry.count;
      if (!tookFileLabel) {
        label = entry.label;
        tookFileLabel = true;
      }
    });
    rows.push({ label, count });
  }
  return rows;
}

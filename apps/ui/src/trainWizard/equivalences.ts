/** orcAI call_equivalences.json: raw annotation label → canonical class (calls). */

export type EquivalencesMap = Record<string, string>;

/** Desktop UI: one alternate spelling per class (avoids label confusion). */
export const MAX_SYNONYMS_PER_CLASS = 1;

export function parseEquivalencesJson(text: string): EquivalencesMap {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("call_equivalences must be a JSON object");
  }
  const out: EquivalencesMap = {};
  for (const [raw, canonical] of Object.entries(data as Record<string, unknown>)) {
    if (typeof canonical !== "string" || !raw.trim() || !canonical.trim()) continue;
    out[raw.trim()] = canonical.trim();
  }
  return out;
}

export function ensureIdentity(
  map: EquivalencesMap,
  selectedClassIds: string[],
): EquivalencesMap {
  const out: EquivalencesMap = { ...map };
  for (const id of selectedClassIds) {
    if (!(id in out)) out[id] = id;
  }
  // Drop identity rows for classes no longer selected; keep synonym→class if still selected.
  for (const [raw, canonical] of Object.entries(out)) {
    if (!selectedClassIds.includes(canonical)) {
      delete out[raw];
    }
  }
  return out;
}

/** First synonym of each class. That string is the Type-column publication name. */
export function publicationNamesFromEquivalences(
  map: EquivalencesMap,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [raw, canonical] of Object.entries(map)) {
    if (!raw || raw === canonical || out[canonical]) continue;
    out[canonical] = raw;
  }
  return out;
}

/** Synonyms per class (excluding identity raw===class). */
export function synonymsByClassFromMap(
  map: EquivalencesMap,
  classIds: string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of classIds) out[id] = [];
  for (const [raw, canonical] of Object.entries(map)) {
    if (raw === canonical) continue;
    if (!out[canonical]) continue;
    out[canonical].push(raw);
  }
  return out;
}

export function mapFromSynonymsByClass(
  byClass: Record<string, string[]>,
  selectedClassIds: string[],
): EquivalencesMap {
  const map: EquivalencesMap = {};
  for (const id of selectedClassIds) {
    map[id] = id;
    let kept = 0;
    for (const syn of byClass[id] ?? []) {
      if (kept >= MAX_SYNONYMS_PER_CLASS) break;
      const raw = syn.trim();
      if (!raw || raw === id) continue;
      map[raw] = id;
      kept += 1;
    }
  }
  return map;
}

export function countSynonymRules(map: EquivalencesMap): number {
  return Object.entries(map).filter(([raw, canonical]) => raw !== canonical).length;
}

/**
 * Replace the synonym list for one class; keeps other classes intact.
 * Rejects tokens that equal any class id (would overwrite identity for orcAI).
 * Rejects tokens already mapped to a different class (first owner wins).
 * Caps at {@link MAX_SYNONYMS_PER_CLASS} (Desktop UI policy).
 */
export function replaceClassSynonyms(
  map: EquivalencesMap,
  classId: string,
  synonyms: string[],
  classIds: string[],
): EquivalencesMap {
  const ids = classIds.includes(classId) ? classIds : [...classIds, classId];
  const reserved = new Set(ids.map((id) => id.trim()).filter(Boolean));
  const byClass = synonymsByClassFromMap(map, ids);
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const syn of synonyms) {
    if (cleaned.length >= MAX_SYNONYMS_PER_CLASS) break;
    const raw = syn.trim();
    if (!raw || raw === classId || seen.has(raw)) continue;
    // Never let a synonym steal another class's identity key.
    if (reserved.has(raw)) continue;
    const prior = map[raw];
    if (prior && prior !== classId) continue;
    seen.add(raw);
    cleaned.push(raw);
  }
  byClass[classId] = cleaned;
  return mapFromSynonymsByClass(byClass, ids);
}

/** Split a free-text field (comma / semicolon) into synonym tokens. */
export function parseSynonymInput(text: string): string[] {
  return text
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatEquivalencesJson(map: EquivalencesMap): string {
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
  const ordered: EquivalencesMap = {};
  for (const k of keys) ordered[k] = map[k]!;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * After an async wizard load: keep in-memory edits if the user changed
 * equivalences while fetch was in flight (generation bumped).
 */
export function pickEquivalencesAfterLoad(opts: {
  loadedEq: EquivalencesMap;
  prevMap: EquivalencesMap;
  genAtLoadStart: number;
  genNow: number;
}): EquivalencesMap {
  if (opts.genAtLoadStart !== opts.genNow) {
    return opts.prevMap;
  }
  if (Object.keys(opts.loadedEq).length) {
    return opts.loadedEq;
  }
  return opts.prevMap;
}

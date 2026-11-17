import type { ParameterValidation } from "../api/projects";

const EXCLUDED_SUFFIX = " excluded from calls";

/** Classes removed from default orcAI `calls`, plus leftover warnings. */
export function splitParameterExcludedCalls(validation: ParameterValidation | null): {
  excluded: string[];
  otherWarnings: string[];
} {
  if (!validation) return { excluded: [], otherWarnings: [] };

  const fromField = (validation.excluded_calls ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  const otherWarnings: string[] = [];
  const fromWarnings: string[] = [];
  for (const raw of validation.warnings) {
    if (raw.endsWith(EXCLUDED_SUFFIX)) {
      const name = raw.slice(0, -EXCLUDED_SUFFIX.length).trim();
      if (name) fromWarnings.push(name);
    } else {
      otherWarnings.push(raw);
    }
  }

  const seen = new Set<string>();
  const excluded: string[] = [];
  for (const name of [...fromField, ...fromWarnings]) {
    if (seen.has(name)) continue;
    seen.add(name);
    excluded.push(name);
  }
  return { excluded, otherWarnings };
}

import type { TFunction } from "i18next";

/** Localized orcAI step title for Lab dock / pipeline UI (not Jobs table).
 * Jobs / Home recent jobs always show the raw CLI id (`predict`, not «Распознавание»). */
export function jobCommandLabel(command: string, t: TFunction): string {
  const key = `pipeline.steps.${command}`;
  const label = t(key);
  return label === key ? command : label;
}

/**
 * Project-scoped class color overrides (Desktop-only).
 * Built-in model palettes stay Paul Tol; user models / project annotations
 * may override via `orcai_desktop_class_colors.json`.
 */

import { joinFsPath } from "./joinFsPath";
import {
  EXTENDED_PALETTE,
  PUBLICATION_LABEL_COLORS,
  type LabelColorMap,
} from "./labelColors";
import { readTextFile, writeTextFile } from "../api/filterPreview";

export const CLASS_COLORS_FILENAME = "orcai_desktop_class_colors.json";

/** Paul Tol + extended palette for the wizard swatch picker. */
export const CLASS_COLOR_PRESETS: readonly string[] = [
  ...Object.values(PUBLICATION_LABEL_COLORS),
  ...EXTENDED_PALETTE.slice(0, 8),
];

export type ClassColorsFile = {
  version: 1;
  colors: Record<string, string>;
};

const HEX_RE = /^#([\da-f]{3}|[\da-f]{6})$/i;

export function isValidClassColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function normalizeClassColor(value: string): string | null {
  const raw = value.trim();
  if (!HEX_RE.test(raw)) return null;
  const hex = raw.toUpperCase();
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

export function parseClassColorsJson(text: string): Record<string, string> {
  try {
    const data = JSON.parse(text) as Partial<ClassColorsFile>;
    if (!data || typeof data !== "object" || !data.colors || typeof data.colors !== "object") {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [id, color] of Object.entries(data.colors)) {
      if (typeof id !== "string" || !id.trim()) continue;
      if (typeof color !== "string") continue;
      const norm = normalizeClassColor(color);
      if (norm) out[id.trim()] = norm;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeClassColors(colors: Record<string, string>): string {
  const cleaned: Record<string, string> = {};
  for (const id of Object.keys(colors).sort()) {
    const norm = normalizeClassColor(colors[id] ?? "");
    if (norm) cleaned[id] = norm;
  }
  const doc: ClassColorsFile = { version: 1, colors: cleaned };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export async function classColorsPath(projectDir: string): Promise<string> {
  return joinFsPath(projectDir, CLASS_COLORS_FILENAME);
}

export async function loadProjectClassColors(
  projectDir: string,
): Promise<Record<string, string>> {
  try {
    const path = await classColorsPath(projectDir);
    const text = await readTextFile(path);
    if (!text) return {};
    return parseClassColorsJson(text);
  } catch {
    return {};
  }
}

export async function saveProjectClassColors(
  projectDir: string,
  colors: Record<string, string>,
): Promise<void> {
  const path = await classColorsPath(projectDir);
  await writeTextFile(path, serializeClassColors(colors));
}

/** Override wins over map / Paul Tol for matching class ids. */
export function resolveClassColor(
  classId: string,
  overrides?: Record<string, string> | null,
): string | null {
  if (!overrides) return null;
  const direct =
    overrides[classId] ??
    overrides[classId.toUpperCase()] ??
    Object.entries(overrides).find(
      ([k]) => k.toUpperCase() === classId.toUpperCase(),
    )?.[1];
  if (typeof direct === "string" && isValidClassColor(direct)) {
    return normalizeClassColor(direct);
  }
  return null;
}

export function mergeLabelColorOverrides(
  base: LabelColorMap,
  overrides?: Record<string, string> | null,
): LabelColorMap {
  if (!overrides || !Object.keys(overrides).length) return base;
  const next = new Map(base);
  for (const [id, color] of Object.entries(overrides)) {
    const norm = normalizeClassColor(color);
    if (!norm) continue;
    next.set(id, norm);
  }
  return next;
}

/** Editable in training wizard for user-owned training scenarios. */
export function classColorsEditable(scenario: string): boolean {
  return scenario === "from_scratch" || scenario === "finetune";
}

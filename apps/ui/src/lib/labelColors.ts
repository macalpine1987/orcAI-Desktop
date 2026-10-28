/** Stable colors and legend order — Paul Tol / orcAI (m04). */

/**
 * Paul Tol qualitative palette keyed by MMS publication names
 * (ТИП column). Codes WHISTLE/BUZZ/… use the same hex via aliases.
 *
 * Spec: WHISTLE #AA4499, BUZZ #117733, PHS #88CCEE, SS #DDCC77,
 * BR #332288, HERDING #44AA99, TAILSLAP #CC6677.
 */
export const PUBLICATION_LABEL_COLORS: Record<string, string> = {
  whistles: "#AA4499",
  buzzing: "#117733",
  "prey handling sounds": "#88CCEE",
  "pulsed calls": "#DDCC77",
  breathing: "#332288",
  "herding calls": "#44AA99",
  "tail slaps": "#CC6677",
};

/** orcAI class code for each publication name (легенда «КЛАССЫ»). */
export const PUBLICATION_TO_CLASS_CODE: Record<
  keyof typeof PUBLICATION_LABEL_COLORS,
  string
> = {
  whistles: "WHISTLE",
  buzzing: "BUZZ",
  "prey handling sounds": "PHS",
  "pulsed calls": "SS",
  breathing: "BR",
  "herding calls": "HERDING",
  "tail slaps": "TAILSLAP",
};

/**
 * orcAI / field abbreviations shown in detection tables (also with trailing `*`).
 * Colors match the Paul Tol legend swatches.
 */
export const SIGNAL_TYPE_ALIASES: Record<string, keyof typeof PUBLICATION_LABEL_COLORS> =
  {
    br: "breathing",
    buzz: "buzzing",
    herd: "herding calls",
    herding: "herding calls",
    phs: "prey handling sounds",
    ss: "pulsed calls",
    ts: "tail slaps",
    tailslap: "tail slaps",
    "tail slap": "tail slaps",
    wh: "whistles",
    whistle: "whistles",
  };

/**
 * Preferred legend order (m04): WHISTLE → BUZZ → PHS → SS → BR → HERDING → TAILSLAP.
 */
export const PUBLICATION_LABEL_ORDER: string[] = [
  "whistles",
  "buzzing",
  "prey handling sounds",
  "pulsed calls",
  "breathing",
  "herding calls",
  "tail slaps",
];

/** Abbreviation / code legend order aligned with m04. */
export const SIGNAL_TYPE_ABBREVIATION_ORDER: string[] = [
  "WHISTLE",
  "BUZZ",
  "PHS",
  "SS",
  "BR",
  "HERDING",
  "TAILSLAP",
];

/** Extra distinct colors when publication names do not cover all classes. */
export const EXTENDED_PALETTE = [
  "#d55e00",
  "#0072b2",
  "#e69f00",
  "#009e73",
  "#cc79a7",
  "#56b4e9",
  "#f0e442",
  "#882255",
  "#44aa99",
  "#999933",
  "#661100",
  "#117733",
  "#332288",
  "#aa4499",
  "#88ccee",
] as const;

export type LabelColorMap = ReadonlyMap<string, string>;

export type LabelLayerSource = "primary" | "compare";

export type LabelStyle = {
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeWidth: number;
  strokeDasharray?: string;
};

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\*+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLabelKey(label: string): string | null {
  const norm = normalizeLabel(label);
  if (!norm) return null;

  const alias = SIGNAL_TYPE_ALIASES[norm];
  if (alias) return alias;

  for (const key of Object.keys(PUBLICATION_LABEL_COLORS)) {
    if (normalizeLabel(key) === norm) return key;
  }

  // Singular forms of publication names: whistle → whistles
  for (const key of PUBLICATION_LABEL_ORDER) {
    const keyNorm = normalizeLabel(key);
    const stem = keyNorm.replace(/s$/, "");
    if (norm === stem) return key;
  }

  // Spelled-out variants: "herding call", "whistle sounds". A bare prefix is not
  // enough — trained classes such as SS_A, WH_2 or BRS are distinct classes.
  const aliasEntries = Object.entries(SIGNAL_TYPE_ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [abbr, pub] of aliasEntries) {
    if (norm === abbr) return pub;
    if (!norm.startsWith(abbr + " ")) continue;
    if (/^(calls?|sounds?)$/.test(norm.slice(abbr.length + 1))) return pub;
  }

  return null;
}

/** Publication class name for a raw label (abbreviation or full name). */
export function publicationNameForLabel(label: string): string | null {
  return canonicalLabelKey(label);
}

/** Drop orcAI's default predict suffix (`KAV*` → `KAV`). */
function stripLabelSuffix(label: string): string {
  return label.replace(/\*+$/, "");
}

/** Class code → wizard synonym, shown as the Type-column publication name. */
export type ClassPublicationNames = Record<string, string> | null | undefined;

function customPublicationName(
  label: string,
  names: ClassPublicationNames,
): string | null {
  if (!names) return null;
  const code = stripLabelSuffix(label.trim());
  if (!code) return null;
  const direct =
    names[code] ?? names[code.toUpperCase()] ?? names[code.toLowerCase()];
  const raw =
    typeof direct === "string"
      ? direct
      : Object.entries(names).find(
          ([key]) => key.toUpperCase() === code.toUpperCase(),
        )?.[1];
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text || null;
}

/**
 * Detection table type column. A wizard synonym is the publication name.
 * Without one, a builtin class keeps its MMS name (`whistles`); a trained
 * class shows the code without the predict suffix.
 */
export function formatDetectionTypeLabel(
  label: string,
  names?: ClassPublicationNames,
): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  return (
    customPublicationName(trimmed, names) ??
    canonicalLabelKey(trimmed) ??
    stripLabelSuffix(trimmed)
  );
}

/** orcAI class code for legend / КЛАСС column (`WHISTLE`, `BUZZ`, …). */
export function formatDetectionClassCode(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const publication = canonicalLabelKey(trimmed);
  if (publication && PUBLICATION_TO_CLASS_CODE[publication]) {
    return PUBLICATION_TO_CLASS_CODE[publication];
  }
  // Already a code like WHISTLE* / BUZZ
  const upper = trimmed.replace(/\*+$/, "").toUpperCase();
  if (SIGNAL_TYPE_ABBREVIATION_ORDER.includes(upper)) return upper;
  // Legacy short codes
  const legacy: Record<string, string> = {
    WH: "WHISTLE",
    HERD: "HERDING",
    TS: "TAILSLAP",
  };
  return legacy[upper] ?? upper;
}

/**
 * Compact code + publication name (`WHISTLE (whistles)`) for tooltips / docs.
 */
export function formatDetectionTypeLabelWithCode(
  label: string,
  names?: ClassPublicationNames,
): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const synonym = customPublicationName(trimmed, names);
  const code = formatDetectionClassCode(trimmed);
  if (synonym) return `${code} (${synonym})`;
  const publication = canonicalLabelKey(trimmed);
  if (!publication) return code;
  return `${code} (${publication})`;
}

function legendOrderIndex(label: string): number | undefined {
  const key = canonicalLabelKey(label);
  if (!key) return undefined;
  const orderIndex = new Map(
    PUBLICATION_LABEL_ORDER.map((name, i) => [normalizeLabel(name), i]),
  );
  return orderIndex.get(normalizeLabel(key));
}

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function hslColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 58% 42%)`;
}

/** Assign a unique color to every label in the set (stable for a given label list). */
export function createLabelColorMap(labels: string[]): LabelColorMap {
  const sorted = sortLabelsForLegend([...new Set(labels)]);
  const usedColors = new Set<string>();
  const normToColor = new Map<string, string>();

  const assignColor = (norm: string, color: string) => {
    normToColor.set(norm, color);
    usedColors.add(color);
  };

  for (const label of sorted) {
    const key = canonicalLabelKey(label);
    if (!key) continue;
    const color = PUBLICATION_LABEL_COLORS[key];
    const norm = normalizeLabel(label);
    if (color && !normToColor.has(norm) && !usedColors.has(color)) {
      assignColor(norm, color);
    }
  }

  const reserveColors = [
    ...Object.values(PUBLICATION_LABEL_COLORS),
    ...EXTENDED_PALETTE,
  ];

  for (const label of sorted) {
    const norm = normalizeLabel(label);
    if (normToColor.has(norm)) continue;

    const next = reserveColors.find((c) => !usedColors.has(c));
    if (next) {
      assignColor(norm, next);
      continue;
    }

    let i = 0;
    let generated = hslColor(normToColor.size + i);
    while (usedColors.has(generated)) {
      i += 1;
      generated = hslColor(normToColor.size + i);
    }
    assignColor(norm, generated);
  }

  const map = new Map<string, string>();
  for (const label of sorted) {
    map.set(label, normToColor.get(normalizeLabel(label))!);
  }
  return map;
}

export function colorForLabel(
  label: string,
  colorMap?: LabelColorMap,
  overrides?: Readonly<Record<string, string>> | null,
): string {
  if (overrides) {
    const direct =
      overrides[label] ??
      overrides[label.toUpperCase()] ??
      Object.entries(overrides).find(
        ([k]) => k.toUpperCase() === label.toUpperCase(),
      )?.[1];
    if (typeof direct === "string" && /^#([\da-f]{3}|[\da-f]{6})$/i.test(direct.trim())) {
      const t = direct.trim();
      return t.length === 4
        ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase()
        : t.toUpperCase();
    }
  }

  if (colorMap?.has(label)) {
    return colorMap.get(label)!;
  }

  const key = canonicalLabelKey(label);
  if (key && PUBLICATION_LABEL_COLORS[key]) {
    return PUBLICATION_LABEL_COLORS[key];
  }

  return EXTENDED_PALETTE[hashLabel(label) % EXTENDED_PALETTE.length] ?? EXTENDED_PALETTE[0];
}

/**
 * Apply alpha without CSS `opacity` (avoids WebKit compositor fringe between
 * the spectrogram plot and adjacent chrome when many overlay boxes update).
 */
export function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(hex);
  if (short) {
    const r = parseInt(short[1]! + short[1]!, 16);
    const g = parseInt(short[2]! + short[2]!, 16);
    const b = parseInt(short[3]! + short[3]!, 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (full) {
    const r = parseInt(full[1]!, 16);
    const g = parseInt(full[2]!, 16);
    const b = parseInt(full[3]!, 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(
    hex,
  );
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  }
  const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(
    hex,
  );
  if (hsl) {
    return `hsla(${hsl[1]}, ${hsl[2]}%, ${hsl[3]}%, ${a})`;
  }
  return a >= 0.999 ? color : a <= 0.001 ? "transparent" : color;
}

export function sortLabelsForLegend(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const ia = legendOrderIndex(a);
    const ib = legendOrderIndex(b);
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return a.localeCompare(b);
  });
}

export function orderedLabelsFromSegments(
  segments: { label: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    if (!seen.has(seg.label)) {
      seen.add(seg.label);
      out.push(seg.label);
    }
  }
  return sortLabelsForLegend(out);
}

export function styleForSegment(
  label: string,
  source: LabelLayerSource,
  options?: {
    solo?: boolean;
    dimmed?: boolean;
    highlighted?: boolean;
    colorMap?: LabelColorMap;
  },
): LabelStyle {
  const base = colorForLabel(label, options?.colorMap);
  const dimmed = options?.dimmed ?? false;
  const solo = options?.solo ?? false;
  const highlighted = options?.highlighted ?? false;

  let opacity = dimmed ? 0.12 : solo ? 0.62 : source === "compare" ? 0.32 : 0.48;
  let strokeWidth = source === "compare" ? 1.25 : 1.75;

  if (highlighted) {
    opacity = 0.92;
    strokeWidth = 2.25;
  }

  return {
    fill: base,
    stroke: base,
    fillOpacity: opacity,
    strokeWidth,
    strokeDasharray: source === "compare" && !highlighted ? "5 3" : undefined,
  };
}

export function mergeLabelNames(
  primary: string[],
  compare: string[],
): string[] {
  return sortLabelsForLegend([
    ...new Set([...primary, ...compare]),
  ]);
}

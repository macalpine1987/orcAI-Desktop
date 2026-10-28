/** Models studio helpers. */

export function formatModelMba(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function formatScalar(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    return value.map((v) => formatScalar(v)).join("–");
  }
  return "";
}

/** Compact spectrogram rows for the model card. */
export function formatSpectrogramRows(
  spectrogram: Record<string, unknown> | null | undefined,
): Array<{ key: string; value: string }> {
  if (!spectrogram || typeof spectrogram !== "object") return [];
  const order = [
    "sampling_rate",
    "nfft",
    "n_overlap",
    "freq_range",
    "duration",
    "quantiles",
  ] as const;
  const seen = new Set<string>();
  const out: Array<{ key: string; value: string }> = [];
  for (const key of order) {
    if (!(key in spectrogram)) continue;
    const value = formatScalar(spectrogram[key]);
    if (!value) continue;
    seen.add(key);
    out.push({ key, value });
  }
  for (const [key, raw] of Object.entries(spectrogram)) {
    if (seen.has(key)) continue;
    const value = formatScalar(raw);
    if (!value) continue;
    out.push({ key, value });
  }
  return out;
}

/** Input shape / labels from model_shape.json. */
export function formatShapeRows(
  shape: Record<string, unknown> | null | undefined,
): Array<{ key: string; value: string }> {
  if (!shape || typeof shape !== "object") return [];
  const out: Array<{ key: string; value: string }> = [];
  const input = shape.input_shape;
  if (Array.isArray(input) && input.length) {
    out.push({ key: "input_shape", value: input.map((v) => formatScalar(v)).join(" × ") });
  }
  if (shape.num_labels != null) {
    const n = formatScalar(shape.num_labels);
    if (n) out.push({ key: "num_labels", value: n });
  }
  for (const [key, raw] of Object.entries(shape)) {
    if (key === "input_shape" || key === "num_labels") continue;
    const value = formatScalar(raw);
    if (!value) continue;
    out.push({ key, value });
  }
  return out;
}

export function formatModelSizeBytes(
  bytes: number | null | undefined,
  locale: string,
): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toLocaleString(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 0 ? 0 : 1,
  })} ${units[i]}`;
}

export function formatModelTrainedAt(
  iso: string | null | undefined,
  locale: string,
  builtinLabel: string,
): string {
  if (!iso) return builtinLabel;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return builtinLabel;
  try {
    return d.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function f1BarTone(f1: number | null | undefined): "ok" | "mid" | "low" {
  if (f1 == null || !Number.isFinite(f1)) return "low";
  if (f1 >= 0.7) return "ok";
  if (f1 >= 0.5) return "mid";
  return "low";
}

export function modelRowKey(m: { id: string; path: string }): string {
  return m.id || m.path;
}

/** Body only (no «name —» prefix) for the Описание panel. */
export function modelDescriptionBody(
  m: {
    id: string;
    name: string;
    kind?: string;
    description?: string;
    class_count?: number;
    calls?: string[];
  },
  detail: { description?: string; model?: Record<string, unknown> } | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const key = `models.builtinDesc.${m.id}`;
  const localized = t(key, { defaultValue: "" });
  if (localized && localized !== key) return String(localized);

  const fromDetail = detail?.description?.trim();
  if (fromDetail) return fromDetail;
  const fromModel = m.description?.trim();
  if (fromModel) return fromModel;

  if (m.kind === "trained") {
    const classes = m.class_count ?? m.calls?.length ?? 0;
    return t("models.trainedProjectDesc", {
      count: classes,
      defaultValue: `trained in this project (${classes} classes).`,
    });
  }
  return "";
}

/**
 * m15 Описание: only the row selected in the models table (name — body).
 */
export function modelOverviewParagraphs(
  selected: {
    id: string;
    name: string;
    path: string;
    kind?: string;
    description?: string;
    class_count?: number;
    calls?: string[];
  } | null,
  detail: { description?: string; model?: Record<string, unknown> } | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  if (!selected) return [];
  const body = modelDescriptionBody(selected, detail, t);
  if (!body) return [];
  return [`${selected.name} — ${body}`];
}

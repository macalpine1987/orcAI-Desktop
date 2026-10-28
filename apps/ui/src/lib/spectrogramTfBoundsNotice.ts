import type { LabelsTfBoundsMeta } from "../api/labels";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function formatTfBoundsNotice(
  meta: LabelsTfBoundsMeta | null | undefined,
  t: TFn,
): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  if (meta.skipped > 0) {
    parts.push(
      t("spectrogram.tfBounds.skipped", {
        skipped: meta.skipped,
        computed: meta.computed,
      }),
    );
  }
  if (meta.warnings.length > 0) {
    parts.push(
      t("spectrogram.tfBounds.warningDetail", {
        detail: meta.warnings[0],
      }),
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

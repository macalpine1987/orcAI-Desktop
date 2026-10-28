import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalysisPackage } from "../workspace/analysisPackages";

type Props = {
  pkg: AnalysisPackage;
};

function ReadonlyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-0.5 text-sm">
      <span className="text-foreground-muted">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

export function PredictAnalysisPackageSettingsReadonly({ pkg }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const s = pkg.settings;

  useEffect(() => {
    setOpen(false);
  }, [pkg.id]);

  const verbosityLabel = t(
    `predict.verbosityOption${s.verbosity}` as "predict.verbosityOption0",
  );

  const limits = s.callDurationLimits.trim();
  const baseDir = s.baseDirRecording.trim();

  return (
    <section className="rounded-lg border border-border/80 bg-subtle/80 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-semibold text-foreground">
          {t("predict.analysis.packageSettingsTitle")}
        </span>
        <span className="shrink-0 text-foreground-muted" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <>
          <p className="mt-2 text-[11px] text-foreground-muted">
            {t("predict.analysis.packageSettingsHint")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <ReadonlyRow label={t("predict.model")} value={s.model} />
            <ReadonlyRow
              label={t("predict.channel")}
              value={String(Math.max(1, Math.floor(s.channel) || 1))}
            />
            <ReadonlyRow
              label={t("predict.threshold")}
              value={s.threshold.toFixed(2)}
            />
            <ReadonlyRow label={t("predict.outputPath")} value={s.outputPath} />
            <ReadonlyRow
              label={t("predict.overwrite")}
              value={
                s.overwrite
                  ? t("predict.analysis.packageSettingsYes")
                  : t("predict.analysis.packageSettingsOverwriteOnRerun")
              }
            />
            <ReadonlyRow
              label={t("predict.saveProbabilities")}
              value={
                s.saveProbabilities
                  ? t("predict.analysis.packageSettingsYes")
                  : t("predict.analysis.packageSettingsNo")
              }
            />
            <ReadonlyRow
              label={t("predict.callDurationLimits")}
              value={limits || t("predict.analysis.packageSettingsNotSet")}
            />
            <ReadonlyRow label={t("predict.labelSuffix")} value={s.labelSuffix} />
            {baseDir ? (
              <ReadonlyRow
                label={t("predict.baseDirRecording")}
                value={baseDir}
              />
            ) : null}
            <ReadonlyRow label={t("predict.verbosity")} value={verbosityLabel} />
          </div>
        </>
      ) : null}
    </section>
  );
}

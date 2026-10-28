import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { pickDirectory, pickJsonFile } from "../platform/dialog";
import type { PredictSettings } from "../workspace/predictSettings";
import type { PredictQueue } from "../workspace/predictQueue";
import { defaultRecordingsDir } from "../workspace/project";
import { FieldHint } from "./FieldHint";
import { ModelParamHint } from "./predictModelHints";
import { CliKey } from "./CliKey";
import { PREDICT_CLI_KEYS } from "../lib/predictCliLine";

type Props = {
  queue: PredictQueue | null;
  fieldsDisabled: boolean;
  settings: PredictSettings;
  onPatch: (p: Partial<PredictSettings>) => void;
};

export function PredictAdvancedSettingsFields({
  queue,
  fieldsDisabled,
  settings,
  onPatch,
}: Props) {
  const { t } = useTranslation();
  const hasCsvInQueue =
    queue?.files.some((f) => f.kind === "csv_table") ?? false;
  const projectDir = queue?.projectDir ?? settings.callDurationLimitsProjectDir;

  useEffect(() => {
    if (!hasCsvInQueue || !queue) return;
    const expected = defaultRecordingsDir(queue.projectDir);
    const current = settings.baseDirRecording.trim();
    // Refresh when empty or still pointing at another project (BUG: stale -bdr).
    if (
      !current ||
      (current !== expected && !current.startsWith(queue.projectDir.replace(/[/\\]+$/, "")))
    ) {
      onPatch({ baseDirRecording: expected });
    }
  }, [hasCsvInQueue, queue?.projectDir]);

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium">
          {t("predict.callDurationLimits")}{" "}
          <CliKey flag={PREDICT_CLI_KEYS.callDurationLimits} />
          <FieldHint
            label={t("predict.callDurationLimitsHintLabel")}
            title={t("predict.help.callDurationLimits.title")}
          >
            <span className="block space-y-1.5">
              <span>{t("predict.help.callDurationLimits.what")}</span>
              <span>{t("predict.help.callDurationLimits.effect")}</span>
              <span className="block font-mono text-[10px] text-foreground/90">
                {t("predict.callDurationLimitsTooltipExample")}
              </span>
              <span>{t("predict.help.callDurationLimits.tip")}</span>
            </span>
          </FieldHint>
        </span>
        <p className="mb-2 text-[10px] text-foreground-muted">
          {t("predict.callDurationLimitsHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={settings.callDurationLimits}
            onChange={(e) =>
              onPatch({
                callDurationFilter: e.target.value.trim().length > 0,
                callDurationLimits: e.target.value,
                callDurationLimitsProjectDir: projectDir ?? undefined,
              })
            }
            placeholder={t("predict.callDurationLimitsEmpty")}
            className="min-w-0 flex-1 mat-raised px-3 py-2 font-mono text-xs"
            disabled={fieldsDisabled}
          />
          <button
            type="button"
            disabled={fieldsDisabled}
            onClick={() =>
              void pickJsonFile(t("predict.callDurationLimitsPickTitle")).then(
                (p) => {
                  if (p) {
                    onPatch({
                      callDurationFilter: true,
                      callDurationLimits: p,
                      callDurationLimitsProjectDir: projectDir ?? undefined,
                    });
                  }
                },
              )
            }
            className="mat-btn px-2 py-1 text-xs disabled:opacity-40"
          >
            {t("predict.browse")}
          </button>
          <button
            type="button"
            disabled={fieldsDisabled}
            onClick={() =>
              onPatch({
                callDurationFilter: false,
                callDurationLimits: "",
                callDurationLimitsProjectDir: projectDir ?? undefined,
              })
            }
            className="mat-btn px-2 py-1 text-xs disabled:opacity-40"
          >
            {t("predict.callDurationLimitsClear")}
          </button>
        </div>
      </label>

      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium">
          {t("predict.labelSuffix")} <CliKey flag={PREDICT_CLI_KEYS.labelSuffix} />
          <ModelParamHint id="labelSuffix" />
        </span>
        <p className="mb-2 text-[10px] text-foreground-muted">
          {t("predict.labelSuffixFieldHint")}
        </p>
        <input
          type="text"
          value={settings.labelSuffix}
          onChange={(e) => onPatch({ labelSuffix: e.target.value })}
          className="w-24 mat-raised px-3 py-2 font-mono text-xs"
          disabled={fieldsDisabled}
        />
      </label>

      {hasCsvInQueue && queue ? (
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-2 font-medium">
            {t("predict.baseDirRecording")}{" "}
            <CliKey flag={PREDICT_CLI_KEYS.baseDirRecording} />
            <ModelParamHint id="baseDirRecording" />
          </span>
          <p className="mb-2 text-[10px] text-foreground-muted">
            {t("predict.baseDirRecordingHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={settings.baseDirRecording}
              onChange={(e) => onPatch({ baseDirRecording: e.target.value })}
              className="min-w-0 flex-1 mat-raised px-3 py-2 font-mono text-xs"
              disabled={fieldsDisabled}
            />
            <button
              type="button"
              disabled={fieldsDisabled}
              onClick={() =>
                void pickDirectory(t("predict.baseDirRecordingPickTitle")).then(
                  (p) => {
                    if (p) onPatch({ baseDirRecording: p });
                  },
                )
              }
              className="mat-btn px-2 py-1 text-xs disabled:opacity-40"
            >
              {t("predict.browse")}
            </button>
          </div>
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium">
          {t("predict.verbosity")} <CliKey flag={PREDICT_CLI_KEYS.verbosity} />
          <ModelParamHint id="verbosity" />
        </span>
        <select
          value={settings.verbosity}
          onChange={(e) =>
            onPatch({
              verbosity: Number(e.target.value) as PredictSettings["verbosity"],
            })
          }
          className="w-full mat-raised px-3 py-2 text-sm"
          disabled={fieldsDisabled}
        >
          {[0, 1, 2, 3].map((v) => (
            <option key={v} value={v}>
              {t(`predict.verbosityOption${v}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

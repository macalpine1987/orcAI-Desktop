import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../api/models";
import { pickLabelOutputFile } from "../platform/dialog";
import { isTauri } from "../platform/tauri";
import { inferPredictedLabelPath } from "../lib/predictLabels";
import type { PredictSettings } from "../workspace/predictSettings";
import type { PredictQueue } from "../workspace/predictQueue";
import { ModelParamHint } from "./predictModelHints";
import { PredictAdvancedSettingsFields } from "./PredictAdvancedSettingsFields";
import { ThresholdSlider } from "./ThresholdSlider";
import { CliKey } from "./CliKey";
import { PREDICT_CLI_KEYS } from "../lib/predictCliLine";

type Props = {
  queue: PredictQueue | null;
  models: OrcaiModel[];
  settings: PredictSettings;
  fieldsDisabled: boolean;
  onPatch: (patch: Partial<PredictSettings>) => void;
};

export function PredictProfileModelParamsFields({
  queue,
  models,
  settings,
  fieldsDisabled,
  onPatch,
}: Props) {
  const { t } = useTranslation();
  const [pickerHint, setPickerHint] = useState<string | null>(null);

  const selectedModel = models.find((m) => m.id === settings.model);

  return (
    <div className="grid max-w-none gap-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          {t("predict.model")} <CliKey flag={PREDICT_CLI_KEYS.model} />
          <span className="text-foreground-muted"> / </span>
          <CliKey flag={PREDICT_CLI_KEYS.modelDir} />
        </span>
        <select
          value={settings.model}
          onChange={(e) => {
            const id = e.target.value;
            const entry = models.find((m) => m.id === id);
            onPatch({
              model: id,
              modelDir: entry?.kind === "trained" ? entry.path : undefined,
            });
          }}
          className="w-full mat-raised px-3 py-2 text-sm"
          disabled={fieldsDisabled}
        >
          {models.length === 0 ? (
            <option value="orcai-isl-v1">orcai-isl-v1</option>
          ) : (
            models.map((m) => (
              <option key={m.path} value={m.id}>
                {m.kind === "trained"
                  ? `${m.name} · ${t("predict.trainedModel")}`
                  : m.name}
              </option>
            ))
          )}
        </select>
        {selectedModel?.kind === "trained" ? (
          <p className="mt-1 break-all font-mono text-[10px] text-foreground-muted">
            {selectedModel.path}
          </p>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2 font-medium">
          {t("predict.channel")} <CliKey flag={PREDICT_CLI_KEYS.channel} />
          <ModelParamHint id="channel" />
        </span>
        <input
          type="number"
          min={1}
          value={settings.channel}
          onChange={(e) => {
            const n = Number(e.target.value);
            onPatch({
              channel: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
            });
          }}
          className="w-24 mat-raised px-3 py-2 text-sm"
          disabled={fieldsDisabled}
        />
      </label>

      <ThresholdSlider
        value={settings.threshold}
        disabled={fieldsDisabled}
        onChange={(threshold) => onPatch({ threshold })}
      />

      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          {t("predict.outputPath")} <CliKey flag={PREDICT_CLI_KEYS.outputPath} />
        </span>
        <p className="mb-2 text-[10px] text-foreground-muted">
          {t("predict.outputPathFieldHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={settings.outputPath}
            onChange={(e) => onPatch({ outputPath: e.target.value })}
            placeholder="default"
            className="min-w-0 flex-1 mat-raised px-3 py-2 font-mono text-xs"
            disabled={fieldsDisabled}
          />
          <button
            type="button"
            disabled={fieldsDisabled || !queue}
            onClick={() => {
              const activeFile = queue?.files.find(
                (f) => f.name === queue.activeFileName && f.kind === "wav",
              );
              const suggested =
                activeFile != null
                  ? inferPredictedLabelPath(
                      activeFile.path,
                      settings.channel,
                      settings.model,
                    )
                  : undefined;
              void pickLabelOutputFile(
                t("predict.outputPathPickTitle"),
                suggested,
              ).then((p) => {
                if (p) {
                  setPickerHint(null);
                  onPatch({ outputPath: p });
                } else if (!isTauri()) {
                  setPickerHint(t("predict.browserPathHint"));
                }
              });
            }}
            className="mat-btn px-2 py-1 text-xs disabled:opacity-40"
          >
            {t("predict.outputPathBrowse")}
          </button>
          <button
            type="button"
            disabled={fieldsDisabled || settings.outputPath.trim() === "default"}
            onClick={() => onPatch({ outputPath: "default" })}
            className="mat-btn px-2 py-1 text-xs disabled:opacity-40"
          >
            {t("predict.outputPathUseDefault")}
          </button>
        </div>
        {pickerHint ? (
          <p className="mt-1 text-[10px] text-foreground-muted">{pickerHint}</p>
        ) : null}
      </label>

      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.overwrite}
            onChange={(e) => onPatch({ overwrite: e.target.checked })}
            disabled={fieldsDisabled}
          />
          {t("predict.overwrite")} <CliKey flag={PREDICT_CLI_KEYS.overwrite} />
        </span>
        <ModelParamHint id="overwrite" />
      </label>

      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.saveProbabilities}
            onChange={(e) => onPatch({ saveProbabilities: e.target.checked })}
            disabled={fieldsDisabled}
          />
          {t("predict.saveProbabilities")}{" "}
          <CliKey flag={PREDICT_CLI_KEYS.saveProbabilities} />
        </span>
        <ModelParamHint id="saveProbabilities" />
      </label>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          disabled={fieldsDisabled && !settings.additionalOpen}
          onClick={() => onPatch({ additionalOpen: !settings.additionalOpen })}
          className="flex w-full items-center justify-between gap-2 mat-panel/80 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50"
          aria-expanded={settings.additionalOpen}
        >
          <span>{t("predict.tabs.more")}</span>
          <span className="text-foreground-muted" aria-hidden>
            {settings.additionalOpen ? "▾" : "▸"}
          </span>
        </button>
        {settings.additionalOpen ? (
          <div className="mt-3 rounded-lg border border-border/80 bg-surface/40 p-4">
            <p className="mb-3 text-xs leading-relaxed text-foreground-muted">
              {t("predict.tabs.moreHint")}
            </p>
            <PredictAdvancedSettingsFields
              queue={queue}
              fieldsDisabled={fieldsDisabled}
              settings={settings}
              onPatch={onPatch}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

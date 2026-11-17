import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../../api/models";
import { pickJsonFile } from "../../platform/dialog";
import { PREDICT_CLI_KEYS } from "../../lib/predictCliLine";
import type { PredictSettings } from "../../workspace/predictSettings";
import { StudioSwitch } from "./StudioSwitch";

type Props = {
  models: OrcaiModel[];
  settings: PredictSettings;
  fieldsDisabled: boolean;
  isBuiltin: boolean;
  modelCliKey: string;
  classes: string[] | null;
  selectedModel: OrcaiModel | undefined;
  cdlOn: boolean;
  projectDir: string | null | undefined;
  patch: (p: Partial<PredictSettings>) => void;
  setCdlEnabled: (on: boolean) => void;
  setAdvancedOpen: (open: boolean) => void;
  notifyHeaderError: (msg: string) => void;
};

export function PredictParamsLaunchPanel({
  models,
  settings,
  fieldsDisabled,
  isBuiltin,
  modelCliKey,
  classes,
  selectedModel,
  cdlOn,
  projectDir,
  patch,
  setCdlEnabled,
  setAdvancedOpen,
  notifyHeaderError,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="pp-col pp-col--model" aria-labelledby="pp-model-input-label">
      <h2 id="pp-model-input-label" className="pp-col-label">
        {t("predict.run.modelInputTitle")}
      </h2>

      <div className="pp-field">
        <span className="pp-label">
          {t("predict.model")}{" "}
          <span className="pp-cli-key" aria-hidden>
            {modelCliKey}
          </span>
        </span>
        <div className="pp-field-row">
          <select
            className="pp-select pp-select-model"
            value={settings.model}
            disabled={fieldsDisabled}
            onChange={(e) => {
              const id = e.target.value;
              const entry = models.find((m) => m.id === id);
              patch({
                model: id,
                modelDir: entry?.kind === "trained" ? entry.path : undefined,
              });
            }}
          >
            {models.length === 0 ? (
              <option value="orcai-isl-v1">orcai-isl-v1</option>
            ) : (
              models.map((m) => (
                <option key={m.path} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
          {isBuiltin ? (
            <span className="pp-builtin">{t("predict.run.builtinBadge")}</span>
          ) : (
            <span className="pp-builtin">{t("predict.trainedModel")}</span>
          )}
        </div>
        {classes ? (
          <p className="pp-classes">
            {t("predict.run.classCount", { count: classes.length })}:{" "}
            {classes.join(" · ")}
          </p>
        ) : selectedModel?.kind === "trained" ? (
          <p className="pp-classes text-foreground-muted">
            {t("predict.run.classesUnknown")}
          </p>
        ) : null}
      </div>

      <div className="pp-field">
        <span className="pp-label">
          {t("predict.channel")}{" "}
          <span className="pp-cli-key" aria-hidden>
            {PREDICT_CLI_KEYS.channel}
          </span>
        </span>
        <div className="pp-field-row pp-field-row--channel">
          <input
            type="number"
            min={1}
            className="pp-input pp-input-sm"
            value={settings.channel}
            disabled={fieldsDisabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              const valid = Number.isFinite(n) && n >= 1;
              patch({ channel: valid ? Math.floor(n) : 1 });
              if (!valid && e.target.value.trim() !== "") {
                notifyHeaderError(t("predict.run.channelInvalid"));
              }
            }}
          />
          <span className="pp-hint">{t("predict.run.channelHint")}</span>
          <button
            type="button"
            className="ps-btn ps-btn-sm pp-channel-advanced"
            disabled={fieldsDisabled}
            title={
              settings.outputPath.trim() &&
              settings.outputPath.trim() !== "default"
                ? `${PREDICT_CLI_KEYS.outputPath} ${settings.outputPath}`
                : `${PREDICT_CLI_KEYS.outputPath} · ${PREDICT_CLI_KEYS.verbosity} ${settings.verbosity}`
            }
            onClick={() => setAdvancedOpen(true)}
          >
            {t("predict.advancedOpen")}
          </button>
        </div>
      </div>

      <div className="pp-field">
        <span className="pp-label">{t("predict.run.thresholdTitle")}</span>
        <div className="pp-threshold">
          <div className="pp-threshold-lcd" aria-live="polite">
            <span className="pp-threshold-lcd-cap">
              {t("predict.run.thresholdLcdCap")}
            </span>
            <span className="pp-threshold-lcd-val">
              {settings.threshold.toFixed(2)}
            </span>
          </div>
          <div className="pp-threshold-slider-wrap">
            <div className="pp-threshold-scale">
              <span>0.00</span>
              <span>1.00</span>
            </div>
            <input
              type="range"
              className="pp-threshold-slider"
              min={0}
              max={1}
              step={0.01}
              value={settings.threshold}
              disabled={fieldsDisabled}
              tabIndex={fieldsDisabled ? -1 : 0}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={settings.threshold}
              aria-valuetext={settings.threshold.toFixed(2)}
              style={
                {
                  "--pp-th-pct": `${Math.round(settings.threshold * 100)}%`,
                } as CSSProperties
              }
              onChange={(e) =>
                patch({ threshold: Number(e.target.value) })
              }
              onInput={(e) =>
                patch({
                  threshold: Number(
                    (e.target as HTMLInputElement).value,
                  ),
                })
              }
              aria-label={t("predict.run.thresholdTitle")}
            />
          </div>
          <span className="pp-threshold-flag" aria-hidden>
            {PREDICT_CLI_KEYS.threshold}
          </span>
        </div>
      </div>

      <div className="pp-field">
        <span className="pp-label">
          {t("predict.labelSuffix")}{" "}
          <span className="pp-cli-key" aria-hidden>
            {PREDICT_CLI_KEYS.labelSuffix}
          </span>
        </span>
        <div className="pp-field-row">
          <input
            type="text"
            className="pp-input pp-input-sm"
            value={settings.labelSuffix}
            disabled={fieldsDisabled}
            onChange={(e) => patch({ labelSuffix: e.target.value })}
          />
          <span className="pp-hint">{t("predict.run.labelSuffixHint")}</span>
        </div>
      </div>

      <div className="pp-toggles">
        <div className="pp-toggle-row">
          <StudioSwitch
            checked={settings.saveProbabilities}
            disabled={fieldsDisabled}
            label={t("predict.run.toggleSpTitle")}
            onChange={(v) => patch({ saveProbabilities: v })}
          />
          <div className="pp-toggle-copy">
            <span className="pp-toggle-title">
              {t("predict.run.toggleSpTitle")}
            </span>
            <span className="pp-toggle-sub">
              {PREDICT_CLI_KEYS.saveProbabilities} ·{" "}
              {t("predict.run.toggleSpHint")}
            </span>
          </div>
        </div>

        <div className="pp-toggle-row">
          <StudioSwitch
            checked={settings.overwrite}
            disabled={fieldsDisabled}
            label={t("predict.run.toggleOwTitle")}
            onChange={(v) => patch({ overwrite: v })}
          />
          <div className="pp-toggle-copy">
            <span className="pp-toggle-title">
              {t("predict.run.toggleOwTitle")}
            </span>
            <span className="pp-toggle-sub">
              {PREDICT_CLI_KEYS.overwrite} · {t("predict.run.toggleOwHint")}
            </span>
          </div>
        </div>

        <div className="pp-toggle-row pp-toggle-row--cdl">
          <StudioSwitch
            checked={cdlOn}
            disabled={fieldsDisabled}
            label={t("predict.run.toggleCdlTitle")}
            onChange={setCdlEnabled}
          />
          <div className="pp-toggle-copy">
            <span className="pp-toggle-title">
              {t("predict.run.toggleCdlTitle")}
            </span>
            <span className="pp-toggle-sub">
              {PREDICT_CLI_KEYS.callDurationLimits} ·{" "}
              {cdlOn && settings.callDurationLimits.trim()
                ? settings.callDurationLimits.split(/[/\\]/).pop()
                : "call_duration_limits.json"}
            </span>
          </div>
          <div className="pp-toggle-actions">
            <button
              type="button"
              className="ps-btn ps-btn-sm"
              disabled={fieldsDisabled}
              onClick={() =>
                void pickJsonFile(
                  t("predict.callDurationLimitsPickTitle"),
                ).then((p) => {
                  if (p) {
                    patch({
                      callDurationFilter: true,
                      callDurationLimits: p,
                      callDurationLimitsProjectDir: projectDir ?? null,
                    });
                  }
                })
              }
            >
              {t("predict.run.pickJson")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

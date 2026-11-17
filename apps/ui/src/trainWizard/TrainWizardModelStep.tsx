import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../components/ToggleSwitch";
import type { SidecarCapabilities } from "../api/sidecar";
import type { ComputeDevice } from "../preferences/storage";
import {
  CALL_WEIGHT_METHODS,
  FACTORY_MODEL,
  KERAS_INITIALIZERS,
  parseWizardNumber,
} from "./defaults";
import { trainEstimateDeviceLabel } from "./trainEstimateDevice";
import type { CallWeightsMethod, TrainWizardDraft } from "./types";

type Props = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  inheritedLocked: boolean;
  projectId: string | null;
  trainEst: { hours: number; minutes: number };
  computeDevice: ComputeDevice;
  capabilities: SidecarCapabilities | null | undefined;
  onOpenSnippetCalc: () => void;
};

export function TrainWizardModelStep({
  draft,
  setDraft,
  inheritedLocked,
  projectId,
  trainEst,
  computeDevice,
  capabilities,
  onOpenSnippetCalc,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="tw-model">
      <div className="tw-form-head">
        <h2 className="tw-main-kicker">{t("wizard.step4Title")}</h2>
        <div className="tw-form-head-actions">
          <button
            type="button"
            className="tw-reset-btn"
            disabled={inheritedLocked}
            title={
              inheritedLocked
                ? t("wizard.finetuneInherited")
                : t("wizard.resetDefaultsHint")
            }
            onClick={() =>
              setDraft((d) => ({
                ...d,
                model: {
                  ...FACTORY_MODEL,
                  // Keep the name the user already chose on this step.
                  name: d.model.name.trim() || FACTORY_MODEL.name,
                },
              }))
            }
          >
            {t("wizard.resetDefaults")}
          </button>
        </div>
      </div>

      <div className="tw-param-section">
        <div className="tw-param-rows">
          <label className="tw-param-row">
            <span className="tw-param-label">{t("wizard.modelName")}</span>
            <input
              className="tw-input tw-param-input"
              value={draft.model.name}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  model: { ...d.model, name: e.target.value },
                }))
              }
            />
            <span className="tw-param-hint">{t("wizard.modelNameHint")}</span>
          </label>
          <label className="tw-param-row">
            <span className="tw-param-label">{t("wizard.architecture")}</span>
            <select
              className="tw-input tw-param-input"
              value={draft.model.architecture}
              disabled={inheritedLocked}
              title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  model: {
                    ...d.model,
                    architecture: e.target
                      .value as "ResNetLSTM" | "ResNet1DConv",
                  },
                }))
              }
            >
              <option value="ResNetLSTM">ResNetLSTM</option>
              <option value="ResNet1DConv">ResNet1DConv</option>
            </select>
            <span className="tw-param-hint">{t("wizard.architectureHint")}</span>
          </label>
        </div>
      </div>

      <div className="tw-model-grid">
        <div className="tw-param-section">
          <h3 className="tw-card-kicker">{t("wizard.networkSection")}</h3>
          <div className="tw-param-rows">
            {(
              [
                ["filters", "filters", "str"],
                ["kernel_size", "kernelSize", "num"],
                ["dropout_rate", "dropout", "num"],
                ["lstm_units", "lstmUnits", "num"],
              ] as const
            ).map(([key, label, kind]) => (
              <label key={key} className="tw-param-row">
                <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                <input
                  className="tw-input tw-param-input"
                  value={String(draft.model[key])}
                  disabled={inheritedLocked}
                  title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      model: {
                        ...d.model,
                        [key]:
                          kind === "str"
                            ? raw
                            : parseWizardNumber(
                                raw,
                                Number(d.model[key]) || 0,
                              ),
                      },
                    }));
                  }}
                />
                <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
              </label>
            ))}
            {(
              [
                ["conv_initializer", "convInitializer"],
                ["lstm_initializer", "lstmInitializer"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="tw-param-row">
                <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                <select
                  className="tw-input tw-param-input"
                  value={draft.model[key]}
                  disabled={inheritedLocked}
                  title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      model: { ...d.model, [key]: e.target.value },
                    }))
                  }
                >
                  {[
                    draft.model[key],
                    ...KERAS_INITIALIZERS.filter((x) => x !== draft.model[key]),
                  ].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="tw-param-section">
          <h3 className="tw-card-kicker">{t("wizard.trainLoopSection")}</h3>
          <div className="tw-param-rows">
            {(
              [
                ["epochs", "epochs", "num"],
                ["batch_size", "batchSize", "num"],
                ["learning_rate", "learningRate", "str"],
                ["monitor", "monitor", "str"],
              ] as const
            ).map(([key, label, kind]) => (
              <label key={key} className="tw-param-row">
                <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                <input
                  className="tw-input tw-param-input"
                  value={String(draft.model[key])}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      model: {
                        ...d.model,
                        [key]:
                          kind === "str"
                            ? raw
                            : parseWizardNumber(
                                raw,
                                Number(d.model[key]) || 0,
                              ),
                      },
                    }));
                  }}
                />
                <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="tw-param-section">
        <h3 className="tw-card-kicker">{t("wizard.stopScheduleSection")}</h3>
        <div className="tw-model-grid">
          <div className="tw-param-rows">
            {(
              [
                ["early_stopping_patience", "earlyStop", "1"],
                ["reduce_lr_patience", "reduceLrPatience", "1"],
              ] as const
            ).map(([key, label, step]) => (
              <label key={key} className="tw-param-row">
                <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                <input
                  className="tw-input tw-param-input"
                  type="number"
                  step={step}
                  value={draft.model[key]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      model: {
                        ...d.model,
                        [key]: parseWizardNumber(e.target.value, d.model[key]),
                      },
                    }))
                  }
                />
                <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
              </label>
            ))}
          </div>
          <div className="tw-param-rows">
            <label className="tw-param-row">
              <span className="tw-param-label">{t("wizard.reduceLrFactor")}</span>
              <input
                className="tw-input tw-param-input"
                type="number"
                step="0.01"
                value={draft.model.reduce_lr_factor}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    model: {
                      ...d.model,
                      reduce_lr_factor: parseWizardNumber(
                        e.target.value,
                        d.model.reduce_lr_factor,
                      ),
                    },
                  }))
                }
              />
              <span className="tw-param-hint">{t("wizard.reduceLrFactorHint")}</span>
            </label>
            <label className="tw-param-row">
              <span className="tw-param-label">{t("wizard.reduceLrMin")}</span>
              <input
                className="tw-input tw-param-input"
                value={draft.model.reduce_lr_min_learning_rate}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    model: {
                      ...d.model,
                      reduce_lr_min_learning_rate: e.target.value,
                    },
                  }))
                }
              />
              <span className="tw-param-hint">{t("wizard.reduceLrMinHint")}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="tw-param-section">
        <h3 className="tw-card-kicker">{t("wizard.samplingSection")}</h3>
        <div className="tw-model-grid">
          <div className="tw-param-rows">
            <label className="tw-param-row">
              <span className="tw-param-label">{t("wizard.classWeights")}</span>
              {/*
                Training balance knob — never inherit-lock (not network shape).
                UI value "none" serializes to JSON null (orcAI default).
              */}
              <select
                className="tw-input tw-param-input font-mono"
                value={draft.model.call_weights}
                title={t("wizard.classWeightsHint")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    model: {
                      ...d.model,
                      call_weights: e.target.value as CallWeightsMethod,
                    },
                  }))
                }
              >
                {CALL_WEIGHT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "none"
                      ? t("wizard.classWeightsNone")
                      : t(`wizard.classWeights_${m}`)}
                  </option>
                ))}
              </select>
              <span className="tw-param-hint">{t("wizard.classWeightsHint")}</span>
            </label>
            <div className="tw-param-row">
              <span className="tw-param-label">{t("wizard.shuffle")}</span>
              <span className="tw-param-control">
                <ToggleSwitch
                  checked={draft.model.shuffle}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      model: { ...d.model, shuffle: next },
                    }))
                  }
                  label={t("wizard.shuffle")}
                />
              </span>
              <span className="tw-param-hint">{t("wizard.shuffleHint")}</span>
            </div>
          </div>
          <div className="tw-param-rows">
            <label className="tw-param-row">
              <span className="tw-param-label">{t("wizard.seed")}</span>
              <input
                className="tw-input tw-param-input"
                type="number"
                value={draft.model.seed}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    model: {
                      ...d.model,
                      seed: parseWizardNumber(e.target.value, d.model.seed),
                    },
                  }))
                }
              />
              <span className="tw-param-hint">{t("wizard.seedHint")}</span>
            </label>
          </div>
        </div>
        <div className="tw-param-row tw-param-row-batches">
          <span className="tw-param-label">{t("wizard.batchesPerEpoch")}</span>
          <span className="tw-param-batches">
            <input
              className="tw-input tw-param-input"
              type="number"
              aria-label={t("wizard.nBatchTrain")}
              value={draft.model.n_batch_train}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  model: {
                    ...d.model,
                    n_batch_train: parseWizardNumber(
                      e.target.value,
                      d.model.n_batch_train,
                    ),
                  },
                }))
              }
            />
            <span className="tw-param-dash" aria-hidden>
              /
            </span>
            <input
              className="tw-input tw-param-input"
              type="number"
              aria-label={t("wizard.nBatchVal")}
              value={draft.model.n_batch_val}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  model: {
                    ...d.model,
                    n_batch_val: parseWizardNumber(
                      e.target.value,
                      d.model.n_batch_val,
                    ),
                  },
                }))
              }
            />
            <span className="tw-param-dash" aria-hidden>
              /
            </span>
            <input
              className="tw-input tw-param-input"
              type="number"
              aria-label={t("wizard.nBatchTest")}
              value={draft.model.n_batch_test}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  model: {
                    ...d.model,
                    n_batch_test: parseWizardNumber(
                      e.target.value,
                      d.model.n_batch_test,
                    ),
                  },
                }))
              }
            />
            <button
              type="button"
              className="settings-path-btn tw-calc-open"
              disabled={!projectId}
              title={t("wizard.calcOpenHint")}
              onClick={onOpenSnippetCalc}
            >
              {t("wizard.calcOpen")}
            </button>
          </span>
          <span className="tw-param-hint">{t("wizard.batchesPerEpochHint")}</span>
        </div>
      </div>

    <p className="tw-estimate is-train">
        {t("wizard.trainEstimate", {
          h: trainEst.hours,
          m: trainEst.minutes,
          device: trainEstimateDeviceLabel(
            computeDevice,
            capabilities,
            t,
          ),
        })}
      </p>
    </div>
  );
}

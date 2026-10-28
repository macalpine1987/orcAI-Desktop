import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { FACTORY_HPS } from "./defaults";
import type { HpsFields } from "./types";

type Props = {
  open: boolean;
  hps: HpsFields;
  fileRel: string;
  onClose: () => void;
  onSave: (hps: HpsFields) => void;
};

type ListKey = Exclude<
  keyof HpsFields,
  "tuner_max_epochs" | "tuner_early_stopping_patience"
>;

const LIST_FIELDS: { key: ListKey; labelKey: string; hintKey: string }[] = [
  { key: "filters_set1", labelKey: "wizard.hpsFiltersSet1", hintKey: "wizard.hpsFiltersHint" },
  { key: "filters_set2", labelKey: "wizard.hpsFiltersSet2", hintKey: "wizard.hpsFiltersHint" },
  { key: "filters_set3", labelKey: "wizard.hpsFiltersSet3", hintKey: "wizard.hpsFiltersHint" },
  { key: "lstm_units", labelKey: "wizard.hpsLstmUnits", hintKey: "wizard.hpsListHint" },
  { key: "dropout_rate", labelKey: "wizard.hpsDropout", hintKey: "wizard.hpsListHint" },
  { key: "kernel_size", labelKey: "wizard.hpsKernelSize", hintKey: "wizard.hpsListHint" },
  { key: "batch_size", labelKey: "wizard.hpsBatchSize", hintKey: "wizard.hpsListHint" },
];

export function TrainWizardHpsModal({
  open,
  hps,
  fileRel,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [local, setLocal] = useState<HpsFields>(hps);

  useEffect(() => {
    if (!open) return;
    setLocal({ ...hps });
  }, [open, hps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="tw-syn-modal tw-hps-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tw-syn-modal-head">
            <div className="tw-syn-modal-titles">
              <h2 id={titleId}>{t("wizard.hpsModalTitle")}</h2>
              <p className="tw-syn-modal-file font-mono">{fileRel}</p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          <p className="tw-syn-modal-hint">{t("wizard.hpsModalHint")}</p>

          <div className="tw-syn-modal-body tw-hps-modal-body">
            <div className="tw-param-rows">
              {LIST_FIELDS.map(({ key, labelKey, hintKey }) => (
                <label key={key} className="tw-param-row">
                  <span className="tw-param-label">{t(labelKey)}</span>
                  <input
                    className="tw-input tw-param-input"
                    value={local[key]}
                    onChange={(e) =>
                      setLocal((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                  <span className="tw-param-hint">{t(hintKey)}</span>
                </label>
              ))}
              <label className="tw-param-row">
                <span className="tw-param-label">{t("wizard.hpsTunerMaxEpochs")}</span>
                <input
                  className="tw-input tw-param-input"
                  type="number"
                  min={1}
                  value={local.tuner_max_epochs}
                  onChange={(e) =>
                    setLocal((prev) => ({
                      ...prev,
                      tuner_max_epochs: Number(e.target.value) || 1,
                    }))
                  }
                />
                <span className="tw-param-hint">{t("wizard.hpsTunerMaxEpochsHint")}</span>
              </label>
              <label className="tw-param-row">
                <span className="tw-param-label">
                  {t("wizard.hpsTunerEarlyStop")}
                </span>
                <input
                  className="tw-input tw-param-input"
                  type="number"
                  min={0}
                  value={local.tuner_early_stopping_patience}
                  onChange={(e) =>
                    setLocal((prev) => ({
                      ...prev,
                      tuner_early_stopping_patience: Number(e.target.value) || 0,
                    }))
                  }
                />
                <span className="tw-param-hint">
                  {t("wizard.hpsTunerEarlyStopHint")}
                </span>
              </label>
            </div>
          </div>

          <div className="tw-syn-modal-foot">
            <button
              type="button"
              className="tw-reset-btn"
              onClick={() => setLocal({ ...FACTORY_HPS })}
            >
              {t("wizard.hpsResetDefaults")}
            </button>
            <div className="tw-syn-modal-actions">
              <button
                type="button"
                className="settings-path-btn"
                onClick={onClose}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                onClick={() => {
                  onSave(local);
                  onClose();
                }}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

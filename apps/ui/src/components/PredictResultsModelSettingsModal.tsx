import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OrcaiModel } from "../api/models";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";
import type { PredictSettings } from "../workspace/predictSettings";

type Row = { label: string; value: string };

type Props = {
  open: boolean;
  settings: PredictSettings;
  models?: OrcaiModel[];
  onClose: () => void;
};

function SettingsSection({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h5 className="predict-results-model-settings-section">{title}</h5>
      <dl className="predict-results-model-settings-list">
        {rows.map((row) => (
          <div key={row.label} className="predict-results-model-settings-row">
            <dt>{row.label}</dt>
            <dd title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Read-only model settings overlay (mockup ModelSettingsModal). */
export function PredictResultsModelSettingsModal({
  open,
  settings,
  models = [],
  onClose,
}: Props) {
  const { t } = useTranslation();
  const modelEntry = models.find(
    (m) =>
      m.id === settings.model ||
      (settings.modelDir != null &&
        settings.modelDir !== "" &&
        m.path === settings.modelDir),
  );
  const isTrained =
    modelEntry?.kind === "trained" || Boolean(settings.modelDir?.trim());

  const mainRows = useMemo((): Row[] => {
    const yes = t("predict.results.modelSettings.yes");
    const no = t("predict.results.modelSettings.no");
    const modelDirValue = isTrained
      ? settings.modelDir?.trim() || modelEntry?.path || "—"
      : t("predict.results.modelSettings.modelDirBundled");
    return [
      {
        label: t("predict.results.modelSettings.model"),
        value: settings.model || "—",
      },
      {
        label: t("predict.results.modelSettings.type"),
        value: isTrained
          ? t("predict.results.modelSettings.typeTrained")
          : t("predict.results.modelSettings.typeBundled"),
      },
      {
        label: t("predict.results.modelSettings.modelDir"),
        value: modelDirValue,
      },
      {
        label: t("predict.results.modelSettings.channel"),
        value: String(Math.max(1, Math.floor(settings.channel) || 1)),
      },
      {
        label: t("predict.results.modelSettings.threshold"),
        value: settings.threshold.toFixed(2),
      },
      {
        label: t("predict.results.modelSettings.outputPath"),
        value: settings.outputPath.trim() || "default",
      },
      {
        label: t("predict.results.modelSettings.overwrite"),
        value: settings.overwrite ? yes : no,
      },
      {
        label: t("predict.results.modelSettings.saveProbabilities"),
        value: settings.saveProbabilities ? yes : no,
      },
    ];
  }, [isTrained, modelEntry?.path, settings, t]);

  const extraRows = useMemo((): Row[] => {
    const empty = t("predict.results.modelSettings.empty");
    const limits = settings.callDurationLimits.trim();
    const baseDir = settings.baseDirRecording.trim();
    const suffix = settings.labelSuffix.trim();
    return [
      {
        label: t("predict.results.modelSettings.callDurationLimits"),
        value: limits || empty,
      },
      {
        label: t("predict.results.modelSettings.labelSuffix"),
        value: suffix || empty,
      },
      {
        label: t("predict.results.modelSettings.baseDirRecording"),
        value: baseDir || empty,
      },
      {
        label: t("predict.results.modelSettings.verbosity"),
        value: t(`predict.verbosityOption${settings.verbosity}`),
      },
    ];
  }, [settings, t]);

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={`${PREDICT_APP_MODAL_OVERLAY_CLASS} predict-results-model-settings-overlay`}
        role="presentation"
        onClick={onClose}
      >
        <div
          className="predict-results-model-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="predict-results-model-settings-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="predict-results-model-settings-header">
            <div className="predict-results-model-settings-heading">
              <h4
                id="predict-results-model-settings-title"
                className="predict-results-model-settings-title"
              >
                {t("predict.results.modelSettings.title")}
              </h4>
              <p
                className="predict-results-model-settings-subtitle"
                title={settings.model}
              >
                {t("predict.results.modelSettings.subtitle", {
                  model: settings.model || "—",
                })}
              </p>
            </div>
            <ModalCloseButton
              aria-label={t("predict.results.modelSettings.close")}
              title={t("predict.results.modelSettings.close")}
              onClick={onClose}
            />
          </div>
          <div className="predict-results-model-settings-body">
            <SettingsSection
              title={t("predict.results.modelSettings.main")}
              rows={mainRows}
            />
            <SettingsSection
              title={t("predict.results.modelSettings.additional")}
              rows={extraRows}
            />
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

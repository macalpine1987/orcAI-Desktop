import { useTranslation } from "react-i18next";
import { shellModelDisplayLabel } from "../lib/shellMetaFrames";

type Props = {
  projectName?: string | null;
  modelId?: string | null;
  modelSettingsOpen?: boolean;
  onToggleModelSettings?: () => void;
};

/** Project / Model chrome in the app header (Projects · Predict · Pipeline). */
export function PredictProjectModelFrames({
  projectName = null,
  modelId = null,
  modelSettingsOpen = false,
  onToggleModelSettings,
}: Props) {
  const { t } = useTranslation();
  if (!projectName && !modelId) return null;
  const modelValue = shellModelDisplayLabel(modelId) ?? modelId;

  return (
    <div
      className="predict-page-meta-frames"
      role="group"
      aria-label={t("predict.metaFrames.aria")}
    >
      {projectName ? (
        <div className="predict-page-meta-frame" title={projectName}>
          <div className="predict-page-meta-text">
            <span className="predict-page-meta-label">
              {t("spectrogram.segment.projectLabel")}
            </span>
            <span className="predict-page-meta-value">{projectName}</span>
          </div>
        </div>
      ) : null}
      {modelId ? (
        <div className="predict-page-meta-frame" title={modelId}>
          <div className="predict-page-meta-text">
            <span className="predict-page-meta-label">
              {t("spectrogram.segment.modelLabel")}
            </span>
            <span className="predict-page-meta-value">{modelValue}</span>
          </div>
          {onToggleModelSettings ? (
            <button
              type="button"
              className={`predict-page-meta-action${
                modelSettingsOpen ? " is-pressed" : ""
              }`}
              title={
                modelSettingsOpen
                  ? t("spectrogram.segment.modelSettingsClose")
                  : t("spectrogram.segment.modelSettingsOpen")
              }
              aria-label={
                modelSettingsOpen
                  ? t("spectrogram.segment.modelSettingsClose")
                  : t("spectrogram.segment.modelSettingsOpen")
              }
              aria-pressed={modelSettingsOpen}
              onClick={onToggleModelSettings}
            >
              i
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

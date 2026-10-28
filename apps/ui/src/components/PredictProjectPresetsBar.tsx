import { useTranslation } from "react-i18next";
import type { ModelProfile } from "../workspace/predictModelProfiles";
import { formatProfileOptionSubtitle } from "../workspace/predictModelProfiles";

type Props = {
  profiles: ModelProfile[];
  activeProfileId: string | null;
  dirty: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  /** Inline strip next to Predict tabs (right-aligned). */
  toolbar?: boolean;
};

/** Project preset strip for Predict Parameters. */
export function PredictProjectPresetsBar({
  profiles,
  activeProfileId,
  dirty,
  disabled,
  onSelect,
  onSave,
  onSaveAs,
  toolbar = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className={
        toolbar
          ? "predict-presets-bar predict-presets-bar--toolbar"
          : "predict-presets-bar"
      }
    >
      <label className="predict-presets-field">
        <span className="predict-presets-label">
          {t("predict.run.presetLabel")}
        </span>
        <select
          className="predict-presets-select"
          disabled={disabled || profiles.length === 0}
          value={activeProfileId ?? ""}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
        >
          {profiles.length === 0 ? (
            <option value="">{t("predict.run.presetEmpty")}</option>
          ) : (
            profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {dirty && p.id === activeProfileId ? " *" : ""} —{" "}
                {formatProfileOptionSubtitle(p.settings)}
              </option>
            ))
          )}
        </select>
      </label>
      <div className="predict-presets-actions">
        <button
          type="button"
          className="predict-preset-pill"
          disabled={disabled || !activeProfileId || !dirty}
          onClick={onSave}
          title={t("predict.run.presetSaveTitle")}
        >
          {t("predict.run.presetSave")}
        </button>
        <button
          type="button"
          className="predict-preset-pill"
          disabled={disabled}
          onClick={onSaveAs}
        >
          {t("predict.run.presetSaveAs")}
        </button>
      </div>
    </div>
  );
}

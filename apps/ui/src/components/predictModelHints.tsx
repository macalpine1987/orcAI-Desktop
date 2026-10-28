import { useTranslation } from "react-i18next";
import { FieldHint } from "./FieldHint";

const MODEL_PARAM_HINT_IDS = [
  "model",
  "channel",
  "overwrite",
  "saveProbabilities",
  "labelSuffix",
  "baseDirRecording",
  "verbosity",
] as const;

export type ModelParamHintId = (typeof MODEL_PARAM_HINT_IDS)[number];

export function ModelParamHint({ id }: { id: ModelParamHintId }) {
  const { t } = useTranslation();
  const base = `predict.help.${id}`;
  return (
    <FieldHint label={t(`${base}.title`)} title={t(`${base}.title`)}>
      <span className="block space-y-1.5">
        <span>{t(`${base}.what`)}</span>
        <span>{t(`${base}.effect`)}</span>
        <span>{t(`${base}.tip`)}</span>
      </span>
    </FieldHint>
  );
}

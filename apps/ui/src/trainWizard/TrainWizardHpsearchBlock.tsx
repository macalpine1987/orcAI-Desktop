import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { SHOW_HPSEARCH_PARALLEL_UI } from "./hpsearchUi";

type Props = {
  includeHpsearch: boolean;
  hpsearchParallel: boolean;
  onIncludeChange: (next: boolean) => void;
  onParallelChange: (next: boolean) => void;
  onConfigure: () => void;
};

/** Opt-in hpsearch on wizard step 5 (preflight / launch plan). */
export function TrainWizardHpsearchBlock({
  includeHpsearch,
  hpsearchParallel,
  onIncludeChange,
  onParallelChange,
  onConfigure,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <div className="tw-param-row tw-preflight-opt">
        <span className="tw-param-label">{t("wizard.includeHpsearch")}</span>
        <span className="tw-param-control tw-hps-opt-control">
          <ToggleSwitch
            checked={includeHpsearch}
            onChange={onIncludeChange}
            label={t("wizard.includeHpsearch")}
          />
          <button
            type="button"
            className="settings-path-btn"
            disabled={!includeHpsearch}
            onClick={onConfigure}
          >
            {t("wizard.hpsConfigure")}
          </button>
        </span>
        <span className="tw-param-hint">{t("wizard.includeHpsearchHint")}</span>
      </div>
      {SHOW_HPSEARCH_PARALLEL_UI && includeHpsearch ? (
        <div className="tw-param-row tw-preflight-opt">
          <span className="tw-param-label">{t("wizard.hpsearchParallel")}</span>
          <span className="tw-param-control">
            <ToggleSwitch
              checked={hpsearchParallel}
              onChange={onParallelChange}
              label={t("wizard.hpsearchParallel")}
            />
          </span>
          <span className="tw-param-hint">{t("wizard.hpsearchParallelHint")}</span>
        </div>
      ) : null}
    </>
  );
}

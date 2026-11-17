import { useTranslation } from "react-i18next";
import type { ProjectPipeline } from "../api/projects";
import { formatBytesLocalized } from "../lib/trainPipeline";
import { formatPlanEta } from "./planCommands";
import type { ClassStatRow, TrainWizardDraft } from "./types";

type Props = {
  draft: TrainWizardDraft;
  pipeline: ProjectPipeline | null;
  selectedCalls: string[];
  annotated: number;
  rareClass: ClassStatRow | null;
  paramsOk: boolean;
  planEtaTotalMin: number;
  modelDirTaken: boolean;
  locale: "ru" | "en";
};

export function TrainWizardPreflightChecks({
  draft,
  pipeline,
  selectedCalls,
  annotated,
  rareClass,
  paramsOk,
  planEtaTotalMin,
  modelDirTaken,
  locale,
}: Props) {
  const { t } = useTranslation();

  return (
    <ul className="tw-checks">
      <li className="is-ok">
        <span className="tw-check-title">{t("wizard.checkDataTitle")}</span>
        <span className="tw-check-detail">
          {t("wizard.checkDataDetail", {
            annotated,
            classes: selectedCalls.length,
          })}
        </span>
      </li>
      <li
        className={
          pipeline?.readiness.disk.state === "off"
            ? "is-bad"
            : pipeline?.readiness.disk.state === "warn"
              ? "is-warn"
              : "is-ok"
        }
      >
        <span className="tw-check-title">{t("wizard.checkDiskTitle")}</span>
        <span className="tw-check-detail">
          {(pipeline?.readiness.disk.needed_bytes ?? 0) > 0
            ? t("wizard.checkDiskDetail", {
                need: formatBytesLocalized(
                  pipeline?.readiness.disk.needed_bytes ?? 0,
                  locale,
                ),
                free: formatBytesLocalized(
                  pipeline?.readiness.disk.free_bytes ?? 0,
                  locale,
                ),
              })
            : t("wizard.checkDiskDetailReady", {
                free: formatBytesLocalized(
                  pipeline?.readiness.disk.free_bytes ?? 0,
                  locale,
                ),
              })}
        </span>
      </li>
      <li className={paramsOk ? "is-ok" : "is-bad"}>
        <span className="tw-check-title">{t("wizard.checkParamsTitle")}</span>
        <span className="tw-check-detail">
          {paramsOk
            ? t("wizard.checkParamsDetailOk", {
                low: draft.spectro.freq_low,
                high: draft.spectro.freq_high.toLocaleString(locale),
              })
            : t("wizard.checkParamsDetailBad")}
        </span>
      </li>
      <li className={rareClass ? "is-warn" : "is-ok"}>
        <span className="tw-check-title">
          {t("wizard.checkImbalanceTitle")}
        </span>
        <span className="tw-check-detail">
          {rareClass
            ? t("wizard.checkImbalanceDetail", {
                name: rareClass.id,
                count: rareClass.count,
              })
            : t("wizard.checkImbalanceOk")}
        </span>
      </li>
      <li className="is-warn">
        <span className="tw-check-title">
          {t("wizard.checkDurationTitle")}
        </span>
        <span className="tw-check-detail">
          {t("wizard.checkDurationDetail", {
            eta: formatPlanEta(planEtaTotalMin, {
              min: t("wizard.min"),
              hour: t("wizard.hour"),
            }).replace(/^≈\s*/, ""),
          })}
        </span>
      </li>
      <li className={modelDirTaken ? "is-warn" : "is-ok"}>
        <span className="tw-check-title">
          {t("wizard.checkModelNameTitle")}
        </span>
        <span className="tw-check-detail">
          {t(
            modelDirTaken
              ? "wizard.checkModelNameDetailTaken"
              : "wizard.checkModelNameDetail",
            { path: `models/${draft.model.name}` },
          )}
        </span>
      </li>
    </ul>
  );
}

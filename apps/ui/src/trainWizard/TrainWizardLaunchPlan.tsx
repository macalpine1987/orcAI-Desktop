import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../components/ToggleSwitch";
import type { ProjectPipeline } from "../api/projects";
import { parseWizardNumber } from "./defaults";
import { formatPlanEta, type PlanCommand } from "./planCommands";
import { TrainWizardHpsearchBlock } from "./TrainWizardHpsearchBlock";
import { TrainWizardPreflightChecks } from "./TrainWizardPreflightChecks";
import type { ClassStatRow, TrainWizardDraft } from "./types";

type Props = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  inheritedLocked: boolean;
  pipeline: ProjectPipeline | null;
  selectedCalls: string[];
  annotated: number;
  rareClass: ClassStatRow | null;
  paramsOk: boolean;
  planFull: PlanCommand[];
  planEtaTotalMin: number;
  modelDirTaken: boolean;
  locale: "ru" | "en";
  onConfigureHps: () => void;
};

export function TrainWizardLaunchPlan({
  draft,
  setDraft,
  inheritedLocked,
  pipeline,
  selectedCalls,
  annotated,
  rareClass,
  paramsOk,
  planFull,
  planEtaTotalMin,
  modelDirTaken,
  locale,
  onConfigureHps,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="tw-preflight">
      <h2 className="tw-main-kicker">{t("wizard.step5Title")}</h2>

      <TrainWizardPreflightChecks
        draft={draft}
        pipeline={pipeline}
        selectedCalls={selectedCalls}
        annotated={annotated}
        rareClass={rareClass}
        paramsOk={paramsOk}
        planEtaTotalMin={planEtaTotalMin}
        modelDirTaken={modelDirTaken}
        locale={locale}
      />

      <div className="tw-plan">
        <div className="tw-plan-head">
          <h3 className="tw-card-kicker">{t("wizard.launchPlan")}</h3>
          <p className="tw-plan-caption">{t("wizard.launchPlanCaption")}</p>
        </div>
        <div className="tw-plan-flow">
          {planFull.map((c, i) => (
            <span key={c.id} className="tw-plan-node">
              {i > 0 ? (
                <span className="tw-plan-arrow" aria-hidden>
                  →
                </span>
              ) : null}
              <span className="tw-plan-chip">
                <span className="tw-plan-cmd">{c.id}</span>
                <small>
                  {formatPlanEta(c.etaMin, {
                    min: t("wizard.min"),
                    hour: t("wizard.hour"),
                  })}
                </small>
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="tw-preflight-opts">
        {!inheritedLocked ? (
            <TrainWizardHpsearchBlock
              includeHpsearch={draft.includeHpsearch}
              hpsearchParallel={draft.hpsearchParallel}
              onIncludeChange={(next) =>
                setDraft((d) => ({
                  ...d,
                  includeHpsearch: next,
                  hpsearchParallel: next ? d.hpsearchParallel : false,
                }))
              }
              onParallelChange={(next) =>
                setDraft((d) => ({ ...d, hpsearchParallel: next }))
              }
              onConfigure={onConfigureHps}
            />
          ) : null}
    <div className="tw-param-row tw-preflight-opt">
          <span className="tw-param-label">{t("wizard.testAfter")}</span>
          <span className="tw-param-control">
            <ToggleSwitch
              checked={draft.testAfterTrain}
              onChange={(next) =>
                setDraft((d) => ({
                  ...d,
                  testAfterTrain: next,
                  nUnfilteredTestSnippets: next
                    ? d.nUnfilteredTestSnippets
                    : null,
                }))
              }
              label={t("wizard.testAfter")}
            />
          </span>
          <span className="tw-param-hint">{t("wizard.testAfterHint")}</span>
        </div>
        {draft.testAfterTrain ? (
          <label className="tw-param-row tw-preflight-opt">
            <span className="tw-param-label">{t("wizard.nUnfilteredTest")}</span>
            <input
              type="number"
              className="tw-input tw-param-input"
              min={1}
              step={1}
              placeholder={t("wizard.nUnfilteredTestPlaceholder")}
              value={
                draft.nUnfilteredTestSnippets == null
                  ? ""
                  : draft.nUnfilteredTestSnippets
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                setDraft((d) => ({
                  ...d,
                  nUnfilteredTestSnippets:
                    raw === ""
                      ? null
                      : Math.max(
                          1,
                          Math.floor(
                            parseWizardNumber(
                              raw,
                              d.nUnfilteredTestSnippets ?? 1,
                            ),
                          ),
                        ),
                }));
              }}
            />
            <span className="tw-param-hint">{t("wizard.nUnfilteredTestHint")}</span>
          </label>
        ) : null}
        <label className="tw-param-row tw-preflight-opt">
          <span className="tw-param-label">{t("wizard.compression")}</span>
          <select
            className="tw-input tw-param-input"
            value={draft.compression}
            onChange={(e) =>
              setDraft((d) => ({ ...d, compression: e.target.value }))
            }
          >
            <option value="GZIP">GZIP</option>
            <option value="None">None</option>
          </select>
          <span className="tw-param-hint">{t("wizard.compressionHint")}</span>
        </label>
      </div>
    </div>
  );
}

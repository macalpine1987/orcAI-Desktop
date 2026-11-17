import clsx from "clsx";
import type { Dispatch, SetStateAction } from "react";
import type { PipelineStepState, ProjectPipeline } from "../../api/projects";
import {
  formatPipelineStamp,
  TRAIN_PIPELINE_STEP_IDS,
} from "../../lib/trainPipeline";
import {
  PipelineStatusPill,
  stepMetaPrimary,
} from "../../lib/pipelineBoardUi";
import { SHOW_HPSEARCH_PARALLEL_UI } from "../../trainWizard/hpsearchUi";

export function PipelineBoardSteps({
  board,
  locale,
  t,
  busyId,
  moreId,
  setMoreId,
  hpsearchParallel,
  setHpsearchParallel,
  wizardPlanActive,
  hpsearchBlockedByPlan,
  manualHintStepId,
  engineReady,
  cancelStep,
  openArtifact,
  runStep,
}: {
  board: ProjectPipeline;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  busyId: string | null;
  moreId: string | null;
  setMoreId: Dispatch<SetStateAction<string | null>>;
  hpsearchParallel: boolean;
  setHpsearchParallel: Dispatch<SetStateAction<boolean>>;
  wizardPlanActive: boolean;
  hpsearchBlockedByPlan: boolean;
  manualHintStepId: string | null;
  engineReady: boolean;
  cancelStep: (step: PipelineStepState) => void | Promise<void>;
  openArtifact: (step: PipelineStepState) => void | Promise<void>;
  runStep: (step: PipelineStepState, force?: boolean) => void | Promise<void>;
}) {
  return (
<div className="pp-steps">
                {board.steps
                  .slice()
                  .sort(
                    (a, b) =>
                      (TRAIN_PIPELINE_STEP_IDS as readonly string[]).indexOf(a.id) -
                      (TRAIN_PIPELINE_STEP_IDS as readonly string[]).indexOf(b.id),
                  )
                  .map((step) => {
                    const hintHere = manualHintStepId === step.id;
                    const hpsearchOutsidePlan =
                      step.id === "hpsearch" && hpsearchBlockedByPlan;
                    return (
                  <article
                    key={step.id}
                    className={clsx(
                      "pp-step",
                      hintHere && "pp-step--hint",
                      hpsearchOutsidePlan && "pp-step--outside-plan",
                    )}
                    data-status={step.status}
                  >
                    <div className="pp-step-num">{step.order}</div>
                    <div className="min-w-0">
                      <div className="pp-step-title">{t(`pipeline.steps.${step.id}`)}</div>
                      <div className="pp-step-cmd-row">
                        <div className="pp-step-cmd">
                          {step.command}
                          {step.optional ? ` · ${t("pipeline.optional")}` : ""}
                        </div>
                        {SHOW_HPSEARCH_PARALLEL_UI &&
                        step.id === "hpsearch" &&
                        !hpsearchOutsidePlan ? (
                          <label className="pp-step-opt">
                            <input
                              type="checkbox"
                              checked={hpsearchParallel}
                              disabled={wizardPlanActive}
                              onChange={(e) => setHpsearchParallel(e.target.checked)}
                            />
                            <span>{t("pipeline.hpsearchParallel")}</span>
                          </label>
                        ) : null}
                      </div>
                    </div>
                    <div className="pp-step-meta">
                      <div className="pp-step-meta-primary">{stepMetaPrimary(step, t, locale)}</div>
                      {formatPipelineStamp(step.updated_at) !== "—" || step.status === "idle" ? (
                        <div className="pp-step-meta-stamp">{formatPipelineStamp(step.updated_at)}</div>
                      ) : null}
                    </div>
                    <div className="pp-step-status">
                      <PipelineStatusPill status={step.status} />
                    </div>
                    <div className="pp-step-actions">
                      {step.status === "running" || step.status === "queued" ? (
                        <button
                          type="button"
                          className="pp-btn"
                          disabled={busyId != null}
                          onClick={() => void cancelStep(step)}
                        >
                          {t("pipeline.cancel")}
                        </button>
                      ) : step.status === "done" ? (
                        <>
                          <button type="button" className="pp-btn" onClick={() => void openArtifact(step)}>
                            {t("pipeline.open")}
                          </button>
                          <div className="pp-more">
                            <button
                              type="button"
                              className={clsx("pp-btn", hintHere && "pp-btn--hint")}
                              aria-expanded={moreId === step.id}
                              disabled={wizardPlanActive || !step.can_run || busyId != null}
                              title={
                                step.run_block === "upstream_failed"
                                  ? t("pipeline.reason.upstream_failed")
                                  : hintHere
                                    ? t("pipeline.runHint")
                                    : undefined
                              }
                              onClick={() => setMoreId(moreId === step.id ? null : step.id)}
                            >
                              {t("pipeline.more")}
                            </button>
                            {moreId === step.id && !wizardPlanActive ? (
                              <div className="pp-more-menu">
                                <button
                                  type="button"
                                  className={clsx(hintHere && "pp-btn--hint")}
                                  disabled={!engineReady || !step.can_run || busyId != null}
                                  title={
                                    step.run_block === "upstream_failed"
                                      ? t("pipeline.reason.upstream_failed")
                                      : hintHere
                                        ? t("pipeline.runHint")
                                        : undefined
                                  }
                                  onClick={() => void runStep(step, true)}
                                >
                                  {t("pipeline.rerun")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : hpsearchOutsidePlan ? (
                        <span
                          className="pp-step-waiting pp-step-outside"
                          title={t("pipeline.hpsearchOutsidePlanHint")}
                        >
                          {t("pipeline.hpsearchOutsidePlan")}
                        </span>
                      ) : wizardPlanActive ? (
                        <span className="pp-step-waiting">{t("pipeline.planWaiting")}</span>
                      ) : (
                        <button
                          type="button"
                          className={clsx("pp-btn", hintHere && "pp-btn--hint")}
                          disabled={!engineReady || !step.can_run || busyId != null}
                          title={
                            step.run_block === "upstream_failed"
                              ? t("pipeline.reason.upstream_failed")
                              : hintHere
                                ? t("pipeline.runHint")
                                : undefined
                          }
                          onClick={() => void runStep(step, step.status === "stale")}
                        >
                          {t("pipeline.run")}
                        </button>
                      )}
                    </div>
                  </article>
                    );
                  })}
              </div>
  );
}

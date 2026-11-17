import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { finetuneBaseLeaf, type FinetuneLockSnapshot } from "./finetune";
import {
  WIZARD_STEP_IDS,
  type TrainScenario,
  type TrainWizardDraft,
  type WizardStepId,
} from "./types";

type NavProps = {
  draft: TrainWizardDraft;
  inheritedLocked: boolean;
  idx: number;
  go: (step: WizardStepId) => void;
  projectName: string;
  totalRec: number;
  annotated: number;
};

/** Left rail: step list + scenario summary card. */
export function TrainWizardScenarioNav({
  draft,
  inheritedLocked,
  idx,
  go,
  projectName,
  totalRec,
  annotated,
}: NavProps) {
  const { t } = useTranslation();

  return (
    <aside className="tw-nav">
      <ol className="tw-steps">
        {WIZARD_STEP_IDS.map((id, i) => {
          const done = i < idx;
          const active = id === draft.step;
          return (
            <li key={id}>
              <button
                type="button"
                className={clsx("tw-step", active && "is-active", done && "is-done")}
                onClick={() => i <= idx && go(id)}
              >
                <span className="tw-step-mark" aria-hidden>
                  {done ? "✓" : i + 1}
                </span>
                <span className="tw-step-label">
                  <span className="tw-step-title">{t(`wizard.nav.${id}`)}</span>
                  <span className="tw-step-hint">
                    {inheritedLocked && id === "data"
                      ? t("wizard.navHint.dataFinetune")
                      : t(`wizard.navHint.${id}`)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="tw-scenario-card">
        <div className="tw-card-kicker">{t("wizard.scenarioSummary")}</div>
        <div className="tw-scenario-name">
          {inheritedLocked
            ? t("wizard.finetuneScenarioName")
            : t(`wizard.scenarios.${draft.scenario}.title`)}
        </div>
        <div
          className={clsx(
            "tw-scenario-meta",
            inheritedLocked && "is-finetune",
          )}
        >
          {inheritedLocked
            ? t("wizard.finetuneScenarioMeta", {
                base: finetuneBaseLeaf(draft.finetuneBaseModel) || "—",
              })
            : (
                <>
                  {projectName}
                  <br />
                  {t("wizard.recSummary", { total: totalRec, annotated })}
                </>
              )}
        </div>
      </div>
    </aside>
  );
}

type StepProps = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  finetuneAppliedKeyRef: MutableRefObject<string | null>;
  setFinetuneLock: (lock: FinetuneLockSnapshot | null) => void;
  setFinetuneApplyStatus: (
    status: "idle" | "loading" | "ready" | "error",
  ) => void;
  /** Re-load project parameter / annotation classes (from_scratch path). */
  onReloadFromScratch: () => void;
  onClose: () => void;
};

/** Step 1: scenario radio cards (lives inside ``tw-main``). */
export function TrainWizardScenarioStep({
  draft,
  setDraft,
  finetuneAppliedKeyRef,
  setFinetuneLock,
  setFinetuneApplyStatus,
  onReloadFromScratch,
  onClose,
}: StepProps) {
  const { t } = useTranslation();

  return (
    <div className="tw-scenario-list">
      <h2 className="tw-main-kicker">{t("wizard.step1Title")}</h2>
      <div
        className="tw-scenario-grid"
        role="radiogroup"
        aria-label={t("wizard.step1Title")}
      >
        {(
          ["from_scratch", "finetune"] as TrainScenario[]
        ).map((id) => {
          const selected = draft.scenario === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={clsx("ps-focus-card", selected && "is-selected")}
              onClick={() => {
                if (id === draft.scenario) return;
                if (id === "from_scratch" && draft.scenario === "finetune") {
                  finetuneAppliedKeyRef.current = null;
                  setFinetuneLock(null);
                  setFinetuneApplyStatus("idle");
                  setDraft((d) => ({
                    ...d,
                    scenario: id,
                    finetuneBaseModel: null,
                    includeHpsearch: false,
                  }));
                  // Re-load project parameter / annotation classes (from_scratch path).
                  onReloadFromScratch();
                  return;
                }
                if (id === "finetune") {
                  setDraft((d) => ({
                    ...d,
                    scenario: id,
                    includeHpsearch: false,
                    step: d.finetuneBaseModel ? "data" : "scenario",
                  }));
                  return;
                }
                setDraft((d) => ({ ...d, scenario: id }));
              }}
            >
              <span className="ps-focus-card-head">
                <span className="ps-radio" aria-hidden />
                {t(`wizard.scenarios.${id}.title`)}
              </span>
              <p className="ps-focus-card-hint">
                {t(`wizard.scenarios.${id}.desc`)}
              </p>
              <span className="ps-focus-card-cmd tw-scenario-cmd">
                {t(`wizard.scenarios.${id}.chain`)}
              </span>
              <span
                className={clsx(
                  "tw-scenario-limit",
                  id === "from_scratch" ? "is-ok" : "is-warn",
                )}
              >
                {t(`wizard.scenarios.${id}.limit`)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="tw-scenario-hps-note">
        {t("wizard.hpsearchViaPipeline")}{" "}
        <button
          type="button"
          className="tw-scenario-hps-link"
          onClick={() => onClose()}
        >
          {t("wizard.hpsearchOpenPipeline")}
        </button>
      </p>
    </div>
  );
}

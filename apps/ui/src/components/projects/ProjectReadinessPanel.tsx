import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { ProjectFocus, ProjectSummary } from "../../api/projects";
import {
  isFullCycleReady,
  nextStepsFromSummary,
  READINESS_CARD_KEYS,
  readinessAttentionKey,
  readinessCardDetail,
  readinessCardInactiveForFocus,
  readinessCardTone,
  type NextStep,
} from "../../lib/projectsStudio";
import {
  IconArrowRight,
  IconCheck,
  IconFilter,
  IconRefresh,
  IconSearch,
  IconTrain,
} from "./ProjectsIcons";

type Props = {
  summary: ProjectSummary | null;
  focus: ProjectFocus;
  loading: boolean;
  online: boolean;
  showNextSteps: boolean;
  onToggleNextSteps: () => void;
  onNextStep: (step: NextStep) => void;
};

function stepIcon(action: NextStep["action"]) {
  switch (action) {
    case "predict":
      return <IconSearch size={16} />;
    case "train":
      return <IconTrain size={16} />;
    case "filter":
      return <IconFilter size={16} />;
    default:
      return <IconRefresh size={16} />;
  }
}

/** m36 «Готовность данных»: five lamp cards + «Следующие шаги» + full-cycle line. */
export function ProjectReadinessPanel({
  summary,
  focus,
  loading,
  online,
  showNextSteps,
  onToggleNextSteps,
  onNextStep,
}: Props) {
  const { t } = useTranslation();
  const attention = summary ? readinessAttentionKey(summary, focus) : null;
  const steps = summary ? nextStepsFromSummary(summary, focus) : [];
  const fullCycle = summary ? isFullCycleReady(summary) : false;

  return (
    <section aria-label={t("projects.studio.readiness.title")} className="ps-readiness">
      <div className="ps-readiness-head">
        <h2 className="ps-eyebrow">{t("projects.studio.readiness.title")}</h2>
        {steps.length > 0 ? (
          <button
            type="button"
            className="ml-auto text-[11px] text-foreground-muted underline-offset-2 hover:underline"
            onClick={onToggleNextSteps}
            aria-expanded={showNextSteps}
          >
            {showNextSteps
              ? t("projects.studio.readiness.hideNext")
              : t("projects.studio.readiness.showNext")}
          </button>
        ) : null}
      </div>

      {!online ? (
        <p className="text-xs text-foreground-muted">{t("projects.studio.readiness.offline")}</p>
      ) : !summary && loading ? (
        <p className="text-xs text-foreground-muted">{t("projects.studio.readiness.loading")}</p>
      ) : summary ? (
        <ul className="ps-readiness-grid" role="list">
          {READINESS_CARD_KEYS.map((key) => {
            const inactive = readinessCardInactiveForFocus(key, focus);
            const state = summary.readiness[key];
            const tone = inactive
              ? "empty"
              : readinessCardTone(state, attention === key);
            const detail = readinessCardDetail(summary, key, focus, t);
            return (
              <li
                key={key}
                className={clsx(
                  "ps-readiness-card",
                  inactive && "is-inactive",
                  !inactive && tone === "ready" && "is-ready",
                  !inactive && tone === "attention" && "is-attention",
                )}
                data-state={inactive ? "inactive" : state}
                aria-disabled={inactive || undefined}
                title={`${t(`home.readiness.${key}`)} — ${detail}`}
              >
                <span
                  className={clsx(
                    "ps-lamp",
                    !inactive && tone === "ready" && "is-ok",
                    !inactive && tone === "attention" && "is-warn",
                  )}
                  aria-hidden
                />
                <span className="ps-readiness-copy">
                  <span className="ps-readiness-title">{t(`home.readiness.${key}`)}</span>
                  <span className="ps-readiness-detail">{detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {summary && showNextSteps && steps.length > 0 ? (
        <div className="space-y-2 pt-1">
          <h3 className="text-xs font-medium text-foreground-muted">
            {t("projects.studio.readiness.nextSteps")}
          </h3>
          <div className="ps-next-steps">
            {steps.map((step, index) => (
              <button
                key={step.action}
                type="button"
                className={clsx("ps-next-step", index === 0 && "is-guided")}
                onClick={() => onNextStep(step)}
              >
                <span className="ps-next-step-icon">{stepIcon(step.action)}</span>
                <span className="min-w-0">
                  <span className="ps-next-step-title">
                    {t(`projects.studio.nextStep.${step.action}`, { count: step.count })}
                  </span>
                  <span className="ps-next-step-cmd">{step.command}</span>
                </span>
                <span className="ps-next-step-arrow">
                  <IconArrowRight />
                </span>
              </button>
            ))}
          </div>
          {fullCycle ? (
            <p className="ps-full-cycle">
              <IconCheck />
              {t("projects.studio.readiness.fullCycleReady")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { PipelineStepStatus } from "../../api/projects";
import { homeWizardPlanFocusStepId } from "../../lib/homeWizardPlan";
import { scrollElementIntoScroller } from "../../lib/spectrogramDetections";

export type HomeWizardPlanStep = {
  id: string;
  status: PipelineStepStatus | "cancelled";
};

type Props = {
  steps: HomeWizardPlanStep[];
  /** e.g. plan · 5/7 · без hpsearch */
  foot?: string | null;
  className?: string;
};

function statusLabelKey(status: HomeWizardPlanStep["status"]): string {
  switch (status) {
    case "done":
      return "home.wizardPlanStatusDone";
    case "running":
      return "home.wizardPlanStatusRunning";
    case "queued":
    case "idle":
    case "blocked":
    case "stale":
      return "home.wizardPlanStatusQueued";
    case "error":
      return "home.wizardPlanStatusError";
    case "cancelled":
      return "home.wizardPlanStatusCancelled";
    default:
      return "home.wizardPlanStatusQueued";
  }
}

export function HomeWizardPlanRail({ steps, foot, className }: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const failed = steps.some((s) => s.status === "error");
  const running = steps.some((s) => s.status === "running");
  const focusId = homeWizardPlanFocusStepId(steps);

  useLayoutEffect(() => {
    if (!focusId) return;
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      const scroller = scrollRef.current;
      const row = rowRefs.current.get(focusId);
      if (!scroller || !row) return;
      scrollElementIntoScroller(row, scroller, 0);
    };
    reveal();
    // Second frame: flex max-height / zoom may still be settling on first paint.
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(reveal);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [focusId, steps]);

  return (
    <div
      className={clsx("home-wizard-plan-rail", className)}
      data-state={failed ? "error" : running ? "running" : "idle"}
    >
      <div className="home-wizard-plan-head">
        <p className="home-wizard-plan-title">
          {failed
            ? t("home.wizardPlanTitleStopped")
            : t("home.wizardPlanTitleRunning")}
        </p>
        <Link className="home-wizard-plan-link" to="/pipeline">
          {t("home.wizardPlanOpenPipeline")}
        </Link>
      </div>
      <div
        ref={scrollRef}
        className="home-wizard-plan-scroll"
        tabIndex={0}
        aria-label={t("home.wizardPlanScrollLabel")}
      >
        <ul className="home-wizard-plan-list">
          {steps.map((step) => {
            const tone =
              step.status === "done"
                ? "done"
                : step.status === "running"
                  ? "running"
                  : step.status === "error"
                    ? "error"
                    : "queued";
            return (
              <li
                key={step.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(step.id, node);
                  else rowRefs.current.delete(step.id);
                }}
                className={clsx("home-wizard-plan-row", `is-${tone}`)}
                data-plan-focus={step.id === focusId ? "true" : undefined}
              >
                <span
                  className={clsx("home-wizard-plan-led", `is-${tone}`)}
                  aria-hidden
                />
                <span className="home-wizard-plan-id" title={step.id}>
                  {step.id}
                </span>
                <span className="home-wizard-plan-status">
                  {t(statusLabelKey(step.status))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {foot ? <p className="home-wizard-plan-foot">{foot}</p> : null}
    </div>
  );
}

/** Demo steps for the Lab-chrome preview route (not used in production Home). */
export const HOME_WIZARD_PLAN_DEMO_STEPS: HomeWizardPlanStep[] = [
  { id: "create-spectrograms", status: "done" },
  { id: "create-label-arrays", status: "done" },
  { id: "create-snippet-table", status: "done" },
  { id: "create-tvt-snippet-tables", status: "done" },
  { id: "create-tvt-data", status: "done" },
  { id: "train", status: "running" },
  { id: "test", status: "queued" },
];

import type { PipelineActivePlan, ProjectPipeline } from "../api/projects";
import type { HomeWizardPlanStep } from "../pages/home/HomeWizardPlanRail";
import { TRAIN_PIPELINE_STEP_IDS } from "./trainPipeline";

export type HomeWizardPlanView = {
  planId: string;
  steps: HomeWizardPlanStep[];
  done: number;
  total: number;
  includesHpsearch: boolean;
};

/**
 * Map board ``active_plan`` + step statuses into the Home plan rail.
 * Returns null when there is no wizard plan (manual pipeline runs stay off Home).
 */
export function homeWizardPlanFromBoard(
  board: ProjectPipeline | null | undefined,
): HomeWizardPlanView | null {
  const plan = board?.active_plan ?? null;
  if (!plan?.plan_id) return null;

  const commandIds = resolvePlanCommandIds(plan);
  if (commandIds.length === 0) return null;

  const byId = new Map((board?.steps ?? []).map((s) => [s.id, s]));
  const steps: HomeWizardPlanStep[] = commandIds.map((id) => {
    const row = byId.get(id);
    const status = row?.status ?? "queued";
    return {
      id,
      status,
    };
  });

  const done = steps.filter((s) => s.status === "done").length;
  return {
    planId: plan.plan_id,
    steps,
    done,
    total: steps.length,
    includesHpsearch: Boolean(plan.includes_hpsearch),
  };
}

function resolvePlanCommandIds(plan: PipelineActivePlan): string[] {
  if (Array.isArray(plan.commands) && plan.commands.length > 0) {
    const allowed = new Set<string>(TRAIN_PIPELINE_STEP_IDS);
    const seen = new Set<string>();
    for (const raw of plan.commands) {
      const id = String(raw ?? "").trim();
      if (!id || !allowed.has(id)) continue;
      seen.add(id);
    }
    // Always board order — sidecar may list jobs newest-first.
    return TRAIN_PIPELINE_STEP_IDS.filter((id) => seen.has(id));
  }
  return TRAIN_PIPELINE_STEP_IDS.filter((id) => {
    if (id === "hpsearch") return Boolean(plan.includes_hpsearch);
    return true;
  });
}

/** True while the wizard plan still has work in flight. */
export function homeWizardPlanIsBusy(plan: PipelineActivePlan | null | undefined): boolean {
  if (!plan?.plan_id) return false;
  return (plan.queued ?? 0) > 0 || (plan.running ?? 0) > 0;
}

/**
 * Step the Home plan rail should keep in view: running first, else first error.
 */
export function homeWizardPlanFocusStepId(
  steps: HomeWizardPlanStep[] | null | undefined,
): string | null {
  if (!steps?.length) return null;
  const running = steps.find((s) => s.status === "running");
  if (running) return running.id;
  const failed = steps.find((s) => s.status === "error");
  return failed?.id ?? null;
}

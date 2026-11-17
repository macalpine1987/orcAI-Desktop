import type { TrainMonitorPhase } from "../api/projects";

type StepLike = { id: string; status: string };

/**
 * Monitor entry on the pipeline toolbar.
 * Disabled while earlier plan steps run (train may already be pending).
 * Enabled once train is the active/next job, is running, or a snapshot remains
 * (done / error / cancelled / history).
 */
export function isTrainMonitorEntryEnabled(opts: {
  phase: TrainMonitorPhase | null | undefined;
  steps: readonly StepLike[] | null | undefined;
}): boolean {
  const { phase, steps } = opts;
  if (
    phase === "running" ||
    phase === "done" ||
    phase === "error" ||
    phase === "cancelled"
  ) {
    return true;
  }
  if (!steps?.length) return false;
  const trainIdx = steps.findIndex((s) => s.id === "train");
  if (trainIdx < 0) return false;
  const train = steps[trainIdx]!;
  if (
    train.status === "running" ||
    train.status === "done" ||
    train.status === "error"
  ) {
    return true;
  }
  if (train.status === "queued") {
    return !steps
      .slice(0, trainIdx)
      .some((s) => s.status === "running" || s.status === "queued");
  }
  return false;
}

/** True only while the train job itself is running (not queued / done / idle). */
export function isTrainMonitorLive(opts: {
  phase: TrainMonitorPhase | null | undefined;
  steps: readonly StepLike[] | null | undefined;
}): boolean {
  if (opts.phase === "running") return true;
  return Boolean(
    opts.steps?.some((s) => s.id === "train" && s.status === "running"),
  );
}

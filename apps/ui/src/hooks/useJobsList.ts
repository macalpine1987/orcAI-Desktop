import { useMemo, useState } from "react";
import {
  useJobsListContext,
  useJobsListOptional,
} from "../jobs/JobsListContext";
import { filterJobs, type JobFilter } from "../lib/jobFormat";

type UseJobsListOptions = {
  /** When set, only jobs for this project dir; omit for full history. */
  projectDir?: string | null;
  /** @deprecated polling interval is owned by JobsListProvider */
  pollMs?: number;
};

/**
 * Jobs list with local filter state. Requires JobsListProvider for the default
 * full-history queue; falls back to context when projectDir matches provider.
 */
export function useJobsList(options: UseJobsListOptions = {}) {
  const { projectDir = null } = options;
  const ctx = useJobsListOptional();
  const [filter, setFilter] = useState<JobFilter>("all");

  if (!ctx || ctx.projectDir !== projectDir) {
    throw new Error(
      "useJobsList requires JobsListProvider with matching projectDir",
    );
  }

  const filtered = useMemo(
    () => filterJobs(ctx.jobs, filter),
    [ctx.jobs, filter],
  );

  return {
    ...ctx,
    filtered,
    filter,
    setFilter,
  };
}

/** Direct access to shared jobs queue (no filter). */
export { useJobsListContext };

import { useMemo, useState } from "react";
import {
  useJobsListContext,
  useJobsListOptional,
} from "../jobs/JobsListContext";
import { filterJobs, type JobFilter } from "../lib/jobFormat";

type UseJobsListOptions = {
  /** Override the provider scope. Omit to use the active project. */
  projectDir?: string | null;
  /** @deprecated polling interval is owned by JobsListProvider */
  pollMs?: number;
};

/** Jobs list with local status filter. The provider scope is the active project. */
export function useJobsList(options: UseJobsListOptions = {}) {
  const ctx = useJobsListOptional();
  const projectDir =
    options.projectDir !== undefined ? options.projectDir : (ctx?.projectDir ?? null);
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

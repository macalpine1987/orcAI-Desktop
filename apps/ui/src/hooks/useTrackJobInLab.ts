import { useCallback } from "react";
import type { JobRecord } from "../api/jobs";
import { useJobsListOptional } from "../jobs/JobsListContext";

/** Register a new orcAI job in the shared jobs queue; dock follows via pickActiveJob. */
export function useTrackJobInLab() {
  const jobsList = useJobsListOptional();
  return useCallback(
    (job: JobRecord) => {
      jobsList?.upsertJob(job);
    },
    [jobsList],
  );
}

import { useEffect } from "react";
import { fetchJob, type JobRecord } from "../api/jobs";

export function useJobPoller(
  job: JobRecord | null,
  onUpdate: (job: JobRecord) => void,
  intervalMs = 1500,
) {
  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;

  useEffect(() => {
    if (!jobId) return;
    if (
      jobStatus === "completed" ||
      jobStatus === "failed" ||
      jobStatus === "cancelled"
    ) {
      return;
    }
    const id = window.setInterval(() => {
      void fetchJob(jobId)
        .then(onUpdate)
        .catch(() => undefined);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [jobId, jobStatus, onUpdate, intervalMs]);
}

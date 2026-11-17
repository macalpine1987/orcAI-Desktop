import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { fetchJob, type JobRecord } from "../api/jobs";
import { useSaveNotice } from "../ui/saveNotice";

export function useJobPoller(
  job: JobRecord | null,
  onUpdate: (job: JobRecord) => void,
  intervalMs = 1500,
) {
  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;
  const { t } = useTranslation();
  const { notifyHeaderError } = useSaveNotice();
  const failCountRef = useRef(0);
  const notifiedRef = useRef(false);

  useEffect(() => {
    failCountRef.current = 0;
    notifiedRef.current = false;
  }, [jobId]);

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
        .then((next) => {
          failCountRef.current = 0;
          onUpdate(next);
        })
        .catch(() => {
          failCountRef.current += 1;
          // First failure or every 8th thereafter — avoid spamming the header.
          if (!notifiedRef.current || failCountRef.current % 8 === 0) {
            notifiedRef.current = true;
            notifyHeaderError(t("common.jobPollFailed"));
          }
        });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [jobId, jobStatus, onUpdate, intervalMs, notifyHeaderError, t]);
}

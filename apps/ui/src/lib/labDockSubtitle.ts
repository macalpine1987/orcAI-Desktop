import type { TFunction } from "i18next";
import type { JobRecord } from "../api/jobs";
import type { LabDockTab } from "../lab/LabJobContext";
import { jobCommandLabel } from "./jobCommandLabel";
import { jobProgressPercent, jobStatusI18nKey } from "./jobFormat";

/** Tab-bar subtitle (m16 log / m26 errors / m27 command). */
export function dockTabSubtitle(
  tab: LabDockTab,
  t: TFunction,
  job: JobRecord | null | undefined,
): string | null {
  if (!job) return null;
  const cmd = jobCommandLabel(job.command, t);
  if (tab === "log" && job.status === "running") {
    const pct = jobProgressPercent(job);
    if (pct != null) {
      return t("lab.tabSubtitle.runningWithPct", { command: cmd, pct });
    }
    return t("lab.tabSubtitle.running", { command: cmd });
  }
  if (tab === "command") {
    if (job.status === "running") {
      return t("lab.tabSubtitle.running", { command: cmd });
    }
    if (job.status === "failed") {
      return t("lab.tabSubtitle.failed", { command: cmd });
    }
    return `${cmd} · ${t(jobStatusI18nKey(job.status))}`;
  }
  if (tab === "errors" && job.status === "failed") {
    return t("lab.tabSubtitle.failed", { command: cmd });
  }
  return null;
}

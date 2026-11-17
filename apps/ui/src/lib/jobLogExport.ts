import type { JobRecord } from "../api/jobs";
import { isTauri } from "../platform/tauri";
import { writeTextFileAbsolute } from "../platform/shell";
import { downloadTextFile } from "./downloadBlob";

export function jobLogText(job: JobRecord, lines?: string[]): string {
  const body = lines ?? job.log;
  return body.join("\n");
}

export function jobLogDefaultName(job: JobRecord): string {
  return `orcai-job-${job.command}-${job.id.slice(0, 8)}.log`;
}

/** Save job log via native dialog (Tauri) or browser download (dev). */
export async function exportJobLogToFile(
  job: JobRecord,
  lines?: string[],
): Promise<boolean> {
  const text = jobLogText(job, lines);
  const defaultName = jobLogDefaultName(job);

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({
      title: defaultName,
      defaultPath: defaultName,
      filters: [{ name: "Log file", extensions: ["log", "txt"] }],
    });
    if (!dest) return false;
    return writeTextFileAbsolute(dest, text);
  }

  try {
    downloadTextFile(text, defaultName);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

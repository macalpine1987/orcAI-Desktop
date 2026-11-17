import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchProjectRecordingTable } from "../api/projects";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";

export type PredictRecordingTableRow = {
  recording: string;
  channel: number | null;
};

type Options = {
  projectId: string | null | undefined;
  online: boolean;
  notifyHeaderError: (message: string) => void;
};

/**
 * Loads the active project's recording_table rows (recording + channel) for
 * predict channel resolution. Surfaces fetch failures as page + header errors.
 */
export function usePredictRecordingTable({
  projectId,
  online,
  notifyHeaderError,
}: Options): {
  recordingTableRows: PredictRecordingTableRow[];
  recordingTableError: string | null;
} {
  const { t } = useTranslation();
  const [recordingTableRows, setRecordingTableRows] = useState<
    PredictRecordingTableRow[]
  >([]);
  const [recordingTableError, setRecordingTableError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!projectId || !online) {
      setRecordingTableRows([]);
      setRecordingTableError(null);
      return;
    }
    let cancelled = false;
    void fetchProjectRecordingTable(projectId)
      .then((table) => {
        if (cancelled) return;
        setRecordingTableError(null);
        setRecordingTableRows(
          table.rows.map((r) => ({
            recording: r.recording,
            channel: r.channel,
          })),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setRecordingTableRows([]);
        const msg = formatUserFacingErrorRequired(
          err instanceof Error ? err : t("predict.run.recordingTableLoadFailed"),
          t,
        );
        setRecordingTableError(msg);
        notifyHeaderError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, online, notifyHeaderError, t]);

  return { recordingTableRows, recordingTableError };
}

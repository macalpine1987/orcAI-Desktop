import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  fetchResultsSummary,
  type ResultsSource,
  type ResultsSummaryResponse,
  type ResultsSummaryRow,
} from "../api/results";
import { writeTextFile } from "../api/filterPreview";
import { PageHelpButton } from "../components/PageHelpButton";
import { ResultsStudio } from "../components/ResultsStudio";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import { joinFsPath } from "../lib/joinFsPath";
import { useClassPublicationNames } from "../hooks/useClassPublicationNames";
import { formatDetectionTypeLabel } from "../lib/labelColors";
import {
  groupRowsByRecording,
  rowsToAudacityText,
  rowsToCsv,
  suggestedAudacityName,
} from "../lib/resultsStudio";
import { pickCsvOutputFile, pickDirectory } from "../platform/dialog";
import { isTauri } from "../platform/tauri";
import { useSaveNotice } from "../ui/saveNotice";
import { saveWorkspace } from "../workspace/storage";
import { downloadTextFile } from "../lib/downloadBlob";
import { useLabSectionActive } from "../layout/LabSectionActiveContext";
import {
  resultsSnapshotIsFresh,
  type ResultsSnapshotEntry,
} from "../lib/resultsSummaryCache";

const resultsSnapshots = new Map<string, ResultsSnapshotEntry>();
const RESULTS_SNAPSHOT_CACHE_MAX = 16;
/** Cap cached row arrays so LRU does not retain unbounded detection lists. */
const RESULTS_SNAPSHOT_ROWS_MAX = 5_000;

function resultsSnapshotKey(projectDir: string, source: ResultsSource): string {
  return `${projectDir}\0${source}`;
}

/**
 * Keep KPIs/meta from the full summary response; trim `rows` to a display/cache
 * cap so React does not retain oversized detection lists. Sidecar already soft-
 * caps rows near this size; KPIs come from aggregate fields on `res`.
 */
function slimResultsSnapshotForCache(
  res: ResultsSummaryResponse,
): ResultsSummaryResponse {
  if (res.rows.length <= RESULTS_SNAPSHOT_ROWS_MAX) return res;
  return {
    ...res,
    rows: res.rows.slice(0, RESULTS_SNAPSHOT_ROWS_MAX),
    truncated: true,
  };
}

function rememberResultsSnapshot(
  key: string,
  res: ResultsSummaryResponse,
): void {
  const cached = slimResultsSnapshotForCache(res);
  if (resultsSnapshots.has(key)) resultsSnapshots.delete(key);
  resultsSnapshots.set(key, { res: cached, fetchedAt: Date.now() });
  while (resultsSnapshots.size > RESULTS_SNAPSHOT_CACHE_MAX) {
    const oldest = resultsSnapshots.keys().next().value;
    if (oldest == null || oldest === key) break;
    resultsSnapshots.delete(oldest);
  }
}

/** Vitest: drop module TTL cache between cases. */
export function clearResultsSnapshotsForTests(): void {
  resultsSnapshots.clear();
}

export function ResultsPage() {
  const { t } = useTranslation();
  const publicationNames = useClassPublicationNames();
  const navigate = useNavigate();
  const { notifySaved } = useSaveNotice();
  const { engineReady, online } = useSidecarStatus();
  const workspace = useWorkspace();
  const sectionActive = useLabSectionActive();

  const [source, setSource] = useState<ResultsSource>("predicted");
  const [summary, setSummary] = useState<ResultsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orcaiReady = engineReady;
  const projectDir = workspace.projectDir;

  useEffect(() => {
    if (!sectionActive) return;
    if (!orcaiReady || !projectDir) {
      setSummary(null);
      setLoading(false);
      return;
    }
    const key = resultsSnapshotKey(projectDir, source);
    const entry = resultsSnapshots.get(key);
    const cached = entry?.res ?? null;
    let cancelled = false;
    if (cached) {
      setSummary(cached);
      setLoading(false);
      setError(null);
    } else {
      setSummary(null);
      setLoading(true);
      setError(null);
    }
    // Fresh snapshot within TTL → skip network on revisit.
    if (resultsSnapshotIsFresh(entry)) {
      return () => {
        cancelled = true;
      };
    }
    void fetchResultsSummary({ projectDir, source })
      .then((res) => {
        const slim = slimResultsSnapshotForCache(res);
        rememberResultsSnapshot(key, slim);
        if (!cancelled) {
          setSummary(slim);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (!cached) setSummary(null);
          setError(formatUserFacingErrorRequired(err, t));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionActive, orcaiReady, projectDir, source, t]);

  const onOpenDetection = useCallback(
    (row: ResultsSummaryRow) => {
      saveWorkspace({
        lastLabelPath: row.label_path,
        ...(row.wav_path ? { lastWavPath: row.wav_path } : {}),
      });
      navigate("/predict", {
        state: {
          tab: "results",
          labelPath: row.label_path,
          ...(row.wav_path ? { wavPath: row.wav_path } : {}),
          focusStartSec: row.start_sec,
          focusEndSec: row.stop_sec,
          focusLabel: row.label,
        },
      });
    },
    [navigate],
  );

  const onExportCsv = useCallback(
    async (rows: ResultsSummaryRow[]) => {
      const csv = rowsToCsv(rows, (label) =>
        formatDetectionTypeLabel(label, publicationNames),
      );
      setExportBusy(true);
      setError(null);
      try {
        if (isTauri()) {
          const path = await pickCsvOutputFile(
            t("results.exportCsvTitle"),
            projectDir ? joinFsPath(projectDir, "detections.csv") : "detections.csv",
          );
          if (!path) return;
          await writeTextFile(path, csv);
          const name = path.split(/[/\\]/).pop() || "detections.csv";
          notifySaved(t("results.exportCsvDone", { name }));
          return;
        }
        downloadTextFile(csv, "detections.csv", "text/csv;charset=utf-8");
        notifySaved(t("results.exportCsvDone", { name: "detections.csv" }));
      } catch (err) {
        setError(formatUserFacingErrorRequired(err, t));
      } finally {
        setExportBusy(false);
      }
    },
    [notifySaved, projectDir, publicationNames, t],
  );

  const onExportAudacity = useCallback(
    async (rows: ResultsSummaryRow[]) => {
      setExportBusy(true);
      setError(null);
      try {
        const grouped = groupRowsByRecording(rows);
        if (isTauri()) {
          const dir = await pickDirectory(t("results.exportAudacityTitle"));
          if (!dir) return;
          for (const [, group] of grouped) {
            const text = rowsToAudacityText(group);
            const sample = group[0];
            const out = joinFsPath(
              dir,
              suggestedAudacityName(sample?.recording ?? "labels", sample?.kind, sample?.model),
            );
            await writeTextFile(out, text);
          }
          notifySaved(
            t("results.exportAudacityDone", { count: grouped.size }),
          );
          return;
        }
        for (const [, group] of grouped) {
          const sample = group[0];
          downloadTextFile(
            rowsToAudacityText(group),
            suggestedAudacityName(sample?.recording ?? "labels", sample?.kind, sample?.model),
            "text/plain;charset=utf-8",
          );
        }
        notifySaved(t("results.exportAudacityDone", { count: grouped.size }));
      } catch (err) {
        setError(formatUserFacingErrorRequired(err, t));
      } finally {
        setExportBusy(false);
      }
    },
    [notifySaved, t],
  );

  return (
    <div className="results-page">
      <div className="studio-panel results-work-panel">
        <div className="results-page-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.results.title")}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-foreground-muted">
              {t("pages.results.description")}
            </p>
          </div>
          <PageHelpButton />
        </div>

        {!online ? (
          <p className="results-page-notice">{t("predict.sidecarRequired")}</p>
        ) : !engineReady ? (
          <p className="results-page-notice">{t("projects.engineRequired")}</p>
        ) : !projectDir ? (
          <p className="results-page-notice">{t("results.needProject")}</p>
        ) : null}
        {error && <p className="results-page-notice font-mono text-xs">{error}</p>}
        {loading && <p className="results-page-notice">{t("common.loading")}</p>}

        {summary &&
        summary.source === source &&
        orcaiReady &&
        projectDir ? (
          <ResultsStudio
            data={summary}
            source={source}
            onSourceChange={setSource}
            busy={loading}
            exportBusy={exportBusy}
            onExportCsv={(rows) => void onExportCsv(rows)}
            onExportAudacity={(rows) => void onExportAudacity(rows)}
            onOpenDetection={onOpenDetection}
          />
        ) : null}
      </div>
    </div>
  );
}

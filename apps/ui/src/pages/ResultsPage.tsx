import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

function downloadTextFile(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResultsPage() {
  const { t } = useTranslation();
  const publicationNames = useClassPublicationNames();
  const navigate = useNavigate();
  const { notifySaved } = useSaveNotice();
  const { engineReady, online } = useSidecarStatus();
  const workspace = useWorkspace();

  const [source, setSource] = useState<ResultsSource>("predicted");
  const [summary, setSummary] = useState<ResultsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orcaiReady = engineReady;
  const projectDir = workspace.projectDir;

  useEffect(() => {
    if (!orcaiReady || !projectDir) {
      setSummary(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setSummary(null);
    setLoading(true);
    setError(null);
    void fetchResultsSummary({ projectDir, source })
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setSummary(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orcaiReady, projectDir, source]);

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
          notifySaved();
          return;
        }
        downloadTextFile(csv, "detections.csv", "text/csv;charset=utf-8");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
          notifySaved();
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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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

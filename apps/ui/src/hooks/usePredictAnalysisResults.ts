import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import { exportPackageFilesToAudacity } from "../lib/exportAnalysisAudacity";
import {
  defaultAnalysisLabelKind,
  filteredLabelPathForQueueFile,
  originalLabelPathForQueueFile,
  resolveAnalysisLabelPath,
  type AnalysisLabelKind,
} from "../lib/predictQueueUi";
import { basename } from "../platform/dialog";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";

type Options = {
  t: TFunction;
  queue: PredictQueue | null;
  active: PredictQueueFile | null | undefined;
  activeChannel: number;
  modelId: string;
  modelLabelName?: string;
  predictChannel: number;
  orcaiParameter: string | null;
  navWavPath?: string;
  navLabelPath?: string;
  notifySaved: (message: string) => void;
  setError: (message: string | null) => void;
};

export function usePredictAnalysisResults({
  t,
  queue,
  active,
  activeChannel,
  modelId,
  modelLabelName,
  predictChannel,
  orcaiParameter,
  navWavPath,
  navLabelPath,
  notifySaved,
  setError,
}: Options) {
  const [exportingResults, setExportingResults] = useState(false);
  const [exportAudacityOpen, setExportAudacityOpen] = useState(false);
  const [resultsDetectionCount, setResultsDetectionCount] = useState<
    number | null
  >(null);
  const [spectrogramLabelOverride, setSpectrogramLabelOverride] = useState<
    string | null
  >(null);
  const [analysisLabelKind, setAnalysisLabelKind] =
    useState<AnalysisLabelKind>("filtered");
  const [analysisFocus, setAnalysisFocus] = useState<DetectionFocusNav | null>(
    null,
  );

  useEffect(() => {
    setAnalysisLabelKind(defaultAnalysisLabelKind(active));
  }, [active?.name, Boolean(active?.filteredPath?.trim())]);

  const resultsSpectrogramResolvedLabel =
    spectrogramLabelOverride ??
    (active
      ? (resolveAnalysisLabelPath(
          active,
          analysisLabelKind,
          activeChannel,
          modelId,
          modelLabelName,
        ) ??
          (navWavPath === active.path ? navLabelPath : undefined) ??
          "")
      : "");

  const analysisLabelSource =
    active && active.kind === "wav"
      ? {
          kind: analysisLabelKind,
          originalAvailable: Boolean(
            originalLabelPathForQueueFile(
              active,
              activeChannel,
              modelId,
              modelLabelName,
            ),
          ),
          filteredAvailable: Boolean(filteredLabelPathForQueueFile(active)),
          fileName: resultsSpectrogramResolvedLabel
            ? basename(resultsSpectrogramResolvedLabel)
            : "",
          onChange: (kind: AnalysisLabelKind) => {
            setSpectrogramLabelOverride(null);
            setAnalysisLabelKind(kind);
          },
        }
      : null;

  const onResultsDetectionTotalChange = useCallback((total: number | null) => {
    setResultsDetectionCount(total);
  }, []);

  useEffect(() => {
    setResultsDetectionCount(null);
  }, [active?.name, resultsSpectrogramResolvedLabel]);

  const resultsExportableFiles = useMemo(
    () =>
      queue?.files.filter(
        (f) =>
          f.kind === "wav" && (f.status === "done" || f.status === "filtered"),
      ) ?? [],
    [queue],
  );

  const resultsDoneFileCount = resultsExportableFiles.length;

  const runAudacityExport = useCallback(
    (selectedNames: string[]) => {
      if (!queue || exportingResults) return;
      const names = new Set(selectedNames);
      if (names.size === 0) {
        setError(t("predict.analysis.toolbar.exportNothing"));
        setExportAudacityOpen(false);
        return;
      }
      setExportAudacityOpen(false);
      setExportingResults(true);
      setError(null);
      void exportPackageFilesToAudacity({
        files: queue.files,
        selectedNames: names,
        channel: predictChannel,
        modelId,
        modelLabelName,
        orcaiParameter,
        directoryTitle: t("predict.results.exportPickFolder"),
      })
        .then((result) => {
          if (result.cancelled) return;
          if (result.exported > 0) {
            notifySaved(
              t("predict.analysis.toolbar.exportDone", {
                exported: result.exported,
                skipped: result.skipped + result.empty,
              }),
            );
          }
          if (result.errors.length > 0) {
            setError(
              t("predict.analysis.toolbar.exportPartialError", {
                count: result.errors.length,
                first: result.errors[0]?.fileName ?? "",
              }),
            );
          } else if (
            result.exported === 0 &&
            (result.skipped > 0 || result.empty > 0)
          ) {
            setError(
              result.empty > 0
                ? t("predict.analysis.toolbar.exportEmpty")
                : t("predict.analysis.toolbar.exportNothing"),
            );
          }
        })
        .catch((err) => {
          setError(formatUserFacingErrorRequired(err, t));
        })
        .finally(() => {
          setExportingResults(false);
        });
    },
    [
      exportingResults,
      modelId,
      modelLabelName,
      notifySaved,
      orcaiParameter,
      predictChannel,
      queue,
      setError,
      t,
    ],
  );

  const resultsTabBadgeCount =
    resultsDetectionCount != null && resultsDetectionCount > 0
      ? resultsDetectionCount
      : null;

  return {
    exportingResults,
    exportAudacityOpen,
    setExportAudacityOpen,
    resultsDetectionCount,
    spectrogramLabelOverride,
    setSpectrogramLabelOverride,
    analysisLabelKind,
    setAnalysisLabelKind,
    analysisFocus,
    setAnalysisFocus,
    resultsSpectrogramResolvedLabel,
    analysisLabelSource,
    onResultsDetectionTotalChange,
    resultsExportableFiles,
    resultsDoneFileCount,
    runAudacityExport,
    resultsTabBadgeCount,
  };
}

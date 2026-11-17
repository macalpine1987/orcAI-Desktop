import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveNotice } from "../ui/saveNotice";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  fetchFilterDefaults,
  fetchFilterPreview,
  readTextFile,
  writeTextFile,
  type FilterPreviewResult,
} from "../api/filterPreview";
import { pathExists } from "../api/fs";
import { pickJsonFile, pickJsonOutputFile, basename } from "../platform/dialog";
import {
  classesUsingDefaultLimit,
  collapseNoOpClassLimits,
  durationHistogram,
  durationsForSelectedLimit,
  filterTableClassKeys,
  resolveFilterJobOutputPath,
  inputToBound,
  isDurationPairInverted,
  isNoOpDurationLimits,
  limitsHaveInvertedPairs,
  ORCAI_DEFAULT_DURATION_LIMITS,
  ORCAI_V1_PUBLICATION_LIMITS,
  parseLimitsJson,
  publicationExampleFitsClasses,
  serializeLimitsJson,
  type CallDurationLimits,
  type DurationBound,
} from "../lib/callDurationLimits";
import { filterNeedsOverwrite } from "../lib/predictBatch";
import { buildFilterCliLine } from "../lib/filterCliLine";
import { copyText } from "../lib/jobLogExport";
import type { FilterSettings } from "../workspace/predictSettings";
import type { PredictQueueFile } from "../workspace/predictQueue";
import {
  EMPTY_PREVIEW,
} from "../components/predictFilter/filterStudioControls";
import { COPY_FEEDBACK_MS } from "../lib/timeouts";

export type PredictedFilterSource = {
  file: PredictQueueFile;
  predictedPath: string;
};

type Args = {
  sources: PredictedFilterSource[];
  activePredictedPath: string;
  onSelectPredictedPath: (path: string) => void;
  limitsPath: string;
  labelSuffix: string;
  filterSettings: FilterSettings;
  onFilterSettingsChange: (next: FilterSettings) => void;
  orcaiReady: boolean;
  batchRunning: boolean;
  filterSubmitting: boolean;
  onApply: (predictedPaths: string[], limitsPath: string) => void;
};

/** Limits / preview / CLI state for PredictFilterStudio. */
export function usePredictFilterStudioModel({
  sources,
  activePredictedPath,
  onSelectPredictedPath,
  limitsPath,
  labelSuffix,
  filterSettings,
  onFilterSettingsChange,
  orcaiReady,
  batchRunning,
  filterSubmitting,
  onApply,
}: Args) {
  const { t } = useTranslation();
  const { notifySaved, notifyHeaderError } = useSaveNotice();
  const [limits, setLimits] = useState<CallDurationLimits>(ORCAI_DEFAULT_DURATION_LIMITS);
  const [selectedClass, setSelectedClass] = useState("default");
  const [pinnedSpan, setPinnedSpan] = useState<number | null>(null);
  const [applyAll, setApplyAll] = useState(false);
  const [preview, setPreview] = useState<FilterPreviewResult>(EMPTY_PREVIEW);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [limitsLabel, setLimitsLabel] = useState(() =>
    limitsPath ? basename(limitsPath) : "call_duration_limits.json",
  );
  const [activeLimitsPath, setActiveLimitsPath] = useState(limitsPath);
  const [filteredOnDisk, setFilteredOnDisk] = useState(false);
  const [cliCopied, setCliCopied] = useState(false);
  const cliCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [publicationNote, setPublicationNote] = useState(false);

  useEffect(() => {
    return () => {
      if (cliCopiedTimerRef.current) clearTimeout(cliCopiedTimerRef.current);
    };
  }, []);

  const busy = filterSubmitting || batchRunning || !orcaiReady;

  const previewPaths = useMemo(() => {
    if (applyAll) return sources.map((s) => s.predictedPath);
    return activePredictedPath ? [activePredictedPath] : [];
  }, [applyAll, sources, activePredictedPath]);

  useEffect(() => {
    setActiveLimitsPath(limitsPath);
  }, [limitsPath]);

  useEffect(() => {
    setPublicationNote(false);
  }, [activePredictedPath]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (limitsPath) {
        try {
          const text = await readTextFile(limitsPath);
          if (cancelled) return;
          if (text) {
            setLimits(collapseNoOpClassLimits(parseLimitsJson(text)));
            setLimitsLabel(basename(limitsPath));
            return;
          }
        } catch {
          /* fall through to engine default */
        }
      }
      try {
        const defaults = await fetchFilterDefaults();
        if (!cancelled) {
          setLimits(collapseNoOpClassLimits({ ...ORCAI_DEFAULT_DURATION_LIMITS, ...defaults }));
        }
      } catch {
        if (!cancelled) setLimits(ORCAI_DEFAULT_DURATION_LIMITS);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [limitsPath]);

  useEffect(() => {
    if (previewPaths.length === 0) {
      setPreview(EMPTY_PREVIEW);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void fetchFilterPreview({
        predictedLabels: previewPaths,
        limits: collapseNoOpClassLimits(limits),
        labelSuffix,
      })
        .then((next) => {
          if (!cancelled) {
            setPreview(next);
            setPreviewError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setPreview(EMPTY_PREVIEW);
            setPreviewError(formatUserFacingErrorRequired(err, t));
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [previewPaths, limits, labelSuffix, t]);

  useEffect(() => {
    let cancelled = false;
    if (!activePredictedPath) {
      setFilteredOnDisk(false);
      return;
    }
    void pathExists(
      resolveFilterJobOutputPath(activePredictedPath, filterSettings.outputFile),
    )
      .then((flag) => {
        if (!cancelled) setFilteredOnDisk(flag);
      })
      .catch(() => {
        if (!cancelled) setFilteredOnDisk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePredictedPath, filterSettings.outputFile]);

  const setBound = useCallback(
    (klass: string, index: 0 | 1, raw: string) => {
      setLimits((prev) => {
        const pair = prev[klass] ?? [null, null];
        const next: [DurationBound, DurationBound] = [...pair];
        next[index] = inputToBound(raw);
        return { ...prev, [klass]: next };
      });
    },
    [],
  );

  const setPair = useCallback((klass: string, min: DurationBound, max: DurationBound) => {
    setLimits((prev) => ({ ...prev, [klass]: [min, max] }));
  }, []);

  const onLoad = async () => {
    try {
      const picked = await pickJsonFile(t("predict.filterStudio.loadTitle"));
      if (!picked) return;
      const text = await readTextFile(picked);
      if (!text) return;
      setLimits(collapseNoOpClassLimits(parseLimitsJson(text)));
      setLimitsLabel(basename(picked));
      setActiveLimitsPath(picked);
      setPreviewError(null);
    } catch (err) {
      setPreviewError(formatUserFacingErrorRequired(err, t));
    }
  };

  const onSave = async () => {
    try {
      const dest =
        (await pickJsonOutputFile(t("predict.filterStudio.saveTitle"), limitsPath)) ??
        limitsPath;
      if (!dest) return;
      await writeTextFile(dest, serializeLimitsJson(limits));
      setLimitsLabel(basename(dest));
      setActiveLimitsPath(dest);
      setPreviewError(null);
      notifySaved(t("predict.filterStudio.saved"));
    } catch (err) {
      setPreviewError(formatUserFacingErrorRequired(err, t));
    }
  };

  const onApplyClick = async () => {
    const dest = activeLimitsPath || limitsPath;
    if (!dest || previewPaths.length === 0) return;
    if (limitsHaveInvertedPairs(limits)) {
      setPreviewError(t("predict.filterStudio.durationMinGtMax"));
      return;
    }
    try {
      await writeTextFile(dest, serializeLimitsJson(limits));
      onApply(previewPaths, dest);
    } catch (err) {
      setPreviewError(formatUserFacingErrorRequired(err, t));
    }
  };

  const visibleClassKeys = useMemo(
    () => filterTableClassKeys(preview.classes),
    [preview.classes],
  );
  useEffect(() => {
    if (selectedClass === "default") return;
    if (visibleClassKeys.length === 0) return;
    if (!visibleClassKeys.includes(selectedClass)) setSelectedClass("default");
  }, [selectedClass, visibleClassKeys]);
  const tableRows = [
    { key: "default", isDefault: true as const },
    ...visibleClassKeys.map((key) => ({ key, isDefault: false as const })),
  ];
  const defaultUsers = useMemo(
    () => classesUsingDefaultLimit(preview.classes, limits),
    [preview.classes, limits],
  );
  const selectedDurations = useMemo(
    () => durationsForSelectedLimit(selectedClass, preview.classes, limits),
    [preview.classes, limits, selectedClass],
  );

  const selectedPair =
    selectedClass === "default"
      ? (limits.default ?? [null, null])
      : (limits[selectedClass] ?? [null, null]);
  const limitsInverted = limitsHaveInvertedPairs(limits);
  const selectedInverted = isDurationPairInverted(
    selectedPair[0],
    selectedPair[1],
  );
  const hist = durationHistogram(selectedDurations, selectedPair, pinnedSpan);
  const noOp = isNoOpDurationLimits(limits);
  const activeSource = sources.find((s) => s.predictedPath === activePredictedPath);
  const cliOverwrite =
    filterSettings.overwrite ||
    filteredOnDisk ||
    Boolean(activeSource && filterNeedsOverwrite(activeSource.file));
  const commandLine = buildFilterCliLine({
    predictedLabels: activePredictedPath,
    overwrite: cliOverwrite,
    callDurationLimits: activeLimitsPath || limitsPath,
    labelSuffix,
  });
  const onCopyCli = async () => {
    if (!commandLine.trim() || busy) return;
    const ok = await copyText(commandLine);
    if (!ok) {
      notifyHeaderError(t("predict.run.cliCopyFailed"));
      return;
    }
    setCliCopied(true);
    if (cliCopiedTimerRef.current) clearTimeout(cliCopiedTimerRef.current);
    cliCopiedTimerRef.current = setTimeout(() => setCliCopied(false), COPY_FEEDBACK_MS);
  };
  const countsFor = (key: string, isDefault: boolean) => {
    if (isDefault) {
      return defaultUsers.reduce(
        (sum, row) => ({
          found: sum.found + row.found,
          keep: sum.keep + row.keep,
          drop: sum.drop + row.drop,
        }),
        { found: 0, keep: 0, drop: 0 },
      );
    }
    const hit = preview.classes.find((c) => c.label === key);
    return hit ?? { found: 0, keep: 0, drop: 0 };
  };
  const previewArrived =
    preview.files_ok > 0 || preview.classes.some((row) => row.found > 0);
  const onPublicationExample = () => {
    if (!previewArrived) return;
    if (publicationExampleFitsClasses(preview.classes)) {
      setLimits(ORCAI_V1_PUBLICATION_LIMITS);
      setPublicationNote(false);
      return;
    }
    setPublicationNote(true);
  };

  return {
    t,
    busy,
    limits,
    setLimits,
    selectedClass,
    setSelectedClass,
    applyAll,
    setApplyAll,
    preview,
    previewError,
    limitsLabel,
    limitsPath,
    previewPaths,
    tableRows,
    defaultUsers,
    selectedPair,
    limitsInverted,
    selectedInverted,
    hist,
    noOp,
    commandLine,
    cliCopied,
    publicationNote,
    setBound,
    setPair,
    setPinnedSpan,
    onLoad,
    onSave,
    onApplyClick,
    onCopyCli,
    countsFor,
    onPublicationExample,
    onSelectPredictedPath,
    filterSettings,
    onFilterSettingsChange,
    filterSubmitting,
  };
}

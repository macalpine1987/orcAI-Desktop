import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveNotice } from "../ui/saveNotice";
import {
  fetchFilterDefaults,
  fetchFilterPreview,
  readTextFile,
  writeTextFile,
  type FilterPreviewResult,
} from "../api/filterPreview";
import { pathExists } from "../api/fs";
import { pickJsonFile, pickJsonOutputFile, basename } from "../platform/dialog";
import { IconFolder } from "./projects/ProjectsIcons";
import { colorForLabel } from "../lib/labelColors";
import {
  boundToInput,
  collapseNoOpClassLimits,
  durationHistogram,
  FILTER_CLASS_ORDER,
  resolveFilterJobOutputPath,
  inputToBound,
  isDurationBoundDraft,
  isNoOpDurationLimits,
  ORCAI_DEFAULT_DURATION_LIMITS,
  ORCAI_V1_PUBLICATION_LIMITS,
  parseLimitsJson,
  serializeLimitsJson,
  type CallDurationLimits,
  type DurationBound,
} from "../lib/callDurationLimits";
import { filterNeedsOverwrite } from "../lib/predictBatch";
import { buildFilterCliLine } from "../lib/filterCliLine";
import { PredictFilterHistogram } from "./PredictFilterHistogram";
import { PredictFilterTrackToolbar } from "./PredictFilterTrackToolbar";
import type { FilterSettings } from "../workspace/predictSettings";
import type { PredictQueueFile } from "../workspace/predictQueue";

export type PredictedFilterSource = {
  file: PredictQueueFile;
  predictedPath: string;
};

type Props = {
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
  /** WAV channel for the track chrome above the preview column. */
  channel?: number;
};

const EMPTY_PREVIEW: FilterPreviewResult = {
  total: { found: 0, keep: 0, drop: 0 },
  classes: [],
  files_ok: 0,
  files_missing: [],
};

function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2.5v8" />
      <path d="M5 8.2 8 11.2 11 8.2" />
      <path d="M3 13.5h10" />
    </svg>
  );
}

function DurationBoundField({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: DurationBound;
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(() => boundToInput(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(boundToInput(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={draft}
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder="—"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isDurationBoundDraft(raw)) return;
        focusedRef.current = true;
        setDraft(raw);
        onCommit(raw);
      }}
      onBlur={() => {
        focusedRef.current = false;
        onCommit(draft);
        setDraft(boundToInput(inputToBound(draft)));
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function FilterSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="predict-filter-m05-switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="predict-filter-m05-toggle" aria-hidden>
        <span className="predict-filter-m05-toggle-knob" />
      </span>
      <span>{label}</span>
    </button>
  );
}

function predictedDisplayName(path: string, limit = 34): string {
  const name = basename(path);
  if (name.length <= limit) return name;
  return `...${name.slice(3 - limit)}`;
}

export function PredictFilterStudio({
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
  channel = 1,
}: Props) {
  const { t } = useTranslation();
  const { notifySaved } = useSaveNotice();
  const [limits, setLimits] = useState<CallDurationLimits>(ORCAI_DEFAULT_DURATION_LIMITS);
  const [selectedClass, setSelectedClass] = useState("default");
  const [applyAll, setApplyAll] = useState(false);
  const [preview, setPreview] = useState<FilterPreviewResult>(EMPTY_PREVIEW);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [limitsLabel, setLimitsLabel] = useState(() =>
    limitsPath ? basename(limitsPath) : "call_duration_limits.json",
  );
  const [activeLimitsPath, setActiveLimitsPath] = useState(limitsPath);
  const [filteredOnDisk, setFilteredOnDisk] = useState(false);
  const [cliCopied, setCliCopied] = useState(false);

  const busy = filterSubmitting || batchRunning || !orcaiReady;

  const previewPaths = useMemo(() => {
    if (applyAll) return sources.map((s) => s.predictedPath);
    return activePredictedPath ? [activePredictedPath] : [];
  }, [applyAll, sources, activePredictedPath]);

  useEffect(() => {
    setActiveLimitsPath(limitsPath);
  }, [limitsPath]);

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
            setPreviewError(err instanceof Error ? err.message : String(err));
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [previewPaths, limits, labelSuffix]);

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
      setPreviewError(err instanceof Error ? err.message : String(err));
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
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  };

  const onApplyClick = async () => {
    const dest = activeLimitsPath || limitsPath;
    if (!dest || previewPaths.length === 0) return;
    try {
      await writeTextFile(dest, serializeLimitsJson(limits));
      onApply(previewPaths, dest);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  };

  const selectedDurations = useMemo(() => {
    if (selectedClass === "default") {
      return preview.classes.flatMap((c) => c.durations);
    }
    return preview.classes.find((c) => c.label === selectedClass)?.durations ?? [];
  }, [preview, selectedClass]);

  const selectedPair =
    selectedClass === "default"
      ? (limits.default ?? [null, null])
      : (limits[selectedClass] ?? [null, null]);
  const bins = durationHistogram(selectedDurations, 16);
  const dataMax = bins.at(-1)?.end ?? 0;
  const histSpan = Math.max(
    selectedDurations.length > 0 ? dataMax : 20,
    (selectedPair[1] ?? 0) * 1.05,
    (selectedPair[0] ?? 0) * 1.15,
    1,
  );
  const barColor = colorForLabel(
    selectedClass === "default" ? "WHISTLE" : selectedClass,
  );
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
    try {
      await navigator.clipboard.writeText(commandLine);
      setCliCopied(true);
      window.setTimeout(() => setCliCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  const extraClassKeys = [
    ...preview.classes.map((c) => c.label),
    ...Object.keys(limits).filter((k) => k !== "default"),
  ].filter(
    (key, idx, all) =>
      Boolean(key) &&
      !FILTER_CLASS_ORDER.includes(key) &&
      all.indexOf(key) === idx,
  );
  const tableRows = [
    { key: "default", isDefault: true as const },
    ...FILTER_CLASS_ORDER.map((key) => ({ key, isDefault: false as const })),
    ...extraClassKeys.map((key) => ({ key, isDefault: false as const })),
  ];

  const countsFor = (key: string, isDefault: boolean) => {
    if (isDefault) return preview.total;
    const hit = preview.classes.find((c) => c.label === key);
    return hit ?? { found: 0, keep: 0, drop: 0 };
  };

  return (
    <div className="predict-filter-m05-shell">
      <div className="predict-filter-m05">
      {noOp ? (
        <p className="predict-filter-m05-warn" role="status">
          {t("predict.filterStudio.defaultWarn")}
        </p>
      ) : null}
      {previewError ? (
        <p className="predict-filter-m05-error" role="alert">
          {previewError}
        </p>
      ) : null}

      <div className="predict-filter-m05-grid">
        <section className="predict-filter-m05-limits" aria-label={t("predict.filterStudio.limitsTitle")}>
          <header className="predict-filter-m05-limits-head">
            <div className="predict-filter-m05-limits-title-row">
              <h3>{t("predict.filterStudio.limitsTitle")}</h3>
              <span className="predict-filter-m05-limits-file">{limitsLabel}</span>
            </div>
            <div className="predict-filter-m05-limits-actions">
              <button
                type="button"
                className="predict-filter-m05-tool"
                disabled={busy}
                onClick={() => void onLoad()}
              >
                <IconFolder size={13} />
                {t("predict.filterStudio.load")}
              </button>
              <button
                type="button"
                className="predict-filter-m05-tool"
                disabled={busy}
                onClick={() => void onSave()}
              >
                <IconDownload />
                {t("predict.filterStudio.save")}
              </button>
              <button
                type="button"
                className="predict-filter-m05-tool is-outline"
                disabled={busy}
                onClick={() => setLimits(ORCAI_DEFAULT_DURATION_LIMITS)}
              >
                {t("predict.filterStudio.reset")}
              </button>
              <button
                type="button"
                className="predict-filter-m05-tool is-quiet"
                disabled={busy}
                title={t("predict.filterStudio.publicationHint")}
                onClick={() => setLimits(ORCAI_V1_PUBLICATION_LIMITS)}
              >
                {t("predict.filterStudio.publication")}
              </button>
            </div>
          </header>

          <div className="predict-filter-m05-table-wrap">
            <table className="predict-filter-m05-table">
              <thead>
                <tr>
                  <th>{t("predict.filterStudio.colClass")}</th>
                  <th>{t("predict.filterStudio.colMin")}</th>
                  <th>{t("predict.filterStudio.colMax")}</th>
                  <th className="is-num">{t("predict.filterStudio.colFound")}</th>
                  <th className="is-num">{t("predict.filterStudio.colKeep")}</th>
                  <th className="is-num">{t("predict.filterStudio.colDrop")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const pair = limits[row.key] ?? [null, null];
                  const counts = countsFor(row.key, row.isDefault);
                  const selected = selectedClass === row.key;
                  return (
                    <tr
                      key={row.key}
                      className={selected ? "is-selected" : undefined}
                      onClick={() => setSelectedClass(row.key)}
                    >
                      <td className="predict-filter-m05-class">
                        {row.isDefault ? "default" : row.key}
                      </td>
                      <td className="predict-filter-m05-bound">
                        <DurationBoundField
                          value={pair[0]}
                          ariaLabel={`${row.key} min`}
                          disabled={busy}
                          onCommit={(raw) => setBound(row.key, 0, raw)}
                        />
                      </td>
                      <td className="predict-filter-m05-bound">
                        <DurationBoundField
                          value={pair[1]}
                          ariaLabel={`${row.key} max`}
                          disabled={busy}
                          onCommit={(raw) => setBound(row.key, 1, raw)}
                        />
                      </td>
                      <td className="is-num">{counts.found || "—"}</td>
                      <td className="is-num is-keep">
                        {counts.found ? counts.keep : "—"}
                      </td>
                      <td className="is-num is-drop">
                        {counts.found ? counts.drop : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="predict-filter-m05-hint">{t("predict.filterStudio.emptyHint")}</p>
        </section>

        <div className="predict-filter-m05-right">
          <PredictFilterTrackToolbar
            sources={sources}
            activePredictedPath={activePredictedPath}
            channel={channel}
            disabled={busy}
            onSelectPredictedPath={onSelectPredictedPath}
          />
        <aside className="predict-filter-m05-side">
          <h3>
            {t("predict.filterStudio.previewTitle", {
              klass: selectedClass === "default" ? "all" : selectedClass,
            })}
          </h3>
          <PredictFilterHistogram
            bins={bins}
            min={selectedPair[0] ?? null}
            max={selectedPair[1] ?? null}
            span={histSpan}
            color={barColor}
            disabled={busy}
            minLabel={(n) => t("predict.filterStudio.histMin", { n })}
            maxLabel={(n) => t("predict.filterStudio.histMax", { n })}
            axisLabel={t("predict.filterStudio.histAxis")}
            hint={t("predict.filterStudio.histHint")}
            brushLabel={t("predict.filterStudio.histBrush")}
            onChange={(min, max) => setPair(selectedClass, min, max)}
          />

          <div className="predict-filter-m05-source">
            <h3>{t("predict.filterStudio.source")}</h3>
            <select
              value={activePredictedPath}
              disabled={busy || sources.length === 0}
              title={
                activePredictedPath ? basename(activePredictedPath) : undefined
              }
              onChange={(e) => onSelectPredictedPath(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s.predictedPath} value={s.predictedPath}>
                  {predictedDisplayName(s.predictedPath)}
                </option>
              ))}
            </select>
            <p className="predict-filter-m05-source-n">
              {t("predict.filterStudio.sourceCount", { count: sources.length })}
            </p>
          </div>

          <FilterSwitch
            checked={applyAll}
            disabled={busy}
            label={t("predict.filterStudio.applyAll")}
            onChange={setApplyAll}
          />
          <FilterSwitch
            checked={filterSettings.overwrite}
            disabled={busy}
            label={t("predict.filterStudio.overwriteFiltered")}
            onChange={(next) =>
              onFilterSettingsChange({
                ...filterSettings,
                overwrite: next,
              })
            }
          />
          <p className="predict-filter-m05-note">{t("predict.filterStudio.originalUntouched")}</p>
        </aside>
        </div>
      </div>
      </div>

      <footer className="pp-footer predict-filter-m05-foot">
        <div className="pp-footer-main">
          <div className="pp-footer-cmd">
            <p className="pp-cmd-label">
              {t("predict.run.cliTitle")}
              {applyAll && previewPaths.length > 1
                ? ` ${t("predict.filterStudio.cliTimes", { count: previewPaths.length })}`
                : ""}
            </p>
            <div className="pp-cmd-row">
              <pre
                className={commandLine ? "pp-cmd-lcd" : "pp-cmd-lcd is-empty"}
                title={commandLine || undefined}
                aria-label={
                  commandLine
                    ? t("predict.run.cliTitle")
                    : t("predict.run.cliEmpty")
                }
              >
                {commandLine || t("predict.run.cliEmpty")}
              </pre>
              <button
                type="button"
                className="pp-btn pp-btn-preset pp-cmd-copy"
                disabled={busy || !commandLine.trim()}
                onClick={() => void onCopyCli()}
              >
                {cliCopied
                  ? t("predict.run.cliCopied")
                  : t("predict.run.cliCopy")}
              </button>
            </div>
          </div>
          <div className="pp-footer-side">
            <span className="pp-footer-count">
              {t("predict.filterStudio.remainOf", {
                keep: preview.total.keep,
                found: preview.total.found,
              })}
            </span>
            <div className="pp-footer-btns">
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                disabled={busy || previewPaths.length === 0 || !limitsPath}
                onClick={() => void onApplyClick()}
              >
                {filterSubmitting
                  ? t("predict.running")
                  : t("predict.filterStudio.apply")}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

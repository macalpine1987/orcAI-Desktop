import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchSpectrogramMeta,
  peekSpectrogramMeta,
  type SpectrogramMeta,
} from "../api/spectrogram";
import { displaySpectrogramSampleRateHz } from "../lib/formatAudio";
import { joinFsPath } from "../lib/joinFsPath";
import {
  neighborWavPaths,
  warmNeighborSpectrograms,
} from "../lib/spectrogramNeighborWarm";
import { SpectrogramViewer } from "./SpectrogramViewer";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import { loadWorkspace, saveWorkspace } from "../workspace/storage";

export function PredictSpectrogramPanel({
  wavPath,
  labelPath,
  onLabelPathChange,
  compareLabelPath,
  onCompareLabelPathChange,
  layout = "proLab",
  studioChrome = false,
  showSpectrogram = true,
  transportSlot = null,
  toolsSlot = null,
  lcdSlot = null,
  zoomSlot = null,
  segmentSlot = null,
  studioFilePicker = null,
  onDetectionTotalChange,
  neighborFiles = null,
  predictChannel = 1,
  predictThreshold = null,
  modelClasses = null,
  labelSource = null,
  focusNav = null,
}: {
  wavPath: string;
  labelPath: string;
  onLabelPathChange: (path: string) => void;
  compareLabelPath: string;
  onCompareLabelPathChange: (path: string) => void;
  layout?: "proLab" | "compact" | "scientific";
  studioChrome?: boolean;
  /** When false in studio, skip plot tiles / neighbor warm; table fills the hero. */
  showSpectrogram?: boolean;
  transportSlot?: HTMLElement | null;
  toolsSlot?: HTMLElement | null;
  lcdSlot?: HTMLElement | null;
  zoomSlot?: HTMLElement | null;
  segmentSlot?: HTMLElement | null;
  studioFilePicker?: {
    open: boolean;
    onToggle: () => void;
    disabled?: boolean;
    canPrev?: boolean;
    canNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
  } | null;
  onDetectionTotalChange?: (total: number | null) => void;
  neighborFiles?: { path: string; kind?: string }[] | null;
  /** Predict `-c`. Scientific layout hides the selector, so this must be the source of truth. */
  predictChannel?: number;
  predictThreshold?: number | null;
  modelClasses?: readonly string[] | null;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  focusNav?: DetectionFocusNav | null;
}) {
  const { t } = useTranslation();
  const { online } = useSidecarStatus();
  const workspace = loadWorkspace();
  const orcaiParameter =
    workspace.projectDir && workspace.projectName
      ? joinFsPath(
          workspace.projectDir,
          `${workspace.projectName}_orcai_parameter.json`,
        )
      : null;

  const [meta, setMeta] = useState<SpectrogramMeta | null>(() =>
    wavPath.trim()
      ? peekSpectrogramMeta(wavPath.trim(), orcaiParameter)
      : null,
  );
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [channel, setChannel] = useState(predictChannel);
  const warmAbortRef = useRef<AbortController | null>(null);
  const warmTimerRef = useRef<number | null>(null);
  const warmedForPathRef = useRef<string | null>(null);
  const isProLab = layout === "proLab";
  const isScientific = layout === "scientific";

  useEffect(() => {
    if (!meta || !online) {
      onDetectionTotalChange?.(null);
    }
  }, [meta, online, onDetectionTotalChange]);

  useEffect(() => {
    setChannel(predictChannel);
  }, [predictChannel]);

  useEffect(() => {
    const path = wavPath.trim();
    if (!path || !online) {
      setMeta(null);
      setMetaError(null);
      setLoadingMeta(false);
      return;
    }

    const cached = peekSpectrogramMeta(path, orcaiParameter);
    if (cached) {
      setMeta(cached);
      setMetaError(null);
      setLoadingMeta(false);
    } else {
      setMeta(null);
      setLoadingMeta(true);
      setMetaError(null);
    }

    const ac = new AbortController();
    void fetchSpectrogramMeta(path, {
      orcaiParameter,
      signal: ac.signal,
    })
      .then((m) => {
        if (ac.signal.aborted) return;
        setMeta(m);
        setChannel((prev) =>
          m.channels != null && prev > m.channels ? 1 : prev,
        );
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        if (!cached) setMeta(null);
        setMetaError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingMeta(false);
      });
    return () => {
      ac.abort();
    };
  }, [wavPath, online, orcaiParameter]);

  useEffect(() => {
    warmedForPathRef.current = null;
    return () => {
      if (warmTimerRef.current != null) {
        window.clearTimeout(warmTimerRef.current);
        warmTimerRef.current = null;
      }
      warmAbortRef.current?.abort();
      warmAbortRef.current = null;
    };
  }, [wavPath]);

  const onViewportReady = useCallback(() => {
    if (!showSpectrogram) return;
    if (!studioChrome || !online || !neighborFiles?.length) return;
    const path = wavPath.trim();
    if (!path || warmedForPathRef.current === path) return;
    const neighbors = neighborWavPaths(neighborFiles, path);
    if (neighbors.length === 0) return;

    warmedForPathRef.current = path;
    if (warmTimerRef.current != null) {
      window.clearTimeout(warmTimerRef.current);
    }
    warmAbortRef.current?.abort();
    const ac = new AbortController();
    warmAbortRef.current = ac;
    warmTimerRef.current = window.setTimeout(() => {
      void warmNeighborSpectrograms(neighbors, {
        channel,
        orcaiParameter,
        signal: ac.signal,
      });
    }, 250);
  }, [showSpectrogram, studioChrome, online, neighborFiles, wavPath, channel, orcaiParameter]);

  const labelInput = (id: "primary" | "compare") => {
    const isPrimary = id === "primary";
    const value = isPrimary ? labelPath : compareLabelPath;
    const setValue = isPrimary ? onLabelPathChange : onCompareLabelPathChange;
    const wsKey = isPrimary ? "lastLabelPath" : "lastCompareLabelPath";
    return (
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-foreground-muted">
          {isPrimary
            ? t("spectrogram.labelsPath")
            : t("spectrogram.compareLabelsPath")}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const trimmed = e.target.value;
            setValue(trimmed);
            if (trimmed.trim()) {
              saveWorkspace({ [wsKey]: trimmed.trim() });
            }
          }}
          placeholder={
            isPrimary
              ? t("spectrogram.labelsPlaceholder")
              : t("spectrogram.compareLabelsPlaceholder")
          }
          className="w-full mat-raised px-3 py-2 font-mono text-xs transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
      </label>
    );
  };

  if (!wavPath.trim()) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-subtle/50 px-4 py-12 text-center text-sm text-foreground-muted">
        {t("predict.selectFileForSpectrogram")}
      </p>
    );
  }

  const labelsBlock = (
    <div
      className={
        isProLab && !isScientific
          ? "grid gap-3 p-3 pt-0 md:grid-cols-2"
          : "grid gap-2 p-2"
      }
    >
      {labelInput("primary")}
      {!isScientific ? labelInput("compare") : null}
    </div>
  );

  return (
    <section
      className={`${
        isScientific
          ? "analysis-lab-stack analysis-scientific-stack"
          : isProLab
            ? "analysis-lab-stack"
            : "space-y-3"
      }${studioChrome ? " analysis-spectrogram-studio-host" : ""}`}
    >
      {!studioChrome && isScientific ? (
        <details className="analysis-label-sources analysis-label-sources-compact">
          <summary>{t("spectrogram.labelSourcesTitle")}</summary>
          {labelsBlock}
        </details>
      ) : !studioChrome && isProLab ? (
        <details className="analysis-label-sources">
          <summary>{t("spectrogram.labelSourcesTitle")}</summary>
          {labelsBlock}
        </details>
      ) : !studioChrome ? (
        <div className="grid gap-2">
          <h2 className="text-sm font-medium">{t("predict.spectrogramSection")}</h2>
          {labelsBlock}
        </div>
      ) : null}

      {loadingMeta && !meta && (
        <p className="text-xs text-foreground-muted">{t("common.loading")}</p>
      )}
      {!isScientific && meta && (
        <div className="analysis-meta-strip">
          <span className="analysis-meta-badge">
            {t("spectrogram.meta", {
              duration: Number(meta.duration_sec ?? 0).toFixed(1),
              sampleRate: displaySpectrogramSampleRateHz(meta) ?? 0,
            })}
          </span>
          {meta.channels != null && meta.channels > 1 && (
            <label className="flex items-center gap-2">
              <span>{t("spectrogram.channel")}</span>
              <select
                value={channel}
                onChange={(e) => setChannel(Number(e.target.value))}
                className="mat-raised px-2 py-0.5"
              >
                {Array.from({ length: meta.channels }, (_, i) => i + 1).map(
                  (ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
        </div>
      )}
      {metaError && (
        <p className="font-mono text-xs text-foreground">{metaError}</p>
      )}

      {meta && online ? (
        <SpectrogramViewer
          wavPath={meta.path}
          meta={meta}
          channel={channel}
          orcaiParameter={orcaiParameter}
          labelPath={labelPath.trim() || null}
          compareLabelPath={compareLabelPath.trim() || null}
          layout={layout}
          studioChrome={studioChrome}
          showSpectrogram={showSpectrogram}
          transportSlot={transportSlot}
          toolsSlot={toolsSlot}
          lcdSlot={lcdSlot}
          zoomSlot={zoomSlot}
          segmentSlot={segmentSlot}
          studioFilePicker={studioFilePicker}
          onDetectionTotalChange={onDetectionTotalChange}
          onViewportReady={onViewportReady}
          predictThreshold={predictThreshold}
          modelClasses={modelClasses}
          labelSource={labelSource}
          focusNav={focusNav}
        />
      ) : showSpectrogram ? (
        <div className="analysis-spectrogram-canvas flex min-h-40 flex-col">
          <div className="analysis-spectrogram-stage min-h-40 flex-1 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-800" />
          <p className="analysis-coordinates-bar text-foreground-muted">
            {t("spectrogram.lanesHint")}
          </p>
        </div>
      ) : (
        <p className="px-4 py-8 text-sm text-foreground-muted">
          {loadingMeta ? t("common.loading") : t("spectrogram.lanesHint")}
        </p>
      )}
    </section>
  );
}

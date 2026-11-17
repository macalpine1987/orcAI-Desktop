import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SpectrogramMeta } from "../../api/spectrogram";
import {
  displaySpectrogramSampleRateHz,
  formatDurationSec,
  formatSampleRateHz,
} from "../../lib/formatAudio";
import type { SpectrogramColormap } from "../../lib/spectrogramView";
import { basename } from "../../platform/dialog";
import { SpectrogramFileSegmentRail } from "../SpectrogramFileSegmentRail";

export type SpectrogramStudioFilePicker = {
  open: boolean;
  onToggle: () => void;
  onClose?: () => void;
  disabled?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  files?: readonly { name: string }[];
  activeFileName?: string | null;
  onSelect?: (name: string) => void;
};

export type SpectrogramStudioLabelSource = {
  kind: "original" | "filtered";
  originalAvailable: boolean;
  filteredAvailable: boolean;
  fileName: string;
  onChange: (kind: "original" | "filtered") => void;
};

type Props = {
  meta: SpectrogramMeta;
  channel: number;
  duration: number;
  wavPath: string;
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
  showSpectrogram: boolean;
  onViewStartChange: (start: number) => void;
  onSegmentSelect: (index: number) => void;
  studioFilePicker: SpectrogramStudioFilePicker | null;
  classesFilterOpen: boolean;
  classesToolsOpen: boolean;
  setClassesFilterOpen: (open: boolean | ((o: boolean) => boolean)) => void;
  onClassesToolsOpenChange?: (open: boolean) => void;
  labelSource: SpectrogramStudioLabelSource | null;
  colormap: SpectrogramColormap;
  setColormap: (map: SpectrogramColormap) => void;
};

export function SpectrogramStudioSegmentRail({
  meta,
  channel,
  duration,
  wavPath,
  viewStart,
  viewSpan,
  segmentIndex,
  showSpectrogram,
  onViewStartChange,
  onSegmentSelect,
  studioFilePicker,
  classesFilterOpen,
  classesToolsOpen,
  setClassesFilterOpen,
  onClassesToolsOpenChange,
  labelSource,
  colormap,
  setColormap,
}: Props) {
  const { t } = useTranslation();

  const studioFileMeta = useMemo(() => {
    const studioFileRateHz = displaySpectrogramSampleRateHz(meta);
    let studioFileRateLabel: string | null = null;
    if (studioFileRateHz != null && Number.isFinite(studioFileRateHz)) {
      if (studioFileRateHz >= 1000) {
        const khz = studioFileRateHz / 1000;
        const value =
          Math.abs(khz - Math.round(khz)) < 0.05
            ? String(Math.round(khz))
            : khz.toFixed(1);
        studioFileRateLabel = t("projects.studio.kHz", { value });
      } else {
        studioFileRateLabel = formatSampleRateHz(studioFileRateHz);
      }
    }
    return [
      studioFileRateLabel,
      channel > 0 ? t("spectrogram.specHeader.channel", { channel }) : null,
      duration > 0 ? formatDurationSec(duration) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [meta, channel, duration, t]);

  if (duration <= 0) return null;

  return (
    <SpectrogramFileSegmentRail
      studioLayout
      fileNavOnly={!showSpectrogram}
      durationSec={duration}
      viewStart={viewStart}
      viewSpan={viewSpan}
      segmentIndex={segmentIndex}
      onViewStartChange={onViewStartChange}
      onSegmentSelect={onSegmentSelect}
      fileName={basename(wavPath)}
      fileMeta={studioFileMeta || null}
      onFileMenuToggle={studioFilePicker ? studioFilePicker.onToggle : null}
      onFileMenuClose={studioFilePicker?.onClose ?? null}
      fileMenuOpen={studioFilePicker?.open ?? false}
      fileMenuDisabled={studioFilePicker?.disabled ?? false}
      fileMenuFiles={studioFilePicker?.files ?? null}
      fileMenuActiveName={studioFilePicker?.activeFileName ?? null}
      onFileMenuSelect={studioFilePicker?.onSelect ?? null}
      onFilePrev={studioFilePicker?.onPrev ?? null}
      onFileNext={studioFilePicker?.onNext ?? null}
      canFilePrev={studioFilePicker?.canPrev ?? false}
      canFileNext={studioFilePicker?.canNext ?? false}
      onClassesFilterToggle={
        !showSpectrogram
          ? () => setClassesFilterOpen((open) => !open)
          : onClassesToolsOpenChange
            ? () => onClassesToolsOpenChange(!classesToolsOpen)
            : null
      }
      classesFilterOpen={!showSpectrogram ? classesFilterOpen : classesToolsOpen}
      labelSource={labelSource}
      colormap={showSpectrogram ? colormap : undefined}
      onColormapChange={showSpectrogram ? setColormap : null}
    />
  );
}

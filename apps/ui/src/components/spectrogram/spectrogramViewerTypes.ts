import type { SpectrogramMeta } from "../../api/spectrogram";
import type { DetectionFocusNav } from "../../lib/resultsStudio";

export type SpectrogramViewerProps = {
  wavPath: string;
  meta: SpectrogramMeta;
  channel?: number;
  orcaiParameter?: string | null;
  labelPath?: string | null;
  compareLabelPath?: string | null;
  /**
   * `proLab` — full toolbar, file segment rail, coordinates bar.
   * `compact` — denser toolbar, classic time slider only.
   * `scientific` — grayscale FEROP-style plot: gray only, light canvas, axes with ticks.
   */
  layout?: "proLab" | "compact" | "scientific";
  /** Predict results studio: plot + transport only. */
  studioChrome?: boolean;
  /**
   * When false with studioChrome, skip plot/tiles/transport/class sidebar
   * and expand the detections table (Settings → Show spectrogram).
   */
  showSpectrogram?: boolean;
  /** Portal Logic Pro transport into the page toolbar. */
  transportSlot?: HTMLElement | null;
  /** Portal zoom + volume into the page toolbar. */
  toolsSlot?: HTMLElement | null;
  /** Portal time LCD into the centered toolbar slot. */
  lcdSlot?: HTMLElement | null;
  /** Optional external zoom portal (non-studio). */
  zoomSlot?: HTMLElement | null;
  /** Portal segment rail between toolbar and spectrogram. */
  segmentSlot?: HTMLElement | null;
  /** Portal Classes tools strip (Analysis · tools swap). */
  classesToolsSlot?: HTMLElement | null;
  classesToolsOpen?: boolean;
  onClassesToolsOpenChange?: (open: boolean) => void;
  studioFilePicker?: {
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
  } | null;
  /** Notify parent of primary detection count (Results tab badge). */
  onDetectionTotalChange?: (total: number | null) => void;
  /** Fired once the active viewport tile paints (neighbor warm hook). */
  onViewportReady?: () => void;
  /** Predict `-th` (0–1). Display tick only — does not rewrite the label file. */
  predictThreshold?: number | null;
  /** Classes of the model selected for this recognition. */
  modelClasses?: readonly string[] | null;
  labelSource?: {
    kind: "original" | "filtered";
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: "original" | "filtered") => void;
  } | null;
  /** Jump to a detection after navigating from Results. */
  focusNav?: DetectionFocusNav | null;
};

/** Unmeasured until ResizeObserver settles (avoids aborting STFT on first layout). */
export const VIEW_WIDTH_UNSET = 0;
export const SPEC_HEIGHT_DEFAULT = 280;
export const LANE_HEIGHT = 48;

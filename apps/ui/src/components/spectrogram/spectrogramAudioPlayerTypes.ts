import type { LcdTransportPhase } from "./SpectrogramLogicLcd";

export type PlayScope = "file" | "view" | "segment";
export type { LcdTransportPhase };
export type LoopRegion = { t0: number; t1: number };

type SegmentRange = { t0: number; t1: number };

export type SpectrogramAudioPlayerProps = {
  wavPath: string;
  channel: number;
  duration: number;
  viewStart: number;
  viewSpan: number;
  playheadSec: number;
  onPlayheadChange: (sec: number) => void;
  lcdWindowRange?: SegmentRange | null;
  segmentRange: SegmentRange | null;
  loopRegion: LoopRegion | null;
  onLoopRegionToggle: () => void;
  onLoopClear?: () => void;
  hasTimeSelection?: boolean;
  disabled?: boolean;
  /**
   * Keep-alive Lab section visible. When false, pause playback so audio does
   * not continue after navigating away from Recognition.
   */
  sectionActive?: boolean;
  embedded?: boolean;
  studioTransport?: boolean;
  transportSlot?: HTMLElement | null;
  toolsSlot?: HTMLElement | null;
  lcdSlot?: HTMLElement | null;
  zoomSlot?: HTMLElement | null;
  studioZoom?: {
    value: number;
    onChange: (value: number) => void;
    onCommit?: () => void;
    disabled?: boolean;
  };
  studioMarkOpacity?: {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  };
  studioSlidersReset?: {
    onReset: () => void;
    atDefault: boolean;
  } | null;
  studioHandPan?: {
    armed: boolean;
    onToggle: () => void;
  } | null;
};

export const STUDIO_VOLUME_DEFAULT = 1;

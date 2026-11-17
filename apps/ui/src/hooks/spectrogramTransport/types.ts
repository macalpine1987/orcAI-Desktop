import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";

export type SpectrogramTransportZoomArgs = {
  duration: number;
  wavPath: string;
  projectScope?: string | null;
  viewStart: number;
  setViewStart: Dispatch<SetStateAction<number>>;
  viewSpan: number;
  setViewSpan: Dispatch<SetStateAction<number>>;
  segmentIndex: number;
  setSegmentIndex: Dispatch<SetStateAction<number>>;
  setPlayheadSec: Dispatch<SetStateAction<number>>;
  selectedSegment: DetectionSelection | null;
  setSegmentHint: Dispatch<SetStateAction<string | null>>;
  setTileFetchWindow: Dispatch<SetStateAction<{ t0: number; t1: number }>>;
  flushTileFetch: () => void;
  handPanArmed: boolean;
  setHandPanArmed: Dispatch<SetStateAction<boolean>>;
  /** True while Hand pointer-drag is active (suppress mid-drag STFT). */
  onHandDragActiveChange?: (active: boolean) => void;
  setMarkOpacity: Dispatch<SetStateAction<number>>;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  visibleSpan: number;
  timeSelection: TimeRangeSec | null;
  setTimeSelection: Dispatch<SetStateAction<TimeRangeSec | null>>;
  setTimeSelectionDraft: Dispatch<SetStateAction<TimeRangeSec | null>>;
  loopRegion: TimeRangeSec | null;
  setLoopRegion: Dispatch<SetStateAction<TimeRangeSec | null>>;
};

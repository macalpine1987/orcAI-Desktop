import type { DetectionColumnId } from "./detectionTableTypes";

export type { DetectionColumnId } from "./detectionTableTypes";

export const ALL_COLUMNS: DetectionColumnId[] = [
  "color",
  "time",
  "end",
  "duration",
  "class",
  "type",
  "confidence",
  "file",
];

export const DEFAULT_VISIBLE: Record<DetectionColumnId, boolean> = {
  color: true,
  time: true,
  end: true,
  duration: true,
  class: true,
  type: true,
  confidence: true,
  file: true,
};

/** m04 studio: fixed columns, no types modal (sidebar owns КЛАССЫ). */
export const STUDIO_VISIBLE: Record<DetectionColumnId, boolean> = {
  color: false,
  time: true,
  end: true,
  duration: true,
  class: true,
  type: true,
  confidence: true,
  file: true,
};

/** Long labels for the columns picker (mockup modal). */
export function columnPickerKey(id: DetectionColumnId): string {
  switch (id) {
    case "color":
      return "spectrogram.detections.colColor";
    case "time":
      return "spectrogram.detections.colStart";
    case "end":
      return "spectrogram.detections.colEnd";
    case "duration":
      return "spectrogram.detections.colDuration";
    case "class":
      return "spectrogram.detections.colClass";
    case "type":
      return "spectrogram.detections.colType";
    case "confidence":
      return "spectrogram.detections.colConfidence";
    case "file":
      return "spectrogram.detections.colFile";
  }
}

/** Short labels for table `<th>` (mockup header row). */
export function columnHeaderKey(id: DetectionColumnId): string {
  switch (id) {
    case "color":
      return "spectrogram.detections.colColor";
    case "time":
      return "spectrogram.detections.colStartHeader";
    case "end":
      return "spectrogram.detections.colEndHeader";
    case "duration":
      return "spectrogram.detections.colDurationHeader";
    case "class":
      return "spectrogram.detections.colClassHeader";
    case "type":
      return "spectrogram.detections.colTypeHeader";
    case "confidence":
      return "spectrogram.detections.colConfidenceHeader";
    case "file":
      return "spectrogram.detections.colFileHeader";
  }
}

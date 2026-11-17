import { useCallback, useEffect, useMemo, useState } from "react";
import type { LabelsPreview } from "../../api/labels";
import {
  createLabelColorMap,
  mergeLabelNames,
  publicationNameForLabel,
} from "../../lib/labelColors";
import { mergeLabelColorOverrides } from "../../lib/classColors";
import {
  confidenceFractionToFloorPercent,
  segmentPassesProbabilityFloor,
} from "../../lib/spectrogramProbFloor";
import { effectiveLabelDeltaT } from "../../lib/segmentTime";
import { type OverlaySegment } from "../SpectrogramOverlay";
import { tagSegments } from "./spectrogramViewerHelpers";

type Options = {
  primaryLabels: LabelsPreview | null;
  compareLabels: LabelsPreview | null;
  labelPath?: string | null;
  compareLabelPath?: string | null;
  duration: number;
  classColorOverrides: Record<string, string>;
  wavPath: string;
  showSpectrogram: boolean;
  onDetectionTotalChange?: (total: number | null) => void;
};

export function useSpectrogramOverlayState({
  primaryLabels,
  compareLabels,
  labelPath,
  compareLabelPath,
  duration,
  classColorOverrides,
  wavPath,
  showSpectrogram,
  onDetectionTotalChange,
}: Options) {
  const [overlayOnSpec, setOverlayOnSpec] = useState(true);
  const [showLanes, setShowLanes] = useState(true);
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(() => new Set());
  const [soloLabel, setSoloLabel] = useState<string | null>(null);
  const [showProbabilityLabels, setShowProbabilityLabels] = useState(true);
  const [classesFilterOpen, setClassesFilterOpen] = useState(false);
  const [segmentHint, setSegmentHint] = useState<string | null>(null);
  const [confidenceMin, setConfidenceMin] = useState(0);

  useEffect(() => {
    setConfidenceMin(0);
  }, [wavPath]);
  useEffect(() => {
    if (showSpectrogram) setClassesFilterOpen(false);
  }, [showSpectrogram]);

  const allSegments = useMemo(() => {
    const out: OverlaySegment[] = [];
    if (primaryLabels) out.push(...tagSegments(primaryLabels, "primary"));
    if (compareLabels) out.push(...tagSegments(compareLabels, "compare"));
    return out;
  }, [primaryLabels, compareLabels]);

  const segmentsAboveConfidence = useMemo(() => {
    const floor = confidenceFractionToFloorPercent(confidenceMin);
    return allSegments.filter((seg) =>
      segmentPassesProbabilityFloor(seg.mean_p, floor),
    );
  }, [allSegments, confidenceMin]);

  const overlaySegments = segmentsAboveConfidence;

  const classSidebarEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seg of overlaySegments) {
      if (seg.source !== "primary") continue;
      counts.set(seg.label, (counts.get(seg.label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }, [overlaySegments]);

  const classSidebarTotal = useMemo(
    () => classSidebarEntries.reduce((n, e) => n + e.count, 0),
    [classSidebarEntries],
  );

  const classSidebarUnfilteredTotal = useMemo(() => {
    let n = 0;
    for (const seg of allSegments) {
      if (seg.source === "primary") n += 1;
    }
    return n;
  }, [allSegments]);

  const primaryDetectionTotal = useMemo(() => {
    if (!primaryLabels) return null;
    return primaryLabels.segments.filter((seg) =>
      segmentPassesProbabilityFloor(
        seg.mean_p,
        confidenceFractionToFloorPercent(confidenceMin),
      ),
    ).length;
  }, [primaryLabels, confidenceMin]);

  useEffect(() => {
    onDetectionTotalChange?.(primaryDetectionTotal);
  }, [primaryDetectionTotal, onDetectionTotalChange]);

  const labelNames = useMemo(
    () =>
      mergeLabelNames(
        primaryLabels ? Object.keys(primaryLabels.labels) : [],
        compareLabels ? Object.keys(compareLabels.labels) : [],
      ),
    [primaryLabels, compareLabels],
  );

  const toggleClassVisibility = useCallback(
    (label: string) => {
      setHiddenLabels((prev) => {
        const next = new Set(prev);
        const pub = publicationNameForLabel(label) ?? label;
        const related = labelNames.filter((name) => {
          const namePub = publicationNameForLabel(name) ?? name;
          return name === label || namePub === pub;
        });
        const targets = related.length > 0 ? related : [label];
        const anyVisible = targets.some((name) => !prev.has(name));
        if (anyVisible) {
          for (const name of targets) next.add(name);
        } else {
          for (const name of targets) next.delete(name);
        }
        return next;
      });
      setSoloLabel(null);
    },
    [labelNames],
  );

  const labelTimeUnit =
    primaryLabels?.time_unit ?? compareLabels?.time_unit;

  const labelDeltaT = useMemo(() => {
    const raw = primaryLabels?.delta_t ?? compareLabels?.delta_t ?? null;
    const segs = [
      ...(primaryLabels?.segments ?? []),
      ...(compareLabels?.segments ?? []),
    ];
    return (
      effectiveLabelDeltaT(raw, segs, duration, labelTimeUnit) ?? raw
    );
  }, [primaryLabels, compareLabels, duration, labelTimeUnit]);

  const hasLabels = allSegments.length > 0;
  const hasLabelPaths = Boolean(
    labelPath?.trim() || compareLabelPath?.trim(),
  );

  const labelColorMap = useMemo(
    () => mergeLabelColorOverrides(createLabelColorMap(labelNames), classColorOverrides),
    [labelNames, classColorOverrides],
  );

  useEffect(() => {
    setHiddenLabels(new Set());
    setSoloLabel(null);
    setSegmentHint(null);
  }, [labelPath, compareLabelPath]);

  useEffect(() => {
    if (hasLabels) {
      setOverlayOnSpec(true);
    }
  }, [hasLabels, labelPath, compareLabelPath]);

  return {
    overlayOnSpec,
    setOverlayOnSpec,
    showLanes,
    setShowLanes,
    hiddenLabels,
    setHiddenLabels,
    soloLabel,
    setSoloLabel,
    showProbabilityLabels,
    setShowProbabilityLabels,
    classesFilterOpen,
    setClassesFilterOpen,
    segmentHint,
    setSegmentHint,
    confidenceMin,
    setConfidenceMin,
    allSegments,
    overlaySegments,
    classSidebarEntries,
    classSidebarTotal,
    classSidebarUnfilteredTotal,
    primaryDetectionTotal,
    labelNames,
    toggleClassVisibility,
    labelTimeUnit,
    labelDeltaT,
    hasLabels,
    hasLabelPaths,
    labelColorMap,
  };
}

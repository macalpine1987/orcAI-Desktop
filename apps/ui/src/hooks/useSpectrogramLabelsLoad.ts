import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  fetchLabelsPreview,
  type LabelsPreview,
} from "../api/labels";
import { formatTfBoundsNotice } from "../lib/spectrogramTfBoundsNotice";

type Args = {
  labelPath?: string | null;
  compareLabelPath?: string | null;
  wavPath: string;
  channel: number;
  orcaiParameter?: string | null;
};

export function useSpectrogramLabelsLoad({
  labelPath,
  compareLabelPath,
  wavPath,
  channel,
  orcaiParameter,
}: Args): {
  primaryLabels: LabelsPreview | null;
  compareLabels: LabelsPreview | null;
  labelsError: string | null;
  tfBoundsNotice: string | null;
} {
  const { t } = useTranslation();
  const [primaryLabels, setPrimaryLabels] = useState<LabelsPreview | null>(null);
  const [compareLabels, setCompareLabels] = useState<LabelsPreview | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [tfBoundsNotice, setTfBoundsNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!labelPath) {
      setPrimaryLabels(null);
      if (!compareLabelPath) setLabelsError(null);
      return;
    }
    const ac = new AbortController();
    setPrimaryLabels(null);
    setLabelsError(null);
    void fetchLabelsPreview(labelPath, {
      wavPath,
      channel,
      orcaiParameter: orcaiParameter ?? undefined,
      signal: ac.signal,
    })
      .then((rows) => {
        if (ac.signal.aborted) return;
        setPrimaryLabels(rows);
        setTfBoundsNotice(formatTfBoundsNotice(rows.tf_bounds, t));
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setPrimaryLabels(null);
        setLabelsError(formatUserFacingErrorRequired(err, t));
      });
    return () => {
      ac.abort();
    };
  }, [labelPath, wavPath, channel, orcaiParameter, compareLabelPath, t]);

  useEffect(() => {
    if (!compareLabelPath) {
      setCompareLabels(null);
      return;
    }
    const ac = new AbortController();
    setLabelsError(null);
    void fetchLabelsPreview(compareLabelPath, {
      wavPath,
      channel,
      orcaiParameter: orcaiParameter ?? undefined,
      signal: ac.signal,
    })
      .then((rows) => {
        setCompareLabels(rows);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setCompareLabels(null);
        setLabelsError(formatUserFacingErrorRequired(err, t));
      });
    return () => {
      ac.abort();
    };
  }, [compareLabelPath, wavPath, channel, orcaiParameter]);

  return {
    primaryLabels,
    compareLabels,
    labelsError,
    tfBoundsNotice,
  };
}

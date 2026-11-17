import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Location } from "react-router-dom";
import type { PredictTabId } from "../components/PredictTabs";
import {
  shouldKeepNavLabelOverride,
} from "../lib/resultsStudio";
import {
  loadPredictActiveTab,
  normalizePredictNavTab,
  savePredictActiveTab,
} from "../lib/predictPageSession";
import { persistActiveProjectPredictModel } from "../workspace/project";
import type { PredictSettings } from "../workspace/predictSettings";
import type { DetectionFocusNav } from "../lib/resultsStudio";
import type { AnalysisLabelKind } from "../lib/predictQueueUi";

export type PredictLocationState = {
  tab?: string;
  wavPath?: string;
  labelPath?: string;
  compareLabelPath?: string;
  model?: string;
  modelDir?: string;
  focusStartSec?: number;
  focusEndSec?: number;
  focusLabel?: string;
};

type Options = {
  location: Location;
  activePath: string | null | undefined;
  activeName: string | null | undefined;
  draftSettingsRef: { current: PredictSettings };
  setDraftSettings: Dispatch<SetStateAction<PredictSettings>>;
  setActiveTabState: Dispatch<SetStateAction<PredictTabId>>;
  setSpectrogramLabelOverride: Dispatch<SetStateAction<string | null>>;
  setAnalysisLabelKind: Dispatch<SetStateAction<AnalysisLabelKind>>;
  setAnalysisFocus: Dispatch<SetStateAction<DetectionFocusNav | null>>;
  presetModelGuardRef: { current: boolean };
};

/** Apply router location.state → Predict tabs / focus / model (nav handoff). */
export function usePredictLocationNav({
  location,
  activePath,
  activeName,
  draftSettingsRef,
  setDraftSettings,
  setActiveTabState,
  setSpectrogramLabelOverride,
  setAnalysisLabelKind,
  setAnalysisFocus,
  presetModelGuardRef,
}: Options) {
  const navWavMatchedRef = useRef(false);

  useEffect(() => {
    navWavMatchedRef.current = false;
    const st = (location.state ?? {}) as PredictLocationState;
    const tab = normalizePredictNavTab(st.tab);
    if (tab) {
      setActiveTabState(tab);
      savePredictActiveTab(tab);
    }
    const label = st.labelPath?.trim();
    if (label) {
      setSpectrogramLabelOverride(label);
      const lower = label.toLowerCase();
      if (lower.endsWith("_predicted_filtered.txt")) {
        setAnalysisLabelKind("filtered");
      } else if (lower.endsWith("_predicted.txt")) {
        setAnalysisLabelKind("original");
      }
    }
    if (
      st.focusStartSec != null &&
      Number.isFinite(st.focusStartSec) &&
      st.focusEndSec != null &&
      Number.isFinite(st.focusEndSec)
    ) {
      setAnalysisFocus({
        t0: st.focusStartSec,
        t1: st.focusEndSec,
        label: st.focusLabel,
        nonce: location.key,
      });
    }
  }, [
    location.state,
    location.key,
    setActiveTabState,
    setSpectrogramLabelOverride,
    setAnalysisLabelKind,
    setAnalysisFocus,
  ]);

  useEffect(() => {
    const st = (location.state ?? {}) as PredictLocationState;
    const decision = shouldKeepNavLabelOverride({
      navLabel: st.labelPath?.trim() || undefined,
      navWav: st.wavPath?.trim() || undefined,
      activeWav: activePath ?? undefined,
      matchedNavWav: navWavMatchedRef.current,
    });
    if (decision.matched) navWavMatchedRef.current = true;
    if (decision.keep) return;
    setSpectrogramLabelOverride(null);
  }, [
    activeName,
    activePath,
    location.state,
    location.key,
    setSpectrogramLabelOverride,
  ]);

  useEffect(() => {
    const st = (location.state ?? {}) as PredictLocationState;
    if (st.model === undefined) return;
    presetModelGuardRef.current = false;
    const next: PredictSettings = {
      ...draftSettingsRef.current,
      model: st.model,
      modelDir: st.modelDir?.trim() || undefined,
    };
    draftSettingsRef.current = next;
    setDraftSettings(next);
    void persistActiveProjectPredictModel(st.model, st.modelDir ?? null);
  }, [location.state, draftSettingsRef, presetModelGuardRef, setDraftSettings]);

  return { navWavMatchedRef };
}

export { loadPredictActiveTab };

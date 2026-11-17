import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchModels } from "../api/models";
import { useProjectClassColors } from "../hooks/useProjectClassColors";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePreferences } from "../preferences/PreferencesContext";
import { useSaveNotice } from "../ui/saveNotice";
import {
  emptyDraft,
  projectWizardDataPaths,
  splitSumOk,
} from "./defaults";
import { planForDraft } from "./plan";
import { useWizardCliPreview } from "./useWizardCliPreview";
import {
  type TrainScenario,
  type TrainWizardDraft,
  type WizardStepId,
} from "./types";
import {
  stepIndex,
  type TrainWizardCloseResult,
} from "./wizardHelpers";
export type { TrainWizardCloseResult };
import { useTrainWizardFinetuneCatalog } from "./useTrainWizardFinetuneCatalog";
import { useTrainWizardLaunch } from "./useTrainWizardLaunch";
import { useTrainWizardEquivalences } from "./useTrainWizardEquivalences";
import { useTrainWizardProjectLoad } from "./useTrainWizardProjectLoad";
import { useTrainWizardSnippetEstimate } from "./useTrainWizardSnippetEstimate";
import { useTrainWizardBrowsePath } from "./useTrainWizardBrowsePath";
import {
  canNext as canNextWizard,
  nextBlockedReason as nextBlockedReasonWizard,
} from "./trainWizardNavigation";

type DraftOpts = {
  onClose: (result?: TrainWizardCloseResult) => void;
  initialScenario?: TrainScenario;
  initialBaseModel?: string | null;
};

export function useTrainWizardDraft({
  onClose,
  initialScenario,
  initialBaseModel = null,
}: DraftOpts) {
  const { t, i18n } = useTranslation();
  const { notifySaved } = useSaveNotice();
  const workspace = useWorkspace();
  const { computeDevice } = usePreferences();
  const { engineReady, sidecarPhase, capabilities } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const { colors: classColorOverrides, setColor: setClassColor } =
    useProjectClassColors();
  const projectId = workspace.activeProjectId;
  const projectDir = workspace.projectDir;
  const projectName = workspace.projectName || "";

  const [draft, setDraft] = useState<TrainWizardDraft>(() => {
    const base = emptyDraft(projectName);
    if (initialScenario === "finetune" || initialScenario === "from_scratch") {
      base.scenario = initialScenario;
    }
    if (initialBaseModel?.trim()) {
      base.finetuneBaseModel = initialBaseModel.trim();
      if (!initialScenario) base.scenario = "finetune";
      // m13: Models «Дообучить» opens on step 2 with base preselected.
      if (base.scenario === "finetune") base.step = "data";
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [modelDirTaken, setModelDirTaken] = useState(false);
  const [synonymsOpen, setSynonymsOpen] = useState(false);
  const [hpsOpen, setHpsOpen] = useState(false);
  const [paramsJsonOpen, setParamsJsonOpen] = useState(false);
  const [snippetCalcOpen, setSnippetCalcOpen] = useState(false);
  /** Always-current draft for finetune apply (avoid setState updater side-effects). */
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const {
    equivalencesGenRef,
    synonymRuleCount,
    persistEquivalences,
    synonymsByClass,
    commitClassSynonyms,
  } = useTrainWizardEquivalences({
    projectDir,
    draft,
    setDraft,
    setError,
    t,
  });

  const { pipeline, setPipeline, annotationExampleIds, load } =
    useTrainWizardProjectLoad({
      projectId,
      projectName,
      projectDir,
      setDraft,
      setError,
      equivalencesGenRef,
      t,
    });

  const {
    catalogModels,
    finetuneApplyStatus,
    setFinetuneApplyStatus,
    finetuneLock,
    setFinetuneLock,
    finetuneAppliedKeyRef,
    finetuneErrorRetriesRef,
    selectedBaseModel,
    baseSharesExamples,
  } = useTrainWizardFinetuneCatalog({
    draft,
    setDraft,
    draftRef,
    projectDir,
    sidecarPhase,
    annotationExampleIds,
    setError,
    setNotice,
    t,
  });
  const inheritedLocked = draft.scenario === "finetune";

  const locale = i18n.language?.startsWith("ru") ? "ru" : "en";
  const idx = stepIndex(draft.step);

  /* finetune catalog effects → useTrainWizardFinetuneCatalog */
  useEffect(() => {
    if (!colorPickerFor) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.(".tw-color-pop") || t?.closest?.(".tw-class-swatch")) return;
      setColorPickerFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colorPickerFor]);

  useEffect(() => {
    if (!projectDir || draft.step !== "preflight") {
      setModelDirTaken(false);
      return;
    }
    const name = draft.model.name.trim();
    if (!name) {
      setModelDirTaken(false);
      return;
    }
    let cancelled = false;
    void fetchModels(projectDir)
      .then((models) => {
        if (cancelled) return;
        const needle = `/models/${name}`.toLowerCase();
        const taken = models.some((m) => {
          if (m.kind === "builtin") return false;
          const path = (m.path || "").replace(/\\/g, "/").toLowerCase();
          return (
            m.name === name ||
            m.id === name ||
            path.endsWith(needle) ||
            path.endsWith(`${needle}/`)
          );
        });
        setModelDirTaken(taken);
      })
      .catch(() => {
        if (!cancelled) setModelDirTaken(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectDir, draft.step, draft.model.name]);

  const selectedCalls = useMemo(
    () => draft.classes.filter((c) => c.selected).map((c) => c.id),
    [draft.classes],
  );
  const disabledClasses = useMemo(
    () => draft.classes.filter((c) => !c.selected && c.count > 0),
    [draft.classes],
  );

  const planFull = useMemo(() => planForDraft(draft, { prepOnly: false }), [draft]);
  const planPrep = useMemo(() => planForDraft(draft, { prepOnly: true }), [draft]);
  const planEtaTotalMin = useMemo(
    () => planFull.reduce((s, c) => s + c.etaMin, 0),
    [planFull],
  );
  const rareClass = useMemo(() => {
    const selected = draft.classes.filter((c) => c.selected);
    if (!selected.length) return null;
    const sorted = [...selected].sort((a, b) => a.count - b.count);
    const rare = sorted[0]!;
    if (rare.count >= 200) return null;
    return rare;
  }, [draft.classes]);
  const freqOk =
    draft.spectro.freq_low >= 0 &&
    draft.spectro.freq_high <= 24000 &&
    draft.spectro.freq_low < draft.spectro.freq_high;
  const paramsOk = splitSumOk(draft.spectro) && freqOk;
  const { cmdPreview, cliCopied, onCopyCli } = useWizardCliPreview({
    draft,
    planFull,
    planPrep,
    finetuneLoadFrom: finetuneLock?.path,
    clipboardFailedMessage: t("common.clipboardFailed"),
    onClipboardError: setError,
  });

  const go = (step: WizardStepId) =>
    setDraft((d) => ({
      ...d,
      step,
      // Re-pin paths every time the user opens step 2 (import-source leftovers).
      ...(step === "data" ? projectWizardDataPaths(projectDir) : {}),
    }));

  // If projectDir arrives after mount / user lands on step 2, paths must still
  // resolve under the project — not the folder annotations were copied from.
  useEffect(() => {
    if (draft.step !== "data") return;
    setDraft((d) => {
      const pinned = projectWizardDataPaths(projectDir);
      if (
        d.recordingTableRel === pinned.recordingTableRel &&
        d.annotationsRel === pinned.annotationsRel &&
        d.equivalencesRel === pinned.equivalencesRel
      ) {
        return d;
      }
      return { ...d, ...pinned };
    });
  }, [draft.step, projectDir]);

  const { snippetInventory } = useTrainWizardSnippetEstimate({
    projectId,
    draft,
    draftRef,
    sidecarPhase,
  });

  const canNext = (): boolean =>
    canNextWizard({
      draft,
      engineReady,
      finetuneApplyStatus,
      finetuneLock,
      baseSharesExamples,
      selectedCalls,
      modelDirTaken,
    });

  const nextBlockedReason = nextBlockedReasonWizard({
    draft,
    engineReady,
    finetuneApplyStatus,
    finetuneLock,
    baseSharesExamples,
    catalogModelsLength: catalogModels.length,
    selectedCalls,
    modelDirTaken,
    t,
  });

  /* launch → useTrainWizardLaunch */
  const {
    busy,
    markBusy,
    launchBlockedReason,
    annotationsBlockTrain,
    canLaunch,
    saveDraftParams,
    saveParamsJsonToDisk,
    revealParamsJson,
    launch,
  } = useTrainWizardLaunch({
    projectId,
    projectDir,
    engineReady,
    draft,
    pipeline,
    setPipeline,
    setError,
    setNotice,
    finetuneApplyStatus,
    finetuneLock,
    baseSharesExamples,
    modelDirTaken,
    selectedCalls,
    paramsOk,
    persistEquivalences,
    trackJobInLab,
    notifySaved,
    onClose,
    t,
  });

  const { browsePath } = useTrainWizardBrowsePath({
    projectDir,
    draft,
    setDraft,
    setNotice,
    language: i18n.language,
    t,
  });

  return {
    t,
    i18n,
    notifySaved,
    computeDevice,
    engineReady,
    sidecarPhase,
    capabilities,
    classColorOverrides,
    setClassColor,
    projectId,
    projectDir,
    projectName,
    draft,
    setDraft,
    pipeline,
    setPipeline,
    busy,
    markBusy,
    error,
    setError,
    notice,
    setNotice,
    colorPickerFor,
    setColorPickerFor,
    modelDirTaken,
    synonymsOpen,
    setSynonymsOpen,
    hpsOpen,
    setHpsOpen,
    paramsJsonOpen,
    setParamsJsonOpen,
    snippetCalcOpen,
    setSnippetCalcOpen,
    snippetInventory,
    catalogModels,
    annotationExampleIds,
    finetuneApplyStatus,
    setFinetuneApplyStatus,
    finetuneLock,
    setFinetuneLock,
    finetuneAppliedKeyRef,
    finetuneErrorRetriesRef,
    inheritedLocked,
    locale,
    idx,
    load,
    selectedBaseModel,
    baseSharesExamples,
    selectedCalls,
    disabledClasses,
    planFull,
    planPrep,
    planEtaTotalMin,
    rareClass,
    paramsOk,
    cmdPreview,
    cliCopied,
    onCopyCli,
    go,
    synonymRuleCount,
    persistEquivalences,
    synonymsByClass,
    commitClassSynonyms,
    canNext,
    nextBlockedReason,
    launchBlockedReason,
    annotationsBlockTrain,
    canLaunch,
    saveDraftParams,
    saveParamsJsonToDisk,
    revealParamsJson,
    launch,
    browsePath,
    onClose,
  };
}

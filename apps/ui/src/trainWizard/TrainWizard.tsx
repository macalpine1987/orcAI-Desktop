import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { cancelJob, createJob } from "../api/jobs";
import { fetchModelDetail, fetchModels, type OrcaiModel } from "../api/models";
import { hasRuntimeSidecarBase } from "../api/sidecar";
import {
  fetchProjectAnnotations,
  fetchProjectParameters,
  fetchProjectPipeline,
  saveProjectParameters,
  type ProjectPipeline,
} from "../api/projects";
import { readTextFile, writeTextFile } from "../api/filterPreview";
import { PageHelpButton } from "../components/PageHelpButton";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { useProjectClassColors } from "../hooks/useProjectClassColors";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePreferences } from "../preferences/PreferencesContext";
import { useSaveNotice } from "../ui/saveNotice";
import {
  CLASS_COLOR_PRESETS,
  classColorsEditable,
  normalizeClassColor,
} from "../lib/classColors";
import { joinFsPath } from "../lib/joinFsPath";
import { colorForLabel } from "../lib/labelColors";
import { isAbortError } from "../lib/fetchErrors";
import {
  formatBytesLocalized,
  pipelineBlockedWithoutAnnotations,
} from "../lib/trainPipeline";
import { pickCsvFile, pickDirectory, pickJsonFile } from "../platform/dialog";
import { revealInFileManager } from "../platform/shell";
import {
  CALL_WEIGHT_METHODS,
  draftToHpsParameterJson,
  draftToParameterJson,
  emptyDraft,
  estimateSnippets,
  estimateTrain,
  FACTORY_MODEL,
  FACTORY_SPECTRO,
  formatDurationHm,
  hpsFileNameForModel,
  KERAS_INITIALIZERS,
  parseParameterIntoDraft,
  parseWizardNumber,
  projectWizardDataPaths,
  sanitizeWizardDataPaths,
  isOutsideProjectPath,
  splitSumOk,
  toProjectRelativePath,
  wizardPathAbsolute,
} from "./defaults";
import type { CallWeightsMethod } from "./types";
import {
  finetuneApplyStillSameBase,
  finetuneBaseLeaf,
  finetuneBaseSharesExamples,
  finetuneDataStepCanNext,
  finetuneExampleClassIds,
  finetuneInheritedMatches,
  finetuneLockMatchesSelection,
  finetuneOutputCollidesWithBase,
  finetuneSelectionMatchesBase,
  forceFinetuneLocks,
  formatFinetuneArchLine,
  formatFinetuneInputLine,
  formatFinetuneSpectroLine,
  mergeFinetuneClasses,
  snapshotFinetuneLocks,
  suggestFinetuneModelName,
  type FinetuneLockSnapshot,
} from "./finetune";
import { FinetuneDataStep } from "./FinetuneDataStep";
import { trainEstimateDeviceLabel } from "./trainEstimateDevice";
import { ClassSynonymsInline } from "./ClassSynonymsInline";
import {
  countSynonymRules,
  ensureIdentity,
  formatEquivalencesJson,
  parseEquivalencesJson,
  pickEquivalencesAfterLoad,
  replaceClassSynonyms,
  synonymsByClassFromMap,
  type EquivalencesMap,
} from "./equivalences";
import { buildJobParams, planForDraft } from "./plan";
import { formatPlanCli, formatPlanEta } from "./planCommands";
import { TrainWizardHpsModal } from "./TrainWizardHpsModal";
import { TrainWizardParamsJsonModal } from "./TrainWizardParamsJsonModal";
import { TrainWizardSnippetCalcModal } from "./TrainWizardSnippetCalcModal";
import { TrainWizardSynonymsModal } from "./TrainWizardSynonymsModal";
import {
  WIZARD_STEP_IDS,
  type ClassStatRow,
  type TrainScenario,
  type TrainWizardDraft,
  type WizardStepId,
} from "./types";

type Props = {
  onClose: (result?: {
    planId?: string;
    firstJobId?: string;
    jobCount?: number;
    includesHpsearch?: boolean;
    commands?: string[];
  }) => void;
  /** Deep-link from Models card: open on finetune card. */
  initialScenario?: TrainScenario;
  /** Base model id or path for finetune. */
  initialBaseModel?: string | null;
};

function stepIndex(id: WizardStepId): number {
  return WIZARD_STEP_IDS.indexOf(id);
}

function emptyAnnotationsFallback(projectId: string): import("../api/projects").ProjectAnnotations {
  return {
    project_id: projectId,
    classes: [],
    classes_source: "annotations",
    has_mask_columns: false,
    rows: [],
    class_stats: [],
    unlisted_labels: [],
    annotated_count: 0,
    total_count: 0,
  };
}

function wizardErrorMessage(err: unknown, fallback: string): string | null {
  if (isAbortError(err)) return null;
  return err instanceof Error ? err.message : fallback;
}

export function TrainWizard({
  onClose,
  initialScenario,
  initialBaseModel = null,
}: Props) {
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
  const [pipeline, setPipeline] = useState<ProjectPipeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cliCopied, setCliCopied] = useState(false);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [modelDirTaken, setModelDirTaken] = useState(false);
  const [synonymsOpen, setSynonymsOpen] = useState(false);
  const [hpsOpen, setHpsOpen] = useState(false);
  const [paramsJsonOpen, setParamsJsonOpen] = useState(false);
  const [snippetCalcOpen, setSnippetCalcOpen] = useState(false);
  const [catalogModels, setCatalogModels] = useState<OrcaiModel[]>([]);
  /** Annotation class ids that actually occur. ``null`` until that scan finishes. */
  const [annotationExampleIds, setAnnotationExampleIds] = useState<string[] | null>(
    null,
  );
  /**: base apply status — from_scratch never uses this. */
  const [finetuneApplyStatus, setFinetuneApplyStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [finetuneLock, setFinetuneLock] = useState<FinetuneLockSnapshot | null>(
    null,
  );
  /** Bumped to re-run base apply after a recoverable error. */
  const [finetuneApplyNonce, setFinetuneApplyNonce] = useState(0);
  /** Selection key last successfully applied — avoids path-rewrite re-entry loop. */
  const finetuneAppliedKeyRef = useRef<string | null>(null);
  const finetuneErrorRetriesRef = useRef(0);
  /** Always-current draft for finetune apply (avoid setState updater side-effects). */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Bumped on every local equivalences edit — load must not clobber newer maps. */
  const equivalencesGenRef = useRef(0);
  /** Serialize disk writes so an older persist cannot finish after a newer one. */
  const equivalencesPersistChainRef = useRef(Promise.resolve());
  const inheritedLocked = draft.scenario === "finetune";


  const locale = i18n.language?.startsWith("ru") ? "ru" : "en";
  const idx = stepIndex(draft.step);

  const load = useCallback(async (opts?: { signal?: AbortSignal }) => {
    if (!projectId) return;
    const signal = opts?.signal;
    const eqGenAtStart = equivalencesGenRef.current;
    setError(null);
    try {
      let annotationsKnown = true;
      const [ann, params, pipe] = await Promise.all([
        fetchProjectAnnotations(projectId).catch((err) => {
          // Remount/navigation: let the outer catch exit quietly.
          if (signal?.aborted) throw err;
          // Timeout / transient abort: keep wizard usable with empty/fallback classes.
          annotationsKnown = false;
          return emptyAnnotationsFallback(projectId);
        }),
        fetchProjectParameters(projectId).catch(() => null),
        fetchProjectPipeline(projectId).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setPipeline(pipe);
      let loadedEq: EquivalencesMap = {};
      if (projectDir) {
        try {
          const eqPath = await joinFsPath(projectDir, "call_equivalences.json");
          const eqText = await readTextFile(eqPath);
          if (eqText) loadedEq = parseEquivalencesJson(eqText);
        } catch {
          /* optional file */
        }
      }
      if (signal?.aborted) return;
      if (annotationsKnown) {
        const stats = ann.class_stats ?? [];
        const counted =
          stats.length > 0
            ? stats
            : ann.classes.map((id) => {
                let count = 0;
                for (const row of ann.rows) {
                  const n = row.counts[id];
                  if (typeof n === "number" && n > 0) count += n;
                }
                return { id, count };
              });
        setAnnotationExampleIds(
          finetuneExampleClassIds(counted, ann.unlisted_labels ?? []),
        );
      }
      setDraft((prev) => {
        let next = emptyDraft(projectName);
        next = {
          ...next,
          step: prev.step,
          scenario: prev.scenario,
          finetuneBaseModel: prev.finetuneBaseModel,
          includeHpsearch: prev.includeHpsearch,
          hps: { ...prev.hps },
          testAfterTrain: prev.testAfterTrain,
          compression: prev.compression,
          // Step 2 always shows project layout (never the annotation import source).
          ...projectWizardDataPaths(projectDir),
          model: { ...prev.model },
          spectro: { ...prev.spectro },
        };
        const stats = (ann as { class_stats?: Array<{
          id: string;
          count: number;
          recordings: number;
          duration_sec: number;
          coverage: number;
        }> }).class_stats;
        const rows: ClassStatRow[] = (stats && stats.length
          ? stats
          : ann.classes.map((id) => {
              let count = 0;
              let recordings = 0;
              for (const row of ann.rows) {
                const n = row.counts[id];
                if (typeof n === "number" && n > 0) {
                  count += n;
                  recordings += 1;
                }
              }
              return { id, count, recordings, duration_sec: 0, coverage: 0 };
            })
        ).map((s) => ({
          id: s.id,
          count: s.count,
          recordings: s.recordings,
          duration_sec: s.duration_sec,
          coverage: s.coverage,
          selected: true,
        }));
        // Prefer previous selection if same ids
        if (prev.classes.length) {
          const sel = new Set(prev.classes.filter((c) => c.selected).map((c) => c.id));
          for (const r of rows) r.selected = sel.has(r.id);
        }
        next.classes = rows.length ? rows : prev.classes;
        if (params?.text && prev.scenario !== "finetune") {
          try {
            const data = JSON.parse(params.text) as Record<string, unknown>;
            next = parseParameterIntoDraft(next, data);
          } catch {
            /* keep defaults */
          }
        } else if (prev.scenario === "finetune" && prev.classes.length) {
          // Rematch annotation counts onto base call order (even if apply ran first
          // with empty stats → all zeros).
          const baseCalls = prev.classes.map((c) => c.id);
          if (baseCalls.length) {
            next.classes = mergeFinetuneClasses(baseCalls, rows.length ? rows : next.classes);
            next.spectro = { ...prev.spectro };
            next.model = {
              ...prev.model,
            };
          }
        }
        next.equivalencesMap = pickEquivalencesAfterLoad({
          loadedEq,
          prevMap: prev.equivalencesMap ?? {},
          genAtLoadStart: eqGenAtStart,
          genNow: equivalencesGenRef.current,
        });
        // Pin again after parameter parse — step-2 paths are never taken from JSON.
        next = { ...next, ...projectWizardDataPaths(projectDir) };
        next.step = prev.step;
        next.scenario = prev.scenario;
        next.includeHpsearch = prev.includeHpsearch;
        next.hps = { ...prev.hps };
        next.testAfterTrain = prev.testAfterTrain;
        return next;
      });
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, projectName, projectDir]);

  useEffect(() => {
    const ac = new AbortController();
    void load({ signal: ac.signal });
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    if (!projectDir) {
      setCatalogModels([]);
      return;
    }
    // Models API needs sidecar; retry when it comes up so trained models appear.
    if (sidecarPhase !== "running") {
      return;
    }
    let cancelled = false;
    void fetchModels(projectDir)
      .then((list) => {
        if (!cancelled) setCatalogModels(list);
      })
      .catch(() => {
        if (!cancelled) setCatalogModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectDir, sidecarPhase, draft.scenario]);

  const selectedBaseModel = useMemo(
    () =>
      catalogModels.find(
        (m) => m.path === draft.finetuneBaseModel || m.id === draft.finetuneBaseModel,
      ) ?? null,
    [catalogModels, draft.finetuneBaseModel],
  );
  const baseSharesExamples =
    annotationExampleIds === null || !selectedBaseModel
      ? true
      : finetuneBaseSharesExamples(selectedBaseModel.calls, annotationExampleIds);

  useEffect(() => {
    if (draft.scenario !== "finetune") return;
    if (annotationExampleIds === null || !selectedBaseModel) return;
    if (finetuneBaseSharesExamples(selectedBaseModel.calls, annotationExampleIds)) return;
    finetuneAppliedKeyRef.current = null;
    setFinetuneLock(null);
    setFinetuneApplyStatus("idle");
    setDraft((d) =>
      d.finetuneBaseModel ? { ...d, finetuneBaseModel: null } : d,
    );
    setNotice(t("wizard.finetuneNoSharedClassesNote"));
  }, [annotationExampleIds, draft.scenario, selectedBaseModel, t]);

  /** Apply base model parameter → locked spectro / architecture / calls. */
  useEffect(() => {
    if (draft.scenario !== "finetune") {
      finetuneAppliedKeyRef.current = null;
      setFinetuneApplyStatus("idle");
      setFinetuneLock(null);
      return;
    }
    const baseId = draft.finetuneBaseModel?.trim();
    if (!baseId || !projectDir) {
      finetuneAppliedKeyRef.current = null;
      setFinetuneApplyStatus("idle");
      setFinetuneLock(null);
      return;
    }
    const applyKey = `${projectDir}::${baseId}`;
    // Selection/project changed — drop stale lock before any wait-gate.
    if (
      finetuneAppliedKeyRef.current !== applyKey &&
      finetuneLock &&
      !finetuneLockMatchesSelection(finetuneLock, baseId)
    ) {
      setFinetuneLock(null);
    }
    // Same selection already applied — do not restart (path rewrite used to loop here).
    if (
      finetuneAppliedKeyRef.current === applyKey &&
      finetuneLockMatchesSelection(finetuneLock, baseId)
    ) {
      if (finetuneApplyStatus !== "ready") setFinetuneApplyStatus("ready");
      return;
    }
    // Lock already matches selection (e.g. after Strict Mode remount) — keep Next.
    if (
      finetuneLockMatchesSelection(finetuneLock, baseId) &&
      finetuneApplyStatus === "ready"
    ) {
      finetuneAppliedKeyRef.current = applyKey;
      return;
    }

    // Detail API needs a bound sidecar URL. Stay idle with need-engine hint
    // until runtime is up (not «loading» / applying).
    if (sidecarPhase !== "running" || !hasRuntimeSidecarBase()) {
      setFinetuneApplyStatus("idle");
      return;
    }

    let cancelled = false;
    setFinetuneApplyStatus("loading");
    void (async () => {
      try {
        // Resolve taken names before suggesting (-ft / -ftN); don't wait on a
        // separate catalog effect that may still be empty (TRN-04).
        let taken = catalogModels.map((m) => m.name || m.id).filter(Boolean);
        try {
          const list = await fetchModels(projectDir);
          if (cancelled) return;
          setCatalogModels(list);
          taken = list.map((m) => m.name || m.id).filter(Boolean);
        } catch {
          // Empty catalog → cannot safely suggest -ft; soft-retry via error effect.
          if (!taken.length) {
            if (cancelled) return;
            setFinetuneApplyStatus("error");
            return;
          }
          /* keep prior taken */
        }
        const detail = await fetchModelDetail(baseId, projectDir);
        const calls = detail.calls?.length ? [...detail.calls] : [];
        const suggested = suggestFinetuneModelName(
          detail.name || detail.id,
          taken,
        );
        const paramDoc: Record<string, unknown> = {
          architecture: detail.architecture ?? undefined,
          spectrogram: detail.spectrogram ?? {},
          snippets: detail.snippets ?? {},
          model: detail.model ?? {},
          calls,
          name: suggested,
        };
        const basePath = detail.path || baseId;

        // Build from draftRef — never rely on setState updater side-effects
        // (Strict Mode cancel used to skip lock/ready and leave Next stuck).
        const prev = draftRef.current;
        if (prev.scenario !== "finetune") {
          if (!cancelled) setFinetuneApplyStatus("idle");
          return;
        }
        const sel = prev.finetuneBaseModel?.trim() ?? "";
        if (
          !finetuneSelectionMatchesBase(sel, baseId) &&
          !finetuneSelectionMatchesBase(sel, basePath)
        ) {
          if (!cancelled) {
            setFinetuneApplyStatus((s) => (s === "loading" ? "idle" : s));
          }
          return;
        }
        let next = parseParameterIntoDraft(prev, paramDoc);
        if (calls.length) {
          next = {
            ...next,
            classes: mergeFinetuneClasses(calls, prev.classes),
          };
        }
        const keepName =
          Boolean(prev.model.name.trim()) &&
          !finetuneOutputCollidesWithBase(prev.model.name, basePath);
        next = {
          ...next,
          // Keep the user's selection string — rewriting to absolute path
          // retriggered this effect and left Next stuck on «loading».
          finetuneBaseModel: sel || baseId,
          model: {
            ...next.model,
            name: keepName ? prev.model.name : suggested,
            epochs: prev.model.epochs,
            batch_size: prev.model.batch_size,
            learning_rate: prev.model.learning_rate,
            early_stopping_patience: prev.model.early_stopping_patience,
            reduce_lr_patience: prev.model.reduce_lr_patience,
            reduce_lr_factor: prev.model.reduce_lr_factor,
            reduce_lr_min_learning_rate: prev.model.reduce_lr_min_learning_rate,
            call_weights: prev.model.call_weights,
            monitor: prev.model.monitor,
            shuffle: prev.model.shuffle,
            seed: prev.model.seed,
            n_batch_train: prev.model.n_batch_train,
            n_batch_val: prev.model.n_batch_val,
            n_batch_test: prev.model.n_batch_test,
          },
        };

        // Commit even if this effect was cleaned up (Strict Mode), as long as
        // the user still has the same base selected.
        const cur = draftRef.current;
        const stillSame = finetuneApplyStillSameBase({
          scenario: cur.scenario,
          selection: cur.finetuneBaseModel,
          applyBaseId: baseId,
          applyBasePath: basePath,
        });
        if (!stillSame) {
          if (!cancelled) {
            setFinetuneApplyStatus((s) => (s === "loading" ? "idle" : s));
          }
          return;
        }
        finetuneAppliedKeyRef.current = applyKey;
        finetuneErrorRetriesRef.current = 0;
        setFinetuneLock(snapshotFinetuneLocks(next, basePath, calls));
        setFinetuneApplyStatus("ready");
        setDraft(next);
      } catch (err) {
        if (cancelled) return;
        const msg = wizardErrorMessage(err, String(err));
        const engineDown =
          !hasRuntimeSidecarBase() || sidecarPhase !== "running";
        const networkish =
          msg != null &&
          /not bound yet|Failed to fetch|NetworkError|Load failed|timed out|ECONNREFUSED/i.test(
            msg,
          );
        // Engine not up yet — keep idle; effect re-runs when phase flips.
        if (engineDown) {
          setFinetuneApplyStatus("idle");
          return;
        }
        // Transient network while engine is up → soft-retry via error effect.
        if (networkish && finetuneErrorRetriesRef.current < 2) {
          setFinetuneApplyStatus("error");
          return;
        }
        finetuneAppliedKeyRef.current = null;
        setFinetuneLock(null);
        setFinetuneApplyStatus("error");
        if (msg) setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
    // sidecarPhase: re-enter after wait-gate; early return when lock+appliedKey
    // already ready so phase flickers do not pin Next on «loading».
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogModels read at apply time
  }, [
    draft.scenario,
    draft.finetuneBaseModel,
    projectDir,
    sidecarPhase,
    finetuneApplyNonce,
  ]);

  /** One soft retry after a hard apply error (e.g. detail raced the catalog). */
  useEffect(() => {
    if (finetuneApplyStatus !== "error") return;
    if (sidecarPhase !== "running" || !hasRuntimeSidecarBase()) return;
    if (draft.scenario !== "finetune") return;
    if (!draft.finetuneBaseModel?.trim() || !projectDir) return;
    if (finetuneErrorRetriesRef.current >= 2) return;
    const t = window.setTimeout(() => {
      finetuneErrorRetriesRef.current += 1;
      finetuneAppliedKeyRef.current = null;
      setFinetuneApplyNonce((n) => n + 1);
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    finetuneApplyStatus,
    sidecarPhase,
    draft.scenario,
    draft.finetuneBaseModel,
    projectDir,
  ]);

  // After a hard error budget is spent, re-apply once when sidecar becomes running again.
  const prevSidecarPhaseRef = useRef(sidecarPhase);
  useEffect(() => {
    const prev = prevSidecarPhaseRef.current;
    prevSidecarPhaseRef.current = sidecarPhase;
    if (draft.scenario !== "finetune") return;
    if (!draft.finetuneBaseModel?.trim() || !projectDir) return;
    if (finetuneApplyStatus !== "error") return;
    if (prev === "running" || sidecarPhase !== "running") return;
    if (!hasRuntimeSidecarBase()) return;
    finetuneErrorRetriesRef.current = 0;
    finetuneAppliedKeyRef.current = null;
    setFinetuneApplyNonce((n) => n + 1);
  }, [
    sidecarPhase,
    finetuneApplyStatus,
    draft.scenario,
    draft.finetuneBaseModel,
    projectDir,
  ]);

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
  const cmdPreview = useMemo(() => {
    if (draft.step === "scenario") {
      return formatPlanCli(planFull.length ? planFull : planPrep);
    }
    if (draft.step === "data") {
      if (draft.scenario === "finetune" && draft.finetuneBaseModel) {
        const loadFrom = finetuneLock?.path || draft.finetuneBaseModel;
        const lm = ` --load_model --load_model_from ${loadFrom}`;
        return `orcai train tvt_data/ models/ -p orcai_parameter.json${lm}`;
      }
      const table = draft.recordingTableRel || "recording_table.csv";
      const ann = draft.annotationsRel || "annotations/";
      const eq = draft.equivalencesRel || "call_equivalences.json";
      return `orcai create-label-arrays ${table} recording_data/ -bda ${ann} -ce ${eq} -p orcai_parameter.json`;
    }
    if (draft.step === "spectro") {
      return `orcai create-spectrograms ${draft.recordingTableRel} recording_data/ -p orcai_parameter.json`;
    }
    if (draft.step === "model") {
      const loadFrom = finetuneLock?.path || draft.finetuneBaseModel;
      const lm =
        draft.scenario === "finetune" && loadFrom
          ? ` --load_model --load_model_from ${loadFrom}`
          : "";
      return `orcai train tvt_data/ models/ -p orcai_parameter.json${lm}`;
    }
    if (draft.step === "preflight") {
      return "";
    }
    return "";
  }, [draft, planFull, planPrep, finetuneLock]);

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

  const synonymRuleCount = useMemo(
    () => countSynonymRules(draft.equivalencesMap),
    [draft.equivalencesMap],
  );

  const persistEquivalences = useCallback(
    async (map?: EquivalencesMap, fromDraft?: TrainWizardDraft) => {
      if (!projectDir) return;
      equivalencesGenRef.current += 1;
      const genAtPersist = equivalencesGenRef.current;
      const src = fromDraft ?? draft;
      const run = async () => {
        // Persist only selected classes — matches create-label-arrays / orcai_parameter.calls.
        // QA-M4: launch passes launchDraft so -ce matches parameter.calls after locks.
        const selected = src.classes.filter((c) => c.selected).map((c) => c.id);
        const ids =
          selected.length > 0
            ? selected
            : src.classes.map((c) => c.id);
        const merged = ensureIdentity(map ?? src.equivalencesMap, ids);
        const eqRel = (src.equivalencesRel || "call_equivalences.json").replace(
          /^\.\//,
          "",
        );
        const path = await joinFsPath(projectDir, eqRel);
        await writeTextFile(path, formatEquivalencesJson(merged));
        // Do not clobber a newer in-memory edit that landed while we were writing.
        setDraft((d) =>
          equivalencesGenRef.current !== genAtPersist
            ? d
            : { ...d, equivalencesMap: merged },
        );
      };
      const queued = equivalencesPersistChainRef.current.then(run, run);
      equivalencesPersistChainRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      await queued;
    },
    [projectDir, draft],
  );

  const synonymsByClass = useMemo(
    () =>
      synonymsByClassFromMap(
        draft.equivalencesMap,
        draft.classes.map((c) => c.id),
      ),
    [draft.equivalencesMap, draft.classes],
  );

  const commitClassSynonyms = useCallback(
    (classId: string, synonyms: string[]) => {
      const classIds = draft.classes.map((c) => c.id);
      // Mark dirty before setState so an in-flight load cannot win the race.
      equivalencesGenRef.current += 1;
      let nextMap: EquivalencesMap | null = null;
      setDraft((d) => {
        nextMap = replaceClassSynonyms(
          d.equivalencesMap,
          classId,
          synonyms,
          classIds,
        );
        return { ...d, equivalencesMap: nextMap };
      });
      if (nextMap) {
        void persistEquivalences(nextMap).catch((err) => {
          const msg = wizardErrorMessage(err, String(err));
          if (msg) setError(msg);
        });
      }
    },
    [draft.classes, persistEquivalences],
  );

  const onCopyCli = async () => {
    if (!cmdPreview.trim()) return;
    try {
      await navigator.clipboard.writeText(cmdPreview);
      setCliCopied(true);
      window.setTimeout(() => setCliCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const finetuneReady = (): boolean =>
    finetuneDataStepCanNext({
      baseModel: draft.finetuneBaseModel,
      engineReady,
      applyStatus: finetuneApplyStatus,
      lock: finetuneLock,
      sharesExamples: baseSharesExamples,
    });

  const canNext = (): boolean => {
    if (draft.step === "data") {
      if (draft.scenario === "finetune") {
        // QA-M1: same predicate as Launch (real engineReady + matching lock).
        return finetuneReady();
      }
      return selectedCalls.length > 0;
    }
    if (draft.step === "spectro") return splitSumOk(draft.spectro);
    if (draft.step === "model") {
      if (!draft.model.name.trim()) return false;
      if (
        draft.scenario === "finetune" &&
        finetuneOutputCollidesWithBase(
          draft.model.name,
          finetuneLock?.path || draft.finetuneBaseModel,
        )
      ) {
        return false;
      }
      if (draft.scenario === "finetune" && modelDirTaken) return false;
      return true;
    }
    return true;
  };

  const nextBlockedReason = (() => {
    if (canNext()) return null;
    if (draft.step === "data" && draft.scenario === "finetune") {
      if (!engineReady) {
        return t("wizard.finetuneNeedEngine");
      }
      if (!draft.finetuneBaseModel?.trim()) {
        if (!catalogModels.length) return t("wizard.finetuneNeedCatalog");
        return t("wizard.finetuneNeedBase");
      }
      if (!baseSharesExamples) return t("wizard.finetuneNoSharedClassesNote");
      if (finetuneApplyStatus === "loading") {
        return t("wizard.finetuneApplying");
      }
      if (finetuneApplyStatus === "error") {
        return t("wizard.finetuneNeedBaseReady");
      }
      if (!finetuneLockMatchesSelection(finetuneLock, draft.finetuneBaseModel)) {
        return t("wizard.finetuneNeedBaseReady");
      }
    }
    if (draft.step === "data" && !selectedCalls.length) return t("wizard.needClasses");
    if (draft.step === "model" && !draft.model.name.trim()) {
      return t("wizard.needModelName");
    }
    if (
      draft.step === "model" &&
      draft.scenario === "finetune" &&
      finetuneOutputCollidesWithBase(
        draft.model.name,
        finetuneLock?.path || draft.finetuneBaseModel,
      )
    ) {
      return t("wizard.finetuneOverwriteBase");
    }
    if (draft.step === "model" && draft.scenario === "finetune" && modelDirTaken) {
      return t("wizard.finetuneNameTaken");
    }
    return null;
  })();

  const diskBlocked = pipeline?.readiness.disk.state === "off";
  const launchBlockedReason = (() => {
    if (!engineReady) return t("wizard.needEngine");
    if (pipeline?.active_plan) return t("wizard.planBusy");
    if (draft.scenario === "finetune") {
      // QA-M1: do not require applyStatus === "ready" — matching lock is enough
      // (same as data-step Next / Strict Mode).
      if (!finetuneReady()) {
        if (!draft.finetuneBaseModel?.trim()) return t("wizard.finetuneNeedBase");
        if (finetuneApplyStatus === "loading") return t("wizard.finetuneApplying");
        return t("wizard.finetuneNeedBaseReady");
      }
      // All-zero new examples: warn in UI, still allow launch (user may proceed).
      if (
        finetuneOutputCollidesWithBase(draft.model.name, draft.finetuneBaseModel)
      ) {
        return t("wizard.finetuneOverwriteBase");
      }
      if (modelDirTaken) return t("wizard.finetuneNameTaken");
    }
    if (!selectedCalls.length) return t("wizard.needClasses");
    if (diskBlocked) return t("wizard.diskBlocked");
    if (!paramsOk) return t("wizard.checkParamsDetailBad");
    if (!draft.model.name.trim()) return t("wizard.needModelName");
    return null;
  })();
  const annotationsBlockTrain = pipelineBlockedWithoutAnnotations(pipeline);
  const canLaunch = !busy && !launchBlockedReason && !annotationsBlockTrain;

  const saveDraftParams = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, String(err));
      if (msg) setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const saveParamsJsonToDisk = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, String(err));
      if (msg) setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const revealParamsJson = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const text = `${JSON.stringify(draftToParameterJson(draft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      const params = await fetchProjectParameters(projectId);
      if (params.path) {
        await revealInFileManager(params.path);
      }
      setNotice(t("wizard.draftSaved"));
      notifySaved(t("wizard.draftSaved"));
    } catch (err) {
      const msg = wizardErrorMessage(err, String(err));
      if (msg) setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const launch = async (prepOnly: boolean) => {
    if (!projectId || !projectDir || !engineReady) {
      setError(t("wizard.needEngine"));
      return;
    }
    // Fresh check — board poll may lag behind a just-started plan.
    // Fail-closed: never launch when we cannot confirm the board is free.
    try {
      const live = await fetchProjectPipeline(projectId);
      setPipeline(live);
      if (live.active_plan) {
        setError(t("wizard.planBusy"));
        return;
      }
      if (pipelineBlockedWithoutAnnotations(live)) return;
    } catch (err) {
      const msg = wizardErrorMessage(err, t("wizard.planCheckFailed"));
      setError(msg ?? t("wizard.planCheckFailed"));
      return;
    }
    // INV-2: finetune-only guards — from_scratch path unchanged below.
    let launchDraft = draft;
    if (draft.scenario === "finetune") {
      if (!finetuneReady() || !finetuneLock) {
        setError(
          !draft.finetuneBaseModel?.trim()
            ? t("wizard.finetuneNeedBase")
            : !baseSharesExamples
              ? t("wizard.finetuneNoSharedClassesNote")
              : t("wizard.finetuneNeedBaseReady"),
        );
        return;
      }
      launchDraft = {
        ...forceFinetuneLocks(draft, finetuneLock),
        // Jobs need the resolved model directory; keep React selection stable.
        finetuneBaseModel: finetuneLock.path,
      };
      if (
        !finetuneInheritedMatches(
          launchDraft,
          finetuneLock.spectro,
          finetuneLock.model,
        )
      ) {
        setError(t("wizard.finetuneMismatch"));
        return;
      }
      if (
        finetuneOutputCollidesWithBase(
          launchDraft.model.name,
          finetuneLock.path,
        )
      ) {
        setError(t("wizard.finetuneOverwriteBase"));
        return;
      }
      if (modelDirTaken) {
        setError(t("wizard.finetuneNameTaken"));
        return;
      }
      // Do not setDraft(path) here — that retriggered apply and blocked Next.
    }
    if (!launchDraft.classes.some((c) => c.selected)) {
      setError(t("wizard.needClasses"));
      return;
    }
    const disk = pipeline?.readiness.disk;
    if (disk && disk.state === "off") {
      setError(t("wizard.diskBlocked"));
      return;
    }
    setBusy(true);
    setError(null);
    const createdJobIds: string[] = [];
    try {
      await persistEquivalences(undefined, launchDraft);
      const text = `${JSON.stringify(draftToParameterJson(launchDraft), null, 4)}\n`;
      await saveProjectParameters(projectId, text);
      if (launchDraft.includeHpsearch && !prepOnly) {
        const hpsRel = hpsFileNameForModel(launchDraft.model.name);
        const hpsAbs = await joinFsPath(projectDir, hpsRel);
        const hpsText = `${JSON.stringify(draftToHpsParameterJson(launchDraft.hps), null, 4)}\n`;
        await writeTextFile(hpsAbs, hpsText);
      }
      const paramPath =
        pipeline?.parameter_path ||
        (await joinFsPath(projectDir, pipeline?.parameter_filename || "orcai_parameter.json"));
      const plan = planForDraft(launchDraft, { prepOnly });
      const planId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `plan-${Date.now()}`;
      for (const step of plan) {
        const params = await buildJobParams(launchDraft, projectDir, paramPath, step.id);
        const job = await createJob(step.id, { ...params, plan_id: planId });
        createdJobIds.push(job.id);
        trackJobInLab(job);
      }
      setNotice(t("wizard.launched", { count: plan.length }));
      notifySaved(t("wizard.launched", { count: plan.length }));
      const commands = plan.map((step) => step.id);
      onClose({
        planId,
        firstJobId: createdJobIds[0],
        jobCount: plan.length,
        includesHpsearch: commands.includes("hpsearch"),
        commands,
      });
    } catch (err) {
      // Cancel every created job — cascade from head alone misses running siblings.
      for (const id of createdJobIds) {
        try {
          await cancelJob(id);
        } catch {
          /* best-effort rollback */
        }
      }
      const msg = wizardErrorMessage(err, String(err));
      if (msg) setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <div className="tw-page">
        <p className="pp-empty">
          {t("pipeline.noProject")}{" "}
          <Link to="/projects" className="underline">
            {t("nav.projects")}
          </Link>
        </p>
      </div>
    );
  }

  const annotated = pipeline?.readiness.annotations.annotated ?? draft.classes.reduce(
    (n, c) => Math.max(n, c.recordings),
    0,
  );
  const totalRec = pipeline?.readiness.recordings.rows ?? 0;
  const skippedRec = Math.max(0, totalRec - annotated);
  const est = estimateSnippets(Math.max(1, annotated), draft.spectro);
  const trainEst = estimateTrain(draft.model);
  const colorsEditable = classColorsEditable(draft.scenario);

  const browsePath = async (
    field: "recordingTableRel" | "annotationsRel" | "equivalencesRel",
  ) => {
    if (!projectDir) return;
    // Open the native dialog inside the project (not the last annotation-import folder).
    const startAt = wizardPathAbsolute(projectDir, draft[field]).replace(
      /\/+$/,
      "",
    );
    let picked: string | null = null;
    if (field === "recordingTableRel") {
      picked = await pickCsvFile(t("wizard.recordingTable"), startAt);
    } else if (field === "annotationsRel") {
      picked = await pickDirectory(t("wizard.annotations"), startAt);
    } else {
      picked = await pickJsonFile(t("wizard.equivalences"), startAt);
    }
    if (!picked) return;
    if (isOutsideProjectPath(picked, projectDir)) {
      setNotice(
        (i18n.language || "en").toLowerCase().startsWith("ru")
          ? "Путь вне проекта не используется — оставлены recording_table.csv / annotations / call_equivalences.json внутри проекта."
          : "Path outside the project ignored — kept recording_table.csv / annotations / call_equivalences.json inside the project.",
      );
      setDraft((d) => ({
        ...d,
        ...projectWizardDataPaths(projectDir),
      }));
      return;
    }
    let rel = toProjectRelativePath(picked, projectDir);
    if (field === "annotationsRel" && !rel.endsWith("/")) rel = `${rel}/`;
    setDraft((d) => ({ ...d, [field]: rel }));
  };

  return (
    <div className="tw-page">
      <div className="studio-panel tw-work-panel">
        <div className="tw-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">
              {inheritedLocked
                ? t("wizard.titleFinetune")
                : t("wizard.title")}
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {inheritedLocked && draft.step === "data"
                ? t("wizard.stepSubtitle.dataFinetune")
                : t(`wizard.stepSubtitle.${draft.step}`)}
            </p>
          </div>
          <div className="tw-header-actions">
            <PageHelpButton topic="train.wizard" hint={t("help.hint.train")} />
          </div>
        </div>

        <div className="tw-body">
          <aside className="tw-nav">
            <ol className="tw-steps">
              {WIZARD_STEP_IDS.map((id, i) => {
                const done = i < idx;
                const active = id === draft.step;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={clsx("tw-step", active && "is-active", done && "is-done")}
                      onClick={() => i <= idx && go(id)}
                    >
                      <span className="tw-step-mark" aria-hidden>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="tw-step-label">
                        <span className="tw-step-title">{t(`wizard.nav.${id}`)}</span>
                        <span className="tw-step-hint">
                          {inheritedLocked && id === "data"
                            ? t("wizard.navHint.dataFinetune")
                            : t(`wizard.navHint.${id}`)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="tw-scenario-card">
              <div className="tw-card-kicker">{t("wizard.scenarioSummary")}</div>
              <div className="tw-scenario-name">
                {inheritedLocked
                  ? t("wizard.finetuneScenarioName")
                  : t(`wizard.scenarios.${draft.scenario}.title`)}
              </div>
              <div
                className={clsx(
                  "tw-scenario-meta",
                  inheritedLocked && "is-finetune",
                )}
              >
                {inheritedLocked
                  ? t("wizard.finetuneScenarioMeta", {
                      base: finetuneBaseLeaf(draft.finetuneBaseModel) || "—",
                    })
                  : (
                      <>
                        {projectName}
                        <br />
                        {t("wizard.recSummary", { total: totalRec, annotated })}
                      </>
                    )}
              </div>
            </div>
          </aside>

          <section className="tw-main">
            {error ? <p className="tw-error">{error}</p> : null}
            {notice ? <p className="tw-notice">{notice}</p> : null}

            {draft.step === "scenario" ? (
              <div className="tw-scenario-list">
                <h2 className="tw-main-kicker">{t("wizard.step1Title")}</h2>
                <div
                  className="tw-scenario-grid"
                  role="radiogroup"
                  aria-label={t("wizard.step1Title")}
                >
                  {(
                    ["from_scratch", "finetune"] as TrainScenario[]
                  ).map((id) => {
                    const selected = draft.scenario === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={clsx("ps-focus-card", selected && "is-selected")}
                        onClick={() => {
                          if (id === draft.scenario) return;
                          if (id === "from_scratch" && draft.scenario === "finetune") {
                            finetuneAppliedKeyRef.current = null;
                            setFinetuneLock(null);
                            setFinetuneApplyStatus("idle");
                            setDraft((d) => ({
                              ...d,
                              scenario: id,
                              finetuneBaseModel: null,
                              includeHpsearch: false,
                            }));
                            // Re-load project parameter / annotation classes (from_scratch path).
                            void load();
                            return;
                          }
                          if (id === "finetune") {
                            setDraft((d) => ({
                              ...d,
                              scenario: id,
                              includeHpsearch: false,
                              step: d.finetuneBaseModel ? "data" : "scenario",
                            }));
                            return;
                          }
                          setDraft((d) => ({ ...d, scenario: id }));
                        }}
                      >
                        <span className="ps-focus-card-head">
                          <span className="ps-radio" aria-hidden />
                          {t(`wizard.scenarios.${id}.title`)}
                        </span>
                        <p className="ps-focus-card-hint">
                          {t(`wizard.scenarios.${id}.desc`)}
                        </p>
                        <span className="ps-focus-card-cmd tw-scenario-cmd">
                          {t(`wizard.scenarios.${id}.chain`)}
                        </span>
                        <span
                          className={clsx(
                            "tw-scenario-limit",
                            id === "from_scratch" ? "is-ok" : "is-warn",
                          )}
                        >
                          {t(`wizard.scenarios.${id}.limit`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="tw-scenario-hps-note">
                  {t("wizard.hpsearchViaPipeline")}{" "}
                  <button
                    type="button"
                    className="tw-scenario-hps-link"
                    onClick={() => onClose()}
                  >
                    {t("wizard.hpsearchOpenPipeline")}
                  </button>
                </p>
              </div>
            ) : null}

            {draft.step === "data" && inheritedLocked ? (
              <FinetuneDataStep
                catalogModels={catalogModels}
                exampleClassIds={annotationExampleIds}
                baseModel={draft.finetuneBaseModel}
                classes={draft.classes}
                spectro={draft.spectro}
                model={draft.model}
                recordingTableRel={draft.recordingTableRel}
                recordingTableAbs={wizardPathAbsolute(
                  projectDir,
                  draft.recordingTableRel,
                )}
                dataHint={t("wizard.finetuneDataHint", {
                  total: totalRec,
                  annotated,
                })}
                locale={locale}
                classColorOverrides={classColorOverrides}
                applyStatus={finetuneApplyStatus}
                onBaseChange={(v) => {
                  const picked = catalogModels.find((m) => m.path === v || m.id === v);
                  if (
                    v &&
                    picked &&
                    annotationExampleIds !== null &&
                    !finetuneBaseSharesExamples(picked.calls, annotationExampleIds)
                  ) {
                    return;
                  }
                  finetuneAppliedKeyRef.current = null;
                  finetuneErrorRetriesRef.current = 0;
                  setFinetuneLock(null);
                  setFinetuneApplyStatus(v ? "loading" : "idle");
                  setDraft((d) => ({
                    ...d,
                    scenario: "finetune",
                    finetuneBaseModel: v,
                  }));
                }}
                onBrowseTable={() => void browsePath("recordingTableRel")}
                onTableChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    ...sanitizeWizardDataPaths(
                      {
                        recordingTableRel: value,
                        annotationsRel: d.annotationsRel,
                        equivalencesRel: d.equivalencesRel,
                      },
                      projectDir,
                    ),
                  }))
                }
              />
            ) : null}

            {draft.step === "data" && !inheritedLocked ? (
              <div className="tw-data">
                <h2 className="tw-main-kicker">{t("wizard.step2Title")}</h2>
                <div className="tw-path-block">
                  {(
                    [
                      {
                        field: "recordingTableRel" as const,
                        label: "recordingTable",
                        hint: t("wizard.recordingTableHint", {
                          total: totalRec,
                          annotated,
                          skipped: skippedRec,
                        }),
                      },
                      {
                        field: "annotationsRel" as const,
                        label: "annotations",
                        hint: t("wizard.annotationsHint"),
                      },
                    ] as const
                  ).map((row) => (
                    <div key={row.field} className="tw-path-row">
                      <span className="tw-path-label">{t(`wizard.${row.label}`)}</span>
                      <div className="tw-path-controls">
                        <input
                          className="tw-input tw-path-input"
                          value={wizardPathAbsolute(projectDir, draft[row.field])}
                          spellCheck={false}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              ...sanitizeWizardDataPaths(
                                {
                                  recordingTableRel:
                                    row.field === "recordingTableRel"
                                      ? e.target.value
                                      : d.recordingTableRel,
                                  annotationsRel:
                                    row.field === "annotationsRel"
                                      ? e.target.value
                                      : d.annotationsRel,
                                  equivalencesRel: d.equivalencesRel,
                                },
                                projectDir,
                              ),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="settings-path-btn"
                          onClick={() => void browsePath(row.field)}
                        >
                          {t("settings.pathBrowse")}
                        </button>
                      </div>
                      <span className="tw-path-hint">{row.hint}</span>
                    </div>
                  ))}
                  <div className="tw-path-row">
                    <span className="tw-path-label">{t("wizard.equivalences")}</span>
                    <div className="tw-path-controls">
                      <input
                        className="tw-input tw-path-input"
                        value={wizardPathAbsolute(projectDir, draft.equivalencesRel)}
                        spellCheck={false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            ...sanitizeWizardDataPaths(
                              {
                                recordingTableRel: d.recordingTableRel,
                                annotationsRel: d.annotationsRel,
                                equivalencesRel: e.target.value,
                              },
                              projectDir,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="settings-path-btn"
                        onClick={() => void browsePath("equivalencesRel")}
                      >
                        {t("settings.pathBrowse")}
                      </button>
                      <button
                        type="button"
                        className="settings-path-btn"
                        onClick={() => setSynonymsOpen(true)}
                      >
                        {t("wizard.synonymsConfigure")}
                      </button>
                    </div>
                    <span className="tw-path-hint">
                      {synonymRuleCount > 0
                        ? t("wizard.equivalencesHintConfigured", {
                            count: synonymRuleCount,
                          })
                        : t("wizard.equivalencesHint")}
                    </span>
                  </div>
                </div>

                <div className="tw-classes-section">
                  <div className="tw-classes-head">
                    <h3 className="tw-card-kicker">{t("wizard.classesTitle")}</h3>
                    <span className="tw-muted">
                      {t("wizard.classesSelected", {
                        selected: selectedCalls.length,
                        total: draft.classes.length,
                      })}
                    </span>
                  </div>
                  <div className="tw-classes-m16">
                    <div className="jobs-table-body tw-classes-table-body">
                      <table className="jobs-table w-full text-left">
                        <thead>
                          <tr>
                            <th className="tw-col-class">{t("wizard.colClass")}</th>
                            <th className="tw-col-syn">{t("wizard.colSynonymsShort")}</th>
                            <th className="tw-col-count">{t("wizard.colCount")}</th>
                            <th className="tw-col-num">{t("wizard.colRecordings")}</th>
                            <th className="tw-col-num">{t("wizard.colDuration")}</th>
                            <th className="tw-col-cov">{t("wizard.colCoverage")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.classes.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="jobs-table-placeholder">
                                {t("wizard.classesEmpty")}
                              </td>
                            </tr>
                          ) : (
                            draft.classes.map((row) => {
                              const covPct = Math.round(
                                Math.max(0, Math.min(1, row.coverage)) * 100,
                              );
                              const dur = formatDurationHm(row.duration_sec);
                              const swatch = colorForLabel(
                                row.id,
                                undefined,
                                classColorOverrides,
                              );
                              const hasOverride = Boolean(
                                classColorOverrides[row.id] ??
                                  classColorOverrides[row.id.toUpperCase()],
                              );
                              const pickerOpen = colorPickerFor === row.id;
                              return (
                                <tr
                                  key={row.id}
                                  className={clsx(
                                    "jobs-table-row",
                                    row.selected && "jobs-table-row-selected",
                                  )}
                                >
                                  <td className="tw-col-class">
                                    <div className="tw-class-cell">
                                      <input
                                        type="checkbox"
                                        checked={row.selected}
                                        disabled={inheritedLocked}
                                        title={
                                          inheritedLocked
                                            ? t("wizard.finetuneInherited")
                                            : undefined
                                        }
                                        onChange={() =>
                                          setDraft((d) => ({
                                            ...d,
                                            classes: d.classes.map((c) =>
                                              c.id === row.id
                                                ? { ...c, selected: !c.selected }
                                                : c,
                                            ),
                                          }))
                                        }
                                      />
                                      <span className="tw-class-swatch-wrap">
                                        <button
                                          type="button"
                                          className={clsx(
                                            "tw-class-swatch",
                                            colorsEditable && "is-editable",
                                            hasOverride && "is-custom",
                                          )}
                                          style={{ backgroundColor: swatch }}
                                          disabled={!colorsEditable}
                                          title={
                                            colorsEditable
                                              ? t("wizard.colorPickHint")
                                              : t("wizard.colorLockedHint")
                                          }
                                          aria-label={t("wizard.colorPickAria", {
                                            name: row.id,
                                          })}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            if (!colorsEditable) return;
                                            setColorPickerFor((cur) =>
                                              cur === row.id ? null : row.id,
                                            );
                                          }}
                                        />
                                        {pickerOpen ? (
                                          <div className="tw-color-pop" role="dialog">
                                            <div className="tw-color-pop-grid">
                                              {CLASS_COLOR_PRESETS.map((hex) => {
                                                const n = normalizeClassColor(hex) ?? hex;
                                                const selected =
                                                  n.toUpperCase() === swatch.toUpperCase();
                                                return (
                                                  <button
                                                    key={n}
                                                    type="button"
                                                    className={clsx(
                                                      "tw-color-swatch-opt",
                                                      selected && "is-selected",
                                                    )}
                                                    style={{ backgroundColor: n }}
                                                    title={n}
                                                    onClick={() => {
                                                      setClassColor(row.id, n);
                                                      setColorPickerFor(null);
                                                    }}
                                                  />
                                                );
                                              })}
                                            </div>
                                            <button
                                              type="button"
                                              className="tw-color-reset"
                                              disabled={!hasOverride}
                                              onClick={() => {
                                                setClassColor(row.id, null);
                                                setColorPickerFor(null);
                                              }}
                                            >
                                              {t("wizard.colorReset")}
                                            </button>
                                          </div>
                                        ) : null}
                                      </span>
                                      <span className="font-mono">{row.id}</span>
                                    </div>
                                  </td>
                                  <td className="tw-col-syn">
                                    <ClassSynonymsInline
                                      classId={row.id}
                                      color={swatch}
                                      synonyms={synonymsByClass[row.id] ?? []}
                                      reservedClassIds={draft.classes.map(
                                        (c) => c.id,
                                      )}
                                      onCommit={(next) =>
                                        commitClassSynonyms(row.id, next)
                                      }
                                    />
                                  </td>
                                  <td className="tw-col-count">{row.count}</td>
                                  <td className="tw-col-num">{row.recordings}</td>
                                  <td className="tw-col-num">
                                    {dur
                                      ? t("wizard.durationHm", {
                                          h: dur.h,
                                          m: dur.m,
                                        })
                                      : "—"}
                                  </td>
                                  <td className="tw-col-cov">
                                    <span className="tw-cov">
                                      <span
                                        className={clsx(
                                          "tw-cov-fill",
                                          covPct < 35 && "is-warn",
                                        )}
                                        style={{ width: `${covPct}%` }}
                                      />
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {disabledClasses.length ? (
                    <p className="tw-warn tw-warn-icon">
                      {t("wizard.classDisabled", {
                        name: disabledClasses.map((c) => c.id).join(", "),
                        count: disabledClasses.reduce((n, c) => n + c.count, 0),
                        recordings: disabledClasses.reduce(
                          (n, c) => n + c.recordings,
                          0,
                        ),
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {draft.step === "spectro" && inheritedLocked ? (
              <div className="tw-spectro tw-ft-spectro-locked">
                <h2 className="tw-main-kicker">{t("wizard.step3Title")}</h2>
                <p className="tw-warn">{t("wizard.finetuneSpectroLockedHint")}</p>
                <div className="tw-ft-inherit" role="group">
                  <div className="tw-ft-inherit-head">
                    <svg
                      className="tw-ft-lock-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        d="M8 1.5A2.75 2.75 0 0 0 5.25 4.25V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.75V4.25A2.75 2.75 0 0 0 8 1.5Zm1.25 4.5h-2.5V4.25a1.25 1.25 0 1 1 2.5 0V6Z"
                      />
                    </svg>
                    <span>{t("wizard.finetuneInheritedTitle")}</span>
                  </div>
                  <dl className="tw-ft-inherit-grid">
                    <div>
                      <dt>{t("wizard.finetuneInheritSpectro")}</dt>
                      <dd>{formatFinetuneSpectroLine(draft.spectro, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("wizard.finetuneInheritInput")}</dt>
                      <dd>{formatFinetuneInputLine(draft.spectro, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("wizard.finetuneInheritArch")}</dt>
                      <dd>{formatFinetuneArchLine(draft.model, locale)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="tw-param-section">
                  <h3 className="tw-card-kicker">{t("wizard.split")}</h3>
                  <div className="tw-param-rows">
                    <div className="tw-param-row tw-param-row-split">
                      <span className="tw-param-label">{t("wizard.split")}</span>
                      <div className="tw-split-controls">
                        <div className="tw-split-bar is-labeled" aria-hidden>
                          <span
                            className="is-train"
                            style={{ flex: Math.max(0.01, draft.spectro.train) }}
                          >
                            train {draft.spectro.train}
                          </span>
                          <span
                            className="is-val"
                            style={{ flex: Math.max(0.01, draft.spectro.val) }}
                          >
                            val {draft.spectro.val}
                          </span>
                          <span
                            className="is-test"
                            style={{ flex: Math.max(0.01, draft.spectro.test) }}
                          >
                            test {draft.spectro.test}
                          </span>
                        </div>
                        {(
                          [
                            ["train", "train"],
                            ["val", "val"],
                            ["test", "test"],
                          ] as const
                        ).map(([key]) => (
                          <input
                            key={key}
                            className="tw-input tw-param-input tw-split-num"
                            type="number"
                            step="0.01"
                            aria-label={key}
                            value={draft.spectro[key]}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                spectro: {
                                  ...d.spectro,
                                  [key]: parseWizardNumber(e.target.value, d.spectro[key]),
                                },
                              }))
                            }
                          />
                        ))}
                        <span
                          className={clsx(
                            "tw-param-hint tw-split-sum",
                            !splitSumOk(draft.spectro) && "tw-error",
                          )}
                        >
                          {t("wizard.splitSum", {
                            sum: (
                              draft.spectro.train +
                              draft.spectro.val +
                              draft.spectro.test
                            ).toFixed(1),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {draft.step === "spectro" && !inheritedLocked ? (
              <div className="tw-spectro">
                <div className="tw-form-head">
                  <h2 className="tw-main-kicker">{t("wizard.step3Title")}</h2>
                  <button
                    type="button"
                    className="tw-reset-btn"
                    onClick={() =>
                      setDraft((d) => ({ ...d, spectro: { ...FACTORY_SPECTRO } }))
                    }
                  >
                    {t("wizard.resetDefaults")}
                  </button>
                </div>

                <div className="tw-param-section">
                  <h3 className="tw-card-kicker">{t("wizard.spectroSection")}</h3>
                  <div className="tw-param-rows">
                    {(
                      [
                        ["sampling_rate", "samplingRate"],
                        ["nfft", "nfft"],
                        ["n_overlap", "overlap"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="tw-param-row">
                        <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          value={draft.spectro[key]}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: { ...d.spectro, [key]: parseWizardNumber(e.target.value, d.spectro[key]) },
                            }))
                          }
                        />
                        <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                      </label>
                    ))}
                    <div className="tw-param-row tw-param-row-range">
                      <span className="tw-param-label">{t("wizard.freqRange")}</span>
                      <span className="tw-param-range">
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          value={draft.spectro.freq_low}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: {
                                ...d.spectro,
                                freq_low: parseWizardNumber(e.target.value, d.spectro.freq_low),
                              },
                            }))
                          }
                        />
                        <span className="tw-param-dash" aria-hidden>
                          —
                        </span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          value={draft.spectro.freq_high}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: {
                                ...d.spectro,
                                freq_high: parseWizardNumber(e.target.value, d.spectro.freq_high),
                              },
                            }))
                          }
                        />
                      </span>
                      <span className="tw-param-hint">{t("wizard.freqRangeHint")}</span>
                    </div>
                    <div className="tw-param-row tw-param-row-range">
                      <span className="tw-param-label">{t("wizard.quantiles")}</span>
                      <span className="tw-param-range">
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          step="0.001"
                          value={draft.spectro.quantile_low}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: {
                                ...d.spectro,
                                quantile_low: parseWizardNumber(e.target.value, d.spectro.quantile_low),
                              },
                            }))
                          }
                        />
                        <span className="tw-param-dash" aria-hidden>
                          —
                        </span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          step="0.001"
                          value={draft.spectro.quantile_high}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: {
                                ...d.spectro,
                                quantile_high: parseWizardNumber(e.target.value, d.spectro.quantile_high),
                              },
                            }))
                          }
                        />
                      </span>
                      <span className="tw-param-hint">{t("wizard.quantilesHint")}</span>
                    </div>
                  </div>
                </div>

                <div className="tw-param-section">
                  <h3 className="tw-card-kicker">{t("wizard.snippetsSection")}</h3>
                  <div className="tw-param-rows">
                    {(
                      [
                        ["snippet_duration", "snippetDuration"],
                        ["snippets_per_sec", "snippetsPerSec"],
                        ["segment_duration", "segmentDuration"],
                        ["fraction_removal", "fractionRemoval"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="tw-param-row">
                        <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          step={key === "fraction_removal" ? "0.01" : undefined}
                          value={draft.spectro[key]}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              spectro: { ...d.spectro, [key]: parseWizardNumber(e.target.value, d.spectro[key]) },
                            }))
                          }
                        />
                        <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                      </label>
                    ))}
                    <div className="tw-param-row tw-param-row-split">
                      <span className="tw-param-label">{t("wizard.split")}</span>
                      <div className="tw-split-controls">
                        <div className="tw-split-bar is-labeled" aria-hidden>
                          <span
                            className="is-train"
                            style={{ flex: Math.max(0.01, draft.spectro.train) }}
                          >
                            train {draft.spectro.train}
                          </span>
                          <span
                            className="is-val"
                            style={{ flex: Math.max(0.01, draft.spectro.val) }}
                          >
                            val {draft.spectro.val}
                          </span>
                          <span
                            className="is-test"
                            style={{ flex: Math.max(0.01, draft.spectro.test) }}
                          >
                            test {draft.spectro.test}
                          </span>
                        </div>
                        {(
                          [
                            ["train", "train"],
                            ["val", "val"],
                            ["test", "test"],
                          ] as const
                        ).map(([key]) => (
                          <input
                            key={key}
                            className="tw-input tw-param-input tw-split-num"
                            type="number"
                            step="0.01"
                            aria-label={key}
                            value={draft.spectro[key]}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                spectro: {
                                  ...d.spectro,
                                  [key]: parseWizardNumber(e.target.value, d.spectro[key]),
                                },
                              }))
                            }
                          />
                        ))}
                        <span
                          className={clsx(
                            "tw-param-hint tw-split-sum",
                            !splitSumOk(draft.spectro) && "tw-error",
                          )}
                        >
                          {t("wizard.splitSum", {
                            sum: (
                              draft.spectro.train +
                              draft.spectro.val +
                              draft.spectro.test
                            ).toFixed(1),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="tw-estimate">
                  {t("wizard.spectroEstimate", {
                    snippets: est.snippets.toLocaleString(locale),
                    gb: est.gb,
                    minutes: est.minutes,
                  })}
                </p>
              </div>
            ) : null}

            {draft.step === "model" ? (
              <div className="tw-model">
                <div className="tw-form-head">
                  <h2 className="tw-main-kicker">{t("wizard.step4Title")}</h2>
                  <div className="tw-form-head-actions">
                    <button
                      type="button"
                      className="tw-reset-btn"
                      disabled={inheritedLocked}
                      title={
                        inheritedLocked
                          ? t("wizard.finetuneInherited")
                          : t("wizard.resetDefaultsHint")
                      }
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          model: {
                            ...FACTORY_MODEL,
                            // Keep the name the user already chose on this step.
                            name: d.model.name.trim() || FACTORY_MODEL.name,
                          },
                        }))
                      }
                    >
                      {t("wizard.resetDefaults")}
                    </button>
                  </div>
                </div>

                <div className="tw-param-section">
                  <div className="tw-param-rows">
                    <label className="tw-param-row">
                      <span className="tw-param-label">{t("wizard.modelName")}</span>
                      <input
                        className="tw-input tw-param-input"
                        value={draft.model.name}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            model: { ...d.model, name: e.target.value },
                          }))
                        }
                      />
                      <span className="tw-param-hint">{t("wizard.modelNameHint")}</span>
                    </label>
                    <label className="tw-param-row">
                      <span className="tw-param-label">{t("wizard.architecture")}</span>
                      <select
                        className="tw-input tw-param-input"
                        value={draft.model.architecture}
                        disabled={inheritedLocked}
                        title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            model: {
                              ...d.model,
                              architecture: e.target
                                .value as "ResNetLSTM" | "ResNet1DConv",
                            },
                          }))
                        }
                      >
                        <option value="ResNetLSTM">ResNetLSTM</option>
                        <option value="ResNet1DConv">ResNet1DConv</option>
                      </select>
                      <span className="tw-param-hint">{t("wizard.architectureHint")}</span>
                    </label>
                  </div>
                </div>

                <div className="tw-model-grid">
                  <div className="tw-param-section">
                    <h3 className="tw-card-kicker">{t("wizard.networkSection")}</h3>
                    <div className="tw-param-rows">
                      {(
                        [
                          ["filters", "filters", "str"],
                          ["kernel_size", "kernelSize", "num"],
                          ["dropout_rate", "dropout", "num"],
                          ["lstm_units", "lstmUnits", "num"],
                        ] as const
                      ).map(([key, label, kind]) => (
                        <label key={key} className="tw-param-row">
                          <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                          <input
                            className="tw-input tw-param-input"
                            value={String(draft.model[key])}
                            disabled={inheritedLocked}
                            title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDraft((d) => ({
                                ...d,
                                model: {
                                  ...d.model,
                                  [key]:
                                    kind === "str"
                                      ? raw
                                      : parseWizardNumber(
                                          raw,
                                          Number(d.model[key]) || 0,
                                        ),
                                },
                              }));
                            }}
                          />
                          <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                        </label>
                      ))}
                      {(
                        [
                          ["conv_initializer", "convInitializer"],
                          ["lstm_initializer", "lstmInitializer"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="tw-param-row">
                          <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                          <select
                            className="tw-input tw-param-input"
                            value={draft.model[key]}
                            disabled={inheritedLocked}
                            title={inheritedLocked ? t("wizard.finetuneInherited") : undefined}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                model: { ...d.model, [key]: e.target.value },
                              }))
                            }
                          >
                            {[
                              draft.model[key],
                              ...KERAS_INITIALIZERS.filter((x) => x !== draft.model[key]),
                            ].map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="tw-param-section">
                    <h3 className="tw-card-kicker">{t("wizard.trainLoopSection")}</h3>
                    <div className="tw-param-rows">
                      {(
                        [
                          ["epochs", "epochs", "num"],
                          ["batch_size", "batchSize", "num"],
                          ["learning_rate", "learningRate", "str"],
                          ["monitor", "monitor", "str"],
                        ] as const
                      ).map(([key, label, kind]) => (
                        <label key={key} className="tw-param-row">
                          <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                          <input
                            className="tw-input tw-param-input"
                            value={String(draft.model[key])}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDraft((d) => ({
                                ...d,
                                model: {
                                  ...d.model,
                                  [key]:
                                    kind === "str"
                                      ? raw
                                      : parseWizardNumber(
                                          raw,
                                          Number(d.model[key]) || 0,
                                        ),
                                },
                              }));
                            }}
                          />
                          <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="tw-param-section">
                  <h3 className="tw-card-kicker">{t("wizard.stopScheduleSection")}</h3>
                  <div className="tw-model-grid">
                    <div className="tw-param-rows">
                      {(
                        [
                          ["early_stopping_patience", "earlyStop", "1"],
                          ["reduce_lr_patience", "reduceLrPatience", "1"],
                        ] as const
                      ).map(([key, label, step]) => (
                        <label key={key} className="tw-param-row">
                          <span className="tw-param-label">{t(`wizard.${label}`)}</span>
                          <input
                            className="tw-input tw-param-input"
                            type="number"
                            step={step}
                            value={draft.model[key]}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                model: {
                                  ...d.model,
                                  [key]: parseWizardNumber(e.target.value, d.model[key]),
                                },
                              }))
                            }
                          />
                          <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="tw-param-rows">
                      <label className="tw-param-row">
                        <span className="tw-param-label">{t("wizard.reduceLrFactor")}</span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          step="0.01"
                          value={draft.model.reduce_lr_factor}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              model: {
                                ...d.model,
                                reduce_lr_factor: parseWizardNumber(
                                  e.target.value,
                                  d.model.reduce_lr_factor,
                                ),
                              },
                            }))
                          }
                        />
                        <span className="tw-param-hint">{t("wizard.reduceLrFactorHint")}</span>
                      </label>
                      <label className="tw-param-row">
                        <span className="tw-param-label">{t("wizard.reduceLrMin")}</span>
                        <input
                          className="tw-input tw-param-input"
                          value={draft.model.reduce_lr_min_learning_rate}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              model: {
                                ...d.model,
                                reduce_lr_min_learning_rate: e.target.value,
                              },
                            }))
                          }
                        />
                        <span className="tw-param-hint">{t("wizard.reduceLrMinHint")}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="tw-param-section">
                  <h3 className="tw-card-kicker">{t("wizard.samplingSection")}</h3>
                  <div className="tw-model-grid">
                    <div className="tw-param-rows">
                      <label className="tw-param-row">
                        <span className="tw-param-label">{t("wizard.classWeights")}</span>
                        {/*
                          Training balance knob — never inherit-lock (not network shape).
                          UI value "none" serializes to JSON null (orcAI default).
                        */}
                        <select
                          className="tw-input tw-param-input font-mono"
                          value={draft.model.call_weights}
                          title={t("wizard.classWeightsHint")}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              model: {
                                ...d.model,
                                call_weights: e.target.value as CallWeightsMethod,
                              },
                            }))
                          }
                        >
                          {CALL_WEIGHT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m === "none"
                                ? t("wizard.classWeightsNone")
                                : t(`wizard.classWeights_${m}`)}
                            </option>
                          ))}
                        </select>
                        <span className="tw-param-hint">{t("wizard.classWeightsHint")}</span>
                      </label>
                      <div className="tw-param-row">
                        <span className="tw-param-label">{t("wizard.shuffle")}</span>
                        <span className="tw-param-control">
                          <ToggleSwitch
                            checked={draft.model.shuffle}
                            onChange={(next) =>
                              setDraft((d) => ({
                                ...d,
                                model: { ...d.model, shuffle: next },
                              }))
                            }
                            label={t("wizard.shuffle")}
                          />
                        </span>
                        <span className="tw-param-hint">{t("wizard.shuffleHint")}</span>
                      </div>
                    </div>
                    <div className="tw-param-rows">
                      <label className="tw-param-row">
                        <span className="tw-param-label">{t("wizard.seed")}</span>
                        <input
                          className="tw-input tw-param-input"
                          type="number"
                          value={draft.model.seed}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              model: {
                                ...d.model,
                                seed: parseWizardNumber(e.target.value, d.model.seed),
                              },
                            }))
                          }
                        />
                        <span className="tw-param-hint">{t("wizard.seedHint")}</span>
                      </label>
                    </div>
                  </div>
                  <div className="tw-param-row tw-param-row-batches">
                    <span className="tw-param-label">{t("wizard.batchesPerEpoch")}</span>
                    <span className="tw-param-batches">
                      <input
                        className="tw-input tw-param-input"
                        type="number"
                        aria-label={t("wizard.nBatchTrain")}
                        value={draft.model.n_batch_train}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            model: {
                              ...d.model,
                              n_batch_train: parseWizardNumber(
                                e.target.value,
                                d.model.n_batch_train,
                              ),
                            },
                          }))
                        }
                      />
                      <span className="tw-param-dash" aria-hidden>
                        /
                      </span>
                      <input
                        className="tw-input tw-param-input"
                        type="number"
                        aria-label={t("wizard.nBatchVal")}
                        value={draft.model.n_batch_val}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            model: {
                              ...d.model,
                              n_batch_val: parseWizardNumber(
                                e.target.value,
                                d.model.n_batch_val,
                              ),
                            },
                          }))
                        }
                      />
                      <span className="tw-param-dash" aria-hidden>
                        /
                      </span>
                      <input
                        className="tw-input tw-param-input"
                        type="number"
                        aria-label={t("wizard.nBatchTest")}
                        value={draft.model.n_batch_test}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            model: {
                              ...d.model,
                              n_batch_test: parseWizardNumber(
                                e.target.value,
                                d.model.n_batch_test,
                              ),
                            },
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="settings-path-btn tw-calc-open"
                        disabled={!projectId}
                        title={t("wizard.calcOpenHint")}
                        onClick={() => setSnippetCalcOpen(true)}
                      >
                        {t("wizard.calcOpen")}
                      </button>
                    </span>
                    <span className="tw-param-hint">{t("wizard.batchesPerEpochHint")}</span>
                  </div>
                </div>

                {!inheritedLocked ? (
                  <div className="tw-hps-opt">
                    <div className="tw-param-row">
                      <span className="tw-param-label">{t("wizard.includeHpsearch")}</span>
                      <span className="tw-param-control tw-hps-opt-control">
                        <ToggleSwitch
                          checked={draft.includeHpsearch}
                          onChange={(next) =>
                            setDraft((d) => ({ ...d, includeHpsearch: next }))
                          }
                          label={t("wizard.includeHpsearch")}
                        />
                        <button
                          type="button"
                          className="settings-path-btn"
                          disabled={!draft.includeHpsearch}
                          onClick={() => setHpsOpen(true)}
                        >
                          {t("wizard.hpsConfigure")}
                        </button>
                      </span>
                      <span className="tw-param-hint">{t("wizard.includeHpsearchHint")}</span>
                    </div>
                  </div>
                ) : null}

                <p className="tw-estimate is-train">
                  {t("wizard.trainEstimate", {
                    h: trainEst.hours,
                    m: trainEst.minutes,
                    device: trainEstimateDeviceLabel(
                      computeDevice,
                      capabilities,
                      t,
                    ),
                  })}
                </p>
              </div>
            ) : null}

            {draft.step === "preflight" ? (
              <div className="tw-preflight">
                <h2 className="tw-main-kicker">{t("wizard.step5Title")}</h2>

                <ul className="tw-checks">
                  <li className="is-ok">
                    <span className="tw-check-title">{t("wizard.checkDataTitle")}</span>
                    <span className="tw-check-detail">
                      {t("wizard.checkDataDetail", {
                        annotated,
                        classes: selectedCalls.length,
                      })}
                    </span>
                  </li>
                  <li
                    className={
                      pipeline?.readiness.disk.state === "off"
                        ? "is-bad"
                        : pipeline?.readiness.disk.state === "warn"
                          ? "is-warn"
                          : "is-ok"
                    }
                  >
                    <span className="tw-check-title">{t("wizard.checkDiskTitle")}</span>
                    <span className="tw-check-detail">
                      {(pipeline?.readiness.disk.needed_bytes ?? 0) > 0
                        ? t("wizard.checkDiskDetail", {
                            need: formatBytesLocalized(
                              pipeline?.readiness.disk.needed_bytes ?? 0,
                              locale,
                            ),
                            free: formatBytesLocalized(
                              pipeline?.readiness.disk.free_bytes ?? 0,
                              locale,
                            ),
                          })
                        : t("wizard.checkDiskDetailReady", {
                            free: formatBytesLocalized(
                              pipeline?.readiness.disk.free_bytes ?? 0,
                              locale,
                            ),
                          })}
                    </span>
                  </li>
                  <li className={paramsOk ? "is-ok" : "is-bad"}>
                    <span className="tw-check-title">{t("wizard.checkParamsTitle")}</span>
                    <span className="tw-check-detail">
                      {paramsOk
                        ? t("wizard.checkParamsDetailOk", {
                            low: draft.spectro.freq_low,
                            high: draft.spectro.freq_high.toLocaleString(locale),
                          })
                        : t("wizard.checkParamsDetailBad")}
                    </span>
                  </li>
                  <li className={rareClass ? "is-warn" : "is-ok"}>
                    <span className="tw-check-title">
                      {t("wizard.checkImbalanceTitle")}
                    </span>
                    <span className="tw-check-detail">
                      {rareClass
                        ? t("wizard.checkImbalanceDetail", {
                            name: rareClass.id,
                            count: rareClass.count,
                          })
                        : t("wizard.checkImbalanceOk")}
                    </span>
                  </li>
                  <li className="is-warn">
                    <span className="tw-check-title">
                      {t("wizard.checkDurationTitle")}
                    </span>
                    <span className="tw-check-detail">
                      {t("wizard.checkDurationDetail", {
                        eta: formatPlanEta(planEtaTotalMin, {
                          min: t("wizard.min"),
                          hour: t("wizard.hour"),
                        }).replace(/^≈\s*/, ""),
                      })}
                    </span>
                  </li>
                  <li className={modelDirTaken ? "is-warn" : "is-ok"}>
                    <span className="tw-check-title">
                      {t("wizard.checkModelNameTitle")}
                    </span>
                    <span className="tw-check-detail">
                      {t(
                        modelDirTaken
                          ? "wizard.checkModelNameDetailTaken"
                          : "wizard.checkModelNameDetail",
                        { path: `models/${draft.model.name}` },
                      )}
                    </span>
                  </li>
                </ul>

                <div className="tw-plan">
                  <div className="tw-plan-head">
                    <h3 className="tw-card-kicker">{t("wizard.launchPlan")}</h3>
                    <p className="tw-plan-caption">{t("wizard.launchPlanCaption")}</p>
                  </div>
                  <div className="tw-plan-flow">
                    {planFull.map((c, i) => (
                      <span key={c.id} className="tw-plan-node">
                        {i > 0 ? (
                          <span className="tw-plan-arrow" aria-hidden>
                            →
                          </span>
                        ) : null}
                        <span className="tw-plan-chip">
                          <span className="tw-plan-cmd">{c.id}</span>
                          <small>
                            {formatPlanEta(c.etaMin, {
                              min: t("wizard.min"),
                              hour: t("wizard.hour"),
                            })}
                          </small>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="tw-preflight-opts">
                  {!inheritedLocked ? (
                    <div className="tw-param-row tw-preflight-opt">
                      <span className="tw-param-label">{t("wizard.includeHpsearch")}</span>
                      <span className="tw-param-control tw-hps-opt-control">
                        <ToggleSwitch
                          checked={draft.includeHpsearch}
                          onChange={(next) =>
                            setDraft((d) => ({ ...d, includeHpsearch: next }))
                          }
                          label={t("wizard.includeHpsearch")}
                        />
                        <button
                          type="button"
                          className="settings-path-btn"
                          disabled={!draft.includeHpsearch}
                          onClick={() => setHpsOpen(true)}
                        >
                          {t("wizard.hpsConfigure")}
                        </button>
                      </span>
                      <span className="tw-param-hint">{t("wizard.includeHpsearchHint")}</span>
                    </div>
                  ) : null}
                  <div className="tw-param-row tw-preflight-opt">
                    <span className="tw-param-label">{t("wizard.testAfter")}</span>
                    <span className="tw-param-control">
                      <ToggleSwitch
                        checked={draft.testAfterTrain}
                        onChange={(next) =>
                          setDraft((d) => ({ ...d, testAfterTrain: next }))
                        }
                        label={t("wizard.testAfter")}
                      />
                    </span>
                    <span className="tw-param-hint">{t("wizard.testAfterHint")}</span>
                  </div>
                  <label className="tw-param-row tw-preflight-opt">
                    <span className="tw-param-label">{t("wizard.compression")}</span>
                    <select
                      className="tw-input tw-param-input"
                      value={draft.compression}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, compression: e.target.value }))
                      }
                    >
                      <option value="GZIP">GZIP</option>
                      <option value="None">None</option>
                    </select>
                    <span className="tw-param-hint">{t("wizard.compressionHint")}</span>
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="pp-footer tw-footer">
          <div className="pp-footer-main">
            {draft.step === "preflight" ? (
              <div className="pp-footer-cmd tw-footer-will">
                <p className="pp-cmd-label">{t("wizard.willRunLabel")}</p>
                <p className="tw-will-run">
                  {t("wizard.willRunDetail", { count: planFull.length })}
                </p>
                {launchBlockedReason ? (
                  <p className="tw-error tw-launch-block">{launchBlockedReason}</p>
                ) : null}
              </div>
            ) : (
              <div className="pp-footer-cmd">
                <p className="pp-cmd-label">{t("predict.run.cliTitle")}</p>
                <div className="pp-cmd-row">
                  <pre
                    className={cmdPreview ? "pp-cmd-lcd" : "pp-cmd-lcd is-empty"}
                    title={cmdPreview || undefined}
                    aria-label={
                      cmdPreview
                        ? t("predict.run.cliTitle")
                        : t("predict.run.cliEmpty")
                    }
                  >
                    {cmdPreview || t("predict.run.cliEmpty")}
                  </pre>
                  <button
                    type="button"
                    className="pp-btn pp-btn-preset pp-cmd-copy"
                    disabled={!cmdPreview.trim()}
                    onClick={() => void onCopyCli()}
                  >
                    {cliCopied
                      ? t("predict.run.cliCopied")
                      : t("predict.run.cliCopy")}
                  </button>
                </div>
              </div>
            )}
            <div className="pp-footer-side">
              <span className="pp-footer-count">
                {inheritedLocked
                  ? t("wizard.stepOfFinetune", {
                      n: idx + 1,
                      total: WIZARD_STEP_IDS.length,
                    })
                  : t("wizard.stepOf", {
                      n: idx + 1,
                      total: WIZARD_STEP_IDS.length,
                    })}
              </span>
              <div className="pp-footer-btns">
                {draft.step === "scenario" ? (
                  <button
                    type="button"
                    className="pp-btn pp-btn-preset"
                    onClick={() => onClose()}
                  >
                    {t("wizard.cancel")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pp-btn pp-btn-preset"
                    onClick={() => go(WIZARD_STEP_IDS[idx - 1]!)}
                  >
                    {t("wizard.back")}
                  </button>
                )}
                {draft.step === "data" && !inheritedLocked ? (
                  <button
                    type="button"
                    className="pp-btn pp-btn-preset"
                    disabled={busy}
                    onClick={() => void saveDraftParams()}
                  >
                    {t("wizard.saveDraft")}
                  </button>
                ) : null}
                {draft.step === "model" ? (
                  <button
                    type="button"
                    className="pp-btn pp-btn-preset"
                    disabled={busy}
                    onClick={() => setParamsJsonOpen(true)}
                  >
                    {t("wizard.openJson")}
                  </button>
                ) : null}
                {draft.step === "preflight" ? (
                  <>
                    <button
                      type="button"
                      className="pp-btn pp-btn-preset"
                      disabled={!canLaunch}
                      title={launchBlockedReason ?? undefined}
                      onClick={() => void launch(true)}
                    >
                      {t("wizard.prepOnly")}
                    </button>
                    <button
                      type="button"
                      className="pp-btn pp-btn-primary"
                      disabled={!canLaunch}
                      title={launchBlockedReason ?? undefined}
                      onClick={() => void launch(false)}
                    >
                      {t("wizard.startTrain")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pp-btn pp-btn-primary"
                    disabled={!canNext()}
                    title={nextBlockedReason ?? undefined}
                    onClick={() => {
                      if (draft.step === "data") {
                        void (async () => {
                          try {
                            await persistEquivalences();
                            go(WIZARD_STEP_IDS[idx + 1]!);
                          } catch (err) {
                            const msg = wizardErrorMessage(err, String(err));
                            if (msg) setError(msg);
                          }
                        })();
                        return;
                      }
                      go(WIZARD_STEP_IDS[idx + 1]!);
                    }}
                  >
                    {t("wizard.next")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
      <TrainWizardSynonymsModal
        open={synonymsOpen}
        classes={draft.classes}
        equivalencesMap={draft.equivalencesMap}
        classColorOverrides={classColorOverrides}
        fileRel={draft.equivalencesRel}
        onClose={() => setSynonymsOpen(false)}
        onSave={(map) => {
          void (async () => {
            try {
              await persistEquivalences(map);
              setSynonymsOpen(false);
              notifySaved(t("wizard.synonymsSaved"));
            } catch (err) {
              const msg = wizardErrorMessage(err, String(err));
              if (msg) setError(msg);
            }
          })();
        }}
      />
      <TrainWizardHpsModal
        open={hpsOpen}
        hps={draft.hps}
        fileRel={hpsFileNameForModel(draft.model.name)}
        onClose={() => setHpsOpen(false)}
        onSave={(next) => {
          setDraft((d) => ({ ...d, hps: next, includeHpsearch: true }));
          setNotice(t("wizard.hpsSaved"));
        }}
      />
      <TrainWizardSnippetCalcModal
        open={snippetCalcOpen}
        projectId={projectId}
        draft={draft}
        onClose={() => setSnippetCalcOpen(false)}
        onApply={(batches) => {
          setDraft((d) => ({
            ...d,
            model: {
              ...d.model,
              n_batch_train: batches.train,
              n_batch_val: batches.val,
              n_batch_test: batches.test,
            },
          }));
          setNotice(t("wizard.calcApplied"));
        }}
      />
      <TrainWizardParamsJsonModal
        open={paramsJsonOpen}
        draft={draft}
        fileRel={
          pipeline?.parameter_filename?.trim() || "orcai_parameter.json"
        }
        busy={busy}
        onClose={() => setParamsJsonOpen(false)}
        onSave={saveParamsJsonToDisk}
        onReveal={revealParamsJson}
      />
    </div>
  );
}

/** Finetune catalog load + base-model apply (move-only from TrainWizard). */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { fetchModelDetail, fetchModels, type OrcaiModel } from "../api/models";
import { hasRuntimeSidecarBase } from "../api/sidecar";
import { parseParameterIntoDraft } from "./defaults";
import {
  finetuneApplyStillSameBase,
  finetuneBaseSharesExamples,
  finetuneLockMatchesSelection,
  finetuneOutputCollidesWithBase,
  finetuneSelectionMatchesBase,
  mergeFinetuneClasses,
  snapshotFinetuneLocks,
  suggestFinetuneModelName,
  type FinetuneLockSnapshot,
} from "./finetune";
import type { TrainWizardDraft } from "./types";
import { wizardErrorMessage } from "./wizardHelpers";

type Args = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  draftRef: { current: TrainWizardDraft };
  projectDir: string | null | undefined;
  sidecarPhase: string;
  annotationExampleIds: string[] | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  t: (key: string) => string;
};

export function useTrainWizardFinetuneCatalog({
  draft,
  setDraft,
  draftRef,
  projectDir,
  sidecarPhase,
  annotationExampleIds,
  setError,
  setNotice,
  t,
}: Args) {
  const [catalogModels, setCatalogModels] = useState<OrcaiModel[]>([]);
  const [finetuneApplyStatus, setFinetuneApplyStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [finetuneLock, setFinetuneLock] = useState<FinetuneLockSnapshot | null>(
    null,
  );
  const [finetuneApplyNonce, setFinetuneApplyNonce] = useState(0);
  const finetuneAppliedKeyRef = useRef<string | null>(null);
  const finetuneErrorRetriesRef = useRef(0);

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
        const msg = wizardErrorMessage(err, t);
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


  return {
    catalogModels,
    setCatalogModels,
    finetuneApplyStatus,
    setFinetuneApplyStatus,
    finetuneLock,
    setFinetuneLock,
    finetuneApplyNonce,
    setFinetuneApplyNonce,
    finetuneAppliedKeyRef,
    finetuneErrorRetriesRef,
    selectedBaseModel,
    baseSharesExamples,
  };
}

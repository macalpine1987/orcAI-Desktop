/** Equivalences persist chain for TrainWizard (move-only extract). */
import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { writeTextFile } from "../api/filterPreview";
import { joinFsPath } from "../lib/joinFsPath";
import {
  countSynonymRules,
  ensureIdentity,
  formatEquivalencesJson,
  replaceClassSynonyms,
  synonymsByClassFromMap,
  type EquivalencesMap,
} from "./equivalences";
import type { TrainWizardDraft } from "./types";
import { wizardErrorMessage } from "./wizardHelpers";

type Args = {
  projectDir: string | null | undefined;
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  setError: Dispatch<SetStateAction<string | null>>;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function useTrainWizardEquivalences({
  projectDir,
  draft,
  setDraft,
  setError,
  t,
}: Args): {
  equivalencesGenRef: MutableRefObject<number>;
  synonymRuleCount: number;
  persistEquivalences: (
    map?: EquivalencesMap,
    fromDraft?: TrainWizardDraft,
  ) => Promise<void>;
  synonymsByClass: Record<string, string[]>;
  commitClassSynonyms: (classId: string, synonyms: string[]) => void;
} {
  /** Bumped on every local equivalences edit — load must not clobber newer maps. */
  const equivalencesGenRef = useRef(0);
  /** Serialize disk writes so an older persist cannot finish after a newer one. */
  const equivalencesPersistChainRef = useRef(Promise.resolve());

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
    [projectDir, draft, setDraft],
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
          const msg = wizardErrorMessage(err, t);
          if (msg) setError(msg);
        });
      }
    },
    [draft.classes, persistEquivalences, setDraft, setError, t],
  );

  return {
    equivalencesGenRef,
    synonymRuleCount,
    persistEquivalences,
    synonymsByClass,
    commitClassSynonyms,
  };
}

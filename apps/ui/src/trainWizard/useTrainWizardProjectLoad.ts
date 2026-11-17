/** Project annotations / params / pipeline / equivalences load for TrainWizard. */
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  fetchProjectAnnotations,
  fetchProjectParameters,
  fetchProjectPipeline,
  type ProjectPipeline,
} from "../api/projects";
import { readTextFile } from "../api/filterPreview";
import { joinFsPath } from "../lib/joinFsPath";
import { isAbortError } from "../lib/fetchErrors";
import {
  emptyDraft,
  parseParameterIntoDraft,
  projectWizardDataPaths,
} from "./defaults";
import { finetuneExampleClassIds, mergeFinetuneClasses } from "./finetune";
import {
  parseEquivalencesJson,
  pickEquivalencesAfterLoad,
  type EquivalencesMap,
} from "./equivalences";
import { type ClassStatRow, type TrainWizardDraft } from "./types";
import { emptyAnnotationsFallback } from "./wizardHelpers";

type Args = {
  projectId: string | null;
  projectName: string;
  projectDir: string | null | undefined;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  setError: Dispatch<SetStateAction<string | null>>;
  equivalencesGenRef: MutableRefObject<number>;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function useTrainWizardProjectLoad({
  projectId,
  projectName,
  projectDir,
  setDraft,
  setError,
  equivalencesGenRef,
  t,
}: Args) {
  const [pipeline, setPipeline] = useState<ProjectPipeline | null>(null);
  const [annotationExampleIds, setAnnotationExampleIds] = useState<
    string[] | null
  >(null);

  const load = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
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
            hpsearchParallel: prev.hpsearchParallel,
            hps: { ...prev.hps },
            testAfterTrain: prev.testAfterTrain,
            nUnfilteredTestSnippets: prev.nUnfilteredTestSnippets,
            compression: prev.compression,
            // Step 2 always shows project layout (never the annotation import source).
            ...projectWizardDataPaths(projectDir),
            model: { ...prev.model },
            spectro: { ...prev.spectro },
          };
          const stats = (
            ann as {
              class_stats?: Array<{
                id: string;
                count: number;
                recordings: number;
                duration_sec: number;
                coverage: number;
              }>;
            }
          ).class_stats;
          const rows: ClassStatRow[] = (
            stats && stats.length
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
                  return {
                    id,
                    count,
                    recordings,
                    duration_sec: 0,
                    coverage: 0,
                  };
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
            const sel = new Set(
              prev.classes.filter((c) => c.selected).map((c) => c.id),
            );
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
              next.classes = mergeFinetuneClasses(
                baseCalls,
                rows.length ? rows : next.classes,
              );
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
          next.hpsearchParallel = prev.hpsearchParallel;
          next.hps = { ...prev.hps };
          next.testAfterTrain = prev.testAfterTrain;
          next.nUnfilteredTestSnippets = prev.nUnfilteredTestSnippets;
          return next;
        });
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return;
        setError(formatUserFacingErrorRequired(err, t));
      }
    },
    [projectId, projectName, projectDir, setDraft, setError, equivalencesGenRef, t],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load({ signal: ac.signal });
    return () => ac.abort();
  }, [load]);

  return {
    pipeline,
    setPipeline,
    annotationExampleIds,
    load,
  };
}

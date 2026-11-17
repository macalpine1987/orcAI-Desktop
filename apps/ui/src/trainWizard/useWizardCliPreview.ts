import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../lib/jobLogExport";
import { formatPlanCli, type PlanCommand } from "./planCommands";
import type { TrainWizardDraft } from "./types";
import { COPY_FEEDBACK_MS } from "../lib/timeouts";

type Args = {
  draft: TrainWizardDraft;
  planFull: PlanCommand[];
  planPrep: PlanCommand[];
  /** Resolved finetune base path (lock path preferred over draft id). */
  finetuneLoadFrom: string | null | undefined;
  clipboardFailedMessage: string;
  onClipboardError: (message: string) => void;
};

export function useWizardCliPreview({
  draft,
  planFull,
  planPrep,
  finetuneLoadFrom,
  clipboardFailedMessage,
  onClipboardError,
}: Args): {
  cmdPreview: string;
  cliCopied: boolean;
  onCopyCli: () => Promise<void>;
} {
  const [cliCopied, setCliCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const cmdPreview = useMemo(() => {
    if (draft.step === "scenario") {
      return formatPlanCli(planFull.length ? planFull : planPrep);
    }
    if (draft.step === "data") {
      if (draft.scenario === "finetune" && draft.finetuneBaseModel) {
        const loadFrom = finetuneLoadFrom || draft.finetuneBaseModel;
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
      const loadFrom = finetuneLoadFrom || draft.finetuneBaseModel;
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
  }, [draft, planFull, planPrep, finetuneLoadFrom]);

  const onCopyCli = useCallback(async () => {
    if (!cmdPreview.trim()) return;
    const ok = await copyText(cmdPreview);
    if (!ok) {
      onClipboardError(clipboardFailedMessage);
      return;
    }
    setCliCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCliCopied(false), COPY_FEEDBACK_MS);
  }, [cmdPreview, clipboardFailedMessage, onClipboardError]);

  return { cmdPreview, cliCopied, onCopyCli };
}

/** Browse project-relative paths for TrainWizard data step (move-only extract). */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { pickCsvFile, pickDirectory, pickJsonFile } from "../platform/dialog";
import {
  isOutsideProjectPath,
  projectWizardDataPaths,
  toProjectRelativePath,
  wizardPathAbsolute,
} from "./defaults";
import type { TrainWizardDraft } from "./types";

type Args = {
  projectDir: string | null | undefined;
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  language: string | undefined;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function useTrainWizardBrowsePath({
  projectDir,
  draft,
  setDraft,
  setNotice,
  language,
  t,
}: Args) {
  const browsePath = useCallback(
    async (
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
          (language || "en").toLowerCase().startsWith("ru")
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
    },
    [projectDir, draft, setDraft, setNotice, language, t],
  );

  return { browsePath };
}

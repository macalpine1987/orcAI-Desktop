import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import {
  saveProjectParameters,
  validateProjectParameters,
  type ProjectParameters,
  type ProjectRecord,
} from "../api/projects";
import { formatProjectError } from "../lib/projectErrors";
import {
  addedCallNames,
  parameterCallNames,
  recordingTableSyncModeAfterAdd,
} from "../lib/recordingTableSync";
import { pickJsonOutputFile } from "../platform/dialog";
import { writeTextFileAbsolute } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import type { ProjectTableSyncAfterChange } from "./useProjectTableSync";

type Options = {
  t: TFunction;
  detail: ProjectRecord | null;
  selectedId: string | null;
  parameters: ProjectParameters | null;
  beginBusy: () => boolean;
  endBusy: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setParameters: Dispatch<SetStateAction<ProjectParameters | null>>;
  setAnnotations: Dispatch<SetStateAction<import("../api/projects").ProjectAnnotations | null>>;
  loadDetail: (id: string) => Promise<ProjectRecord>;
  loadTable: (id: string, opts?: { silent?: boolean }) => Promise<void>;
  refreshSummary: () => Promise<unknown> | unknown;
  syncAfterChange: (opts: ProjectTableSyncAfterChange) => Promise<void>;
  notifySaved: (message: string) => void;
};

export function useProjectParametersActions({
  t,
  detail,
  selectedId,
  parameters,
  beginBusy,
  endBusy,
  setError,
  setParameters,
  setAnnotations,
  loadDetail,
  loadTable,
  refreshSummary,
  syncAfterChange,
  notifySaved,
}: Options) {
  const onValidateParameters = useCallback(
    (text: string) => {
      if (!selectedId) return Promise.reject(new Error("no project"));
      return validateProjectParameters(selectedId, text);
    },
    [selectedId],
  );

  const onSaveParameters = async (text: string) => {
    if (!detail) return;
    const before = parameterCallNames(parameters?.text);
    const after = parameterCallNames(text);
    const added = before && after ? addedCallNames(before, after) : [];
    if (!beginBusy()) return;
    setError(null);
    try {
      const saved = await saveProjectParameters(detail.id, text);
      setParameters(saved);
      notifySaved(t("projects.studio.params.saved"));
      setAnnotations(null);
      if (added.length === 0) {
        await Promise.all([loadTable(detail.id), refreshSummary()]);
        return;
      }
      const project = await loadDetail(detail.id);
      const hasTableWork =
        project.wav_count > 0 || Boolean(project.recording_table_path);
      await syncAfterChange({
        project,
        mode: recordingTableSyncModeAfterAdd(project),
        wantSync: hasTableWork,
        queuePending: false,
        markStaleNotice: true,
        onDeferRefresh: async (p) => {
          await Promise.all([loadTable(p.id), refreshSummary()]);
        },
      });
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onExportParameters = async (text: string) => {
    if (!parameters) return;
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const target = await pickJsonOutputFile(
      t("projects.studio.params.exportTitle"),
      parameters.filename,
    );
    if (!target) return;
    try {
      await writeTextFileAbsolute(target, text.endsWith("\n") ? text : `${text}\n`);
      notifySaved(t("projects.studio.params.exported", { path: target }));
    } catch (err) {
      setError(formatProjectError(err, t));
    }
  };

  return {
    onValidateParameters,
    onSaveParameters,
    onExportParameters,
  };
}

import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { JobRecord } from "../api/jobs";
import {
  deleteProjectAnnotations,
  deleteProjectRecordings,
  importProjectAnnotations,
  setProjectRecordingChannel,
  type ImportAnnotationsResult,
  type ProjectRecord,
  type ProjectRecordingTable,
} from "../api/projects";
import { formatPartialImportError, runProjectAudioImportJob } from "../lib/importProjectAudio";
import { filterAnnotationPaths } from "../lib/annotationDrop";
import { filterWavPaths } from "../lib/wavDrop";
import {
  formatAnnotationRejectedNotice,
  formatWavRejectedNotice,
} from "../lib/importFormatNotice";
import { formatProjectError } from "../lib/projectErrors";
import {
  recordingTableSyncModeAfterAdd,
  recordingTableSyncModeAfterDelete,
  shouldSyncRecordingTableAfterDelete,
} from "../lib/recordingTableSync";
import { pickAnnotationFiles, pickAudioFiles } from "../platform/dialog";
import type { ProjectTableSyncAfterChange } from "./useProjectTableSync";

type Options = {
  t: TFunction;
  detail: ProjectRecord | null;
  table: ProjectRecordingTable | null;
  selectedRows: Set<string>;
  canModify: boolean;
  engineReady: boolean;
  beginBusy: () => boolean;
  endBusy: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setTable: Dispatch<SetStateAction<ProjectRecordingTable | null>>;
  setSelectedRows: Dispatch<SetStateAction<Set<string>>>;
  setDeleteFilesOpen: (open: boolean) => void;
  loadDetail: (id: string) => Promise<ProjectRecord>;
  loadTable: (id: string, opts?: { silent?: boolean }) => Promise<void>;
  loadAnnotations: (id: string, opts?: { silent?: boolean }) => Promise<void>;
  refreshSummary: () => Promise<unknown> | unknown;
  syncAfterChange: (opts: ProjectTableSyncAfterChange) => Promise<void>;
  runTableSync: (id: string, mode: ReturnType<typeof recordingTableSyncModeAfterAdd>) => Promise<void>;
  trackJobInLab: (job: JobRecord) => void;
  notifySaved: (message: string) => void;
  notifyHeaderError: (message: string) => void;
};

export function useProjectRecordingActions({
  t,
  detail,
  table,
  selectedRows,
  canModify,
  engineReady,
  beginBusy,
  endBusy,
  setError,
  setTable,
  setSelectedRows,
  setDeleteFilesOpen,
  loadDetail,
  loadTable,
  loadAnnotations,
  refreshSummary,
  syncAfterChange,
  runTableSync,
  trackJobInLab,
  notifySaved,
  notifyHeaderError,
}: Options) {
  const importWavPaths = async (paths: string[]) => {
    if (!detail || !canModify) return;
    const notice = formatWavRejectedNotice(t, paths);
    const wavs = filterWavPaths(paths);
    if (notice) {
      notifyHeaderError(notice);
      setError(notice);
    }
    if (wavs.length === 0) return;
    if (!beginBusy()) return;
    if (!notice) setError(null);
    try {
      const result = await runProjectAudioImportJob(detail.id, wavs, {
        onJobCreated: trackJobInLab,
        t,
      });
      if (result.failed?.length) {
        const partial = formatPartialImportError(result.failed, t);
        setError(notice ? `${notice}\n${partial}` : partial);
      }
      const project = await loadDetail(detail.id);
      await syncAfterChange({
        project,
        mode: recordingTableSyncModeAfterAdd(project),
        markStaleNotice: true,
      });
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onAddWav = async () => {
    if (!detail || !canModify) return;
    const paths = await pickAudioFiles(t("projects.studio.actions.addWav"));
    if (paths.length === 0) return;
    await importWavPaths(paths);
  };

  const importAnnotationPaths = async (paths: string[]) => {
    if (!detail || !canModify) return;
    const notice = formatAnnotationRejectedNotice(t, paths);
    const txts = filterAnnotationPaths(paths);
    if (txts.length === 0) {
      const message =
        notice ?? t("projects.studio.annotations.noneImportable");
      notifyHeaderError(message);
      setError(message);
      return;
    }
    if (notice) {
      notifyHeaderError(notice);
      setError(notice);
    }
    if (!beginBusy()) return;
    if (!notice) setError(null);
    try {
      const result: ImportAnnotationsResult = await importProjectAnnotations(detail.id, txts);
      if (result.failed?.length) {
        const partial = formatPartialImportError(result.failed, t);
        setError(notice ? `${notice}\n${partial}` : partial);
      }
      if (result.imported_count > 0) {
        const importedNote = t("projects.studio.annotations.importResult", {
          imported: result.imported_count,
          unpaired: result.unpaired_imported_count ?? result.unpaired_count,
        });
        const added = result.added_calls ?? [];
        notifySaved(
          added.length
            ? `${importedNote} ${t("projects.studio.annotations.callsAdded", {
                labels: added.join(", "),
              })}`
            : importedNote,
        );
      } else if (!result.failed?.length && !notice) {
        setError(t("projects.studio.annotations.noneImported"));
      }
      const project = await loadDetail(detail.id);
      await syncAfterChange({
        project,
        mode: recordingTableSyncModeAfterAdd(project),
        wantSync: result.imported_count > 0,
      });
      // Always reload matrix after import — even when auto-sync refreshed other panes (BUG-04).
      await loadAnnotations(project.id);
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onAddAnnotations = async () => {
    if (!detail || !canModify) return;
    const paths = await pickAnnotationFiles(t("projects.studio.annotations.add"));
    if (paths.length === 0) return;
    await importAnnotationPaths(paths);
  };

  const onDeleteAnnotations = async (names: string[]) => {
    if (!detail || !canModify || names.length === 0) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      await deleteProjectAnnotations(detail.id, names);
      await loadAnnotations(detail.id);
      await refreshSummary();
      const project = detail;
      if (engineReady && (project.auto_sync_recording_table ?? true)) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onConfirmDeleteFiles = async () => {
    if (!detail || selectedRows.size === 0) return;
    setDeleteFilesOpen(false);
    if (!beginBusy()) return;
    setError(null);
    try {
      const rows = table?.rows ?? [];
      const selected = rows.filter((r) => selectedRows.has(r.recording));
      const wavRows = rows.filter((r) => r.wav_exists);
      const deleteAll =
        wavRows.length > 0 && wavRows.every((r) => selectedRows.has(r.recording));
      const filenames = selected.map((r) => {
        if (r.wav_path) {
          const norm = r.wav_path.replace(/\\/g, "/");
          return norm.split("/").pop() || r.recording;
        }
        return r.recording;
      });
      const result = await deleteProjectRecordings(
        detail.id,
        deleteAll ? { delete_all: true } : { filenames },
      );
      setSelectedRows(new Set());
      if (result.count === 0) {
        setError(t("projects.deleteNoneMatched"));
        return;
      }
      const project = await loadDetail(detail.id);
      await syncAfterChange({
        project,
        mode: recordingTableSyncModeAfterDelete(project),
        wantSync: shouldSyncRecordingTableAfterDelete(project),
        applyActiveOnDefer: true,
      });
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onChannelChange = async (recording: string, channel: number) => {
    if (!detail) return;
    setTable((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.recording === recording ? { ...r, channel } : r)),
          }
        : prev,
    );
    try {
      await setProjectRecordingChannel(detail.id, recording, channel);
      notifySaved(t("projects.studio.table.channelSaved"));
      void refreshSummary();
    } catch (err) {
      setError(formatProjectError(err, t));
      void loadTable(detail.id);
    }
  };

  const toggleRow = (name: string) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return {
    importWavPaths,
    onAddWav,
    importAnnotationPaths,
    onAddAnnotations,
    onDeleteAnnotations,
    onConfirmDeleteFiles,
    onChannelChange,
    toggleRow,
  };
}

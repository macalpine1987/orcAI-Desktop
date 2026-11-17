import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { JobRecord } from "../api/jobs";
import {
  deleteProject,
  ProjectNameTakenError,
  registerProject,
  startProjectInitJob,
  updateProject,
  type ProjectFocus,
  type ProjectRecord,
} from "../api/projects";
import { formatProjectError } from "../lib/projectErrors";
import { projectNameConflictMessage } from "../lib/projectName";
import { pickDirectory } from "../platform/dialog";
import { revealInFileManager } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import {
  applyActiveProject,
  applyActiveProjectFocus,
  clearActiveProjectIf,
} from "../workspace/project";
import { loadWorkspace } from "../workspace/storage";
import { forgetProjectStudio } from "./useProjectStudioLoaders";

type Options = {
  t: TFunction;
  projects: ProjectRecord[];
  detail: ProjectRecord | null;
  focus: ProjectFocus;
  deleteTarget: ProjectRecord | null;
  selectedId: string | null;
  engineReady: boolean;
  workspaceActiveProjectId: string | null | undefined;
  beginBusy: () => boolean;
  endBusy: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setTab: Dispatch<SetStateAction<import("../lib/projectsStudio").ProjectsTabId>>;
  setDetail: Dispatch<SetStateAction<ProjectRecord | null>>;
  setDeleteProjectOpen: (open: boolean) => void;
  setDeleteTarget: Dispatch<SetStateAction<ProjectRecord | null>>;
  setActiveJob: Dispatch<SetStateAction<JobRecord | null>>;
  handledJobIdRef: MutableRefObject<string | null>;
  refreshList: () => Promise<ProjectRecord[]>;
  refreshSummary: () => Promise<unknown> | unknown;
  trackJobInLab: (job: JobRecord) => void;
  notifySaved: (message: string) => void;
};

export function useProjectRegistryActions({
  t,
  projects,
  detail,
  focus,
  deleteTarget,
  selectedId,
  engineReady,
  workspaceActiveProjectId,
  beginBusy,
  endBusy,
  setError,
  setSelectedId,
  setTab,
  setDetail,
  setDeleteProjectOpen,
  setDeleteTarget,
  setActiveJob,
  handledJobIdRef,
  refreshList,
  refreshSummary,
  trackJobInLab,
  notifySaved,
}: Options) {
  const selectProject = (id: string) => {
    setError(null);
    // Update selection first so concurrent refreshList sees the new id (P-08).
    setSelectedId(id);
    setTab("recordings");
    const project = projects.find((p) => p.id === id);
    if (project && loadWorkspace().activeProjectId !== project.id) {
      applyActiveProject(project);
    }
  };

  const onOpenFolder = () => {
    if (detail) void revealInFileManager(detail.path);
  };

  const onOpenExisting = async () => {
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const dir = await pickDirectory(t("projects.pickFolderTitle"));
    if (!dir) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      const project = await registerProject(dir);
      await refreshList();
      applyActiveProject(project);
      selectProject(project.id);
    } catch (err) {
      if (err instanceof ProjectNameTakenError) {
        const folderLabel = dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;
        setError(projectNameConflictMessage(t, folderLabel, err.conflicts));
      } else {
        setError(formatProjectError(err, t));
      }
    } finally {
      endBusy();
    }
  };

  const onChangeFocus = async (next: ProjectFocus) => {
    if (!detail || next === focus) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      const updated = await updateProject(detail.id, { focus: next });
      setDetail(updated);
      if (updated.id === workspaceActiveProjectId) {
        applyActiveProjectFocus(next);
      }
      await Promise.all([refreshSummary(), refreshList()]);
      notifySaved(t("projects.studio.focus.saved"));
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onDeleteProject = async (deleteFiles: boolean) => {
    const target = deleteTarget ?? detail;
    if (!target) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      await deleteProject(target.id, deleteFiles);
      forgetProjectStudio(target.id);
      clearActiveProjectIf(target.id);
      setDeleteProjectOpen(false);
      setDeleteTarget(null);
      if (selectedId === target.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await refreshList();
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onInit = async () => {
    if (!detail || !engineReady) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      const job = await startProjectInitJob(detail.id);
      handledJobIdRef.current = null;
      setActiveJob(job);
      trackJobInLab(job);
    } catch (err) {
      setError(formatProjectError(err, t));
      endBusy();
    }
  };

  return {
    selectProject,
    onOpenFolder,
    onOpenExisting,
    onChangeFocus,
    onDeleteProject,
    onInit,
  };
}

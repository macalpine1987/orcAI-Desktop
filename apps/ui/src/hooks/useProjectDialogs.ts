import { useRef, useState } from "react";
import { type JobRecord } from "../api/jobs";
import { type ProjectRecord } from "../api/projects";

/**
 * Projects studio dialog / job-tracking UI state (refresh, delete, list, active job).
 * Keeps open flags out of the page model composer.
 */
export function useProjectDialogs() {
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [deleteFilesOpen, setDeleteFilesOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const handledJobIdRef = useRef<string | null>(null);
  const activeJobRef = useRef<JobRecord | null>(null);

  activeJobRef.current = activeJob;

  return {
    refreshOpen,
    setRefreshOpen,
    deleteFilesOpen,
    setDeleteFilesOpen,
    deleteProjectOpen,
    setDeleteProjectOpen,
    listOpen,
    setListOpen,
    deleteTarget,
    setDeleteTarget,
    activeJob,
    setActiveJob,
    handledJobIdRef,
    activeJobRef,
  };
}

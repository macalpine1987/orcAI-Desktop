import { errorText, formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { cancelJob, type JobRecord } from "../api/jobs";
import {
  checkProjectNameAvailable,
  createProject,
  ProjectNameTakenError,
  startProjectInitJob,
  type ProjectFocus,
  type ProjectRecord,
} from "../api/projects";
import type { WizardPhase } from "../components/projects/ProjectCreateWizard";
import { projectNameConflictMessage } from "../lib/projectName";
import {
  initialWizardParent,
  isMissingProjectParentError,
  wizardParentWhenCatalogMissing,
  type ProjectsTabId,
} from "../lib/projectsStudio";
import { pickDirectory } from "../platform/dialog";
import { defaultProjectsRoot } from "../platform/fsPaths";
import { isTauri } from "../platform/tauri";
import { applyActiveProject } from "../workspace/project";

type View = "studio" | "wizard";

type Options = {
  detailPath: string | null | undefined;
  projectsRoot: string | null | undefined;
  sidecarOnline: boolean;
  engineReady: boolean;
  trackJobInLab: (job: JobRecord) => void;
  refreshList: () => Promise<ProjectRecord[]>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setTab: Dispatch<SetStateAction<ProjectsTabId>>;
  setBusy: (busy: boolean) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setActiveJob: Dispatch<SetStateAction<JobRecord | null>>;
  activeJobRef: MutableRefObject<JobRecord | null>;
  handledJobIdRef: MutableRefObject<string | null>;
  formatError: (err: unknown) => string;
};

/**
 * Create-project wizard state, pending-init resume, and open/cancel/next actions.
 */
export function useProjectWizardFlow({
  detailPath,
  projectsRoot,
  sidecarOnline,
  engineReady,
  trackJobInLab,
  refreshList,
  setSelectedId,
  setTab,
  setBusy,
  setError,
  setActiveJob,
  activeJobRef,
  handledJobIdRef,
  formatError,
}: Options) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("studio");
  const [wizardFocus, setWizardFocus] = useState<ProjectFocus>("recognition");
  const [wizardName, setWizardName] = useState("");
  const [wizardParent, setWizardParent] = useState("");
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>("form");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [pendingInit, setPendingInit] = useState<{ projectId: string } | null>(
    () => {
      try {
        const raw = sessionStorage.getItem("orcai-desktop.pending-project-init");
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { projectId?: string };
        return parsed.projectId ? { projectId: parsed.projectId } : null;
      } catch {
        return null;
      }
    },
  );
  const persistPendingInit = useCallback(
    (value: { projectId: string } | null) => {
      setPendingInit(value);
      try {
        if (value) {
          sessionStorage.setItem(
            "orcai-desktop.pending-project-init",
            JSON.stringify(value),
          );
        } else {
          sessionStorage.removeItem("orcai-desktop.pending-project-init");
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );
  const wizardCancelledRef = useRef(false);

  // Wizard: init starts once the engine is up (pendingInit survives remount via sessionStorage).
  useEffect(() => {
    if (!pendingInit || !engineReady || !sidecarOnline) return;
    if (wizardCancelledRef.current) {
      persistPendingInit(null);
      return;
    }
    const { projectId } = pendingInit;
    persistPendingInit(null);
    setView("wizard");
    setWizardPhase("init");
    setBusy(true);
    void startProjectInitJob(projectId)
      .then((job) => {
        handledJobIdRef.current = null;
        setActiveJob(job);
        trackJobInLab(job);
      })
      .catch((err) => {
        setWizardError(formatUserFacingErrorRequired(err, t));
        setWizardPhase("form");
        setBusy(false);
      });
  }, [
    pendingInit,
    engineReady,
    sidecarOnline,
    trackJobInLab,
    persistPendingInit,
    setBusy,
    setActiveJob,
    handledJobIdRef,
  ]);

  const openWizard = useCallback(() => {
    wizardCancelledRef.current = false;
    setWizardFocus("recognition");
    setWizardName("");
    const known = initialWizardParent({
      projectsRoot,
      activeProjectPath: detailPath,
    });
    setWizardParent(known);
    setWizardPhase("form");
    setWizardError(null);
    persistPendingInit(null);
    setView("wizard");
    if (!known) {
      void defaultProjectsRoot().then((root) => {
        setWizardParent((current) => current || root);
      });
    }
  }, [detailPath, persistPendingInit, projectsRoot]);

  const cancelWizard = useCallback(() => {
    wizardCancelledRef.current = true;
    const job = activeJobRef.current;
    if (job && (job.status === "running" || job.status === "pending")) {
      void cancelJob(job.id).catch((err) => {
        setError(formatError(err));
      });
    }
    persistPendingInit(null);
    setActiveJob(null);
    setWizardPhase("form");
    setBusy(false);
    setView("studio");
  }, [
    activeJobRef,
    formatError,
    persistPendingInit,
    setActiveJob,
    setBusy,
    setError,
  ]);

  const onWizardPickParent = useCallback(async () => {
    if (!isTauri()) {
      setWizardError(t("projects.desktopRequired"));
      return;
    }
    const dir = await pickDirectory(t("projects.pickParentTitle"));
    if (dir) {
      setWizardParent(dir);
      setWizardError(null);
    }
  }, [t]);

  const onWizardNext = useCallback(async () => {
    let parent = wizardParent.trim();
    if (!parent) {
      parent = initialWizardParent({
        projectsRoot,
        activeProjectPath: detailPath,
        fallbackRoot: await defaultProjectsRoot(),
      });
      if (parent) setWizardParent(parent);
    }
    const name = wizardName.trim();
    if (!parent || !name) {
      setWizardError(t("projects.fieldsRequired"));
      return;
    }
    if (!sidecarOnline) {
      setWizardError(t("predict.importSidecarRequired"));
      return;
    }
    setBusy(true);
    setWizardError(null);
    wizardCancelledRef.current = false;
    let retriedMissingCatalog = false;
    try {
      for (;;) {
        try {
          const check = await checkProjectNameAvailable(parent, name);
          if (!check.available) {
            setWizardError(projectNameConflictMessage(t, name, check.conflicts));
            setBusy(false);
            return;
          }
          setWizardPhase("creating");
          const project = await createProject({
            parent_dir: parent,
            display_name: name,
            description: "",
            focus: wizardFocus,
          });
          applyActiveProject(project);
          await refreshList();
          setSelectedId(project.id);
          setTab("recordings");
          if (!engineReady) {
            // Busy stays on while we wait: the init job is queued for the engine.
            setWizardPhase("waiting_engine");
            persistPendingInit({ projectId: project.id });
            return;
          }
          setWizardPhase("init");
          const job = await startProjectInitJob(project.id);
          handledJobIdRef.current = null;
          setActiveJob(job);
          trackJobInLab(job);
          return;
        } catch (err) {
          if (
            !retriedMissingCatalog &&
            isMissingProjectParentError(errorText(err))
          ) {
            const fallback = wizardParentWhenCatalogMissing({
              parent,
              projectsRoot: projectsRoot ?? "",
              fallbackRoot: await defaultProjectsRoot(),
            });
            if (fallback) {
              retriedMissingCatalog = true;
              parent = fallback;
              setWizardParent(parent);
              continue;
            }
          }
          throw err;
        }
      }
    } catch (err) {
      setWizardPhase("form");
      setWizardError(
        err instanceof ProjectNameTakenError
          ? projectNameConflictMessage(t, name, err.conflicts)
          : formatUserFacingErrorRequired(err, t),
      );
      setBusy(false);
    }
  }, [
    detailPath,
    engineReady,
    handledJobIdRef,
    persistPendingInit,
    projectsRoot,
    refreshList,
    setActiveJob,
    setBusy,
    setSelectedId,
    setTab,
    sidecarOnline,
    t,
    trackJobInLab,
    wizardFocus,
    wizardName,
    wizardParent,
  ]);

  const onWizardDisplayName = useCallback((v: string) => {
    setWizardName(v);
    setWizardError(null);
  }, []);

  return {
    view,
    setView,
    wizardFocus,
    setWizardFocus,
    wizardName,
    wizardParent,
    wizardPhase,
    setWizardPhase,
    wizardError,
    setWizardError,
    openWizard,
    cancelWizard,
    onWizardPickParent,
    onWizardNext,
    onWizardDisplayName,
  };
}

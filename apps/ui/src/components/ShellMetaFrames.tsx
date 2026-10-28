import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { fetchModels } from "../api/models";
import { fetchProjects, type ProjectRecord } from "../api/projects";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { shellModelDisplayLabel } from "../lib/shellMetaFrames";
import { applyActiveProject } from "../workspace/project";
import {
  RuntimeReadyLamp,
  runtimeReadyLampState,
} from "./RuntimeReadyLamp";
import { PredictProjectModelFrames } from "./PredictProjectModelFrames";

type OpenMenu = "project" | null;

type Props = {
  projectName?: string | null;
  modelId?: string | null;
  hasActiveProject?: boolean;
  activeProjectId?: string | null;
  projectDir?: string | null;
  showEngine?: boolean;
  /** Predict-model frame; false for training focus (except `/predict*`). */
  showModel?: boolean;
  modelSettingsOpen?: boolean;
  onToggleModelSettings?: () => void;
};

function MetaChevron({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={clsx("shell-meta-chevron", muted && "shell-meta-chevron--muted")}
      aria-hidden
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6.5 8 10.5 12 6.5" />
      </svg>
    </span>
  );
}

function HeaderMetaFrameButton({
  label,
  value,
  open,
  disabled,
  ariaLabel,
  title,
  leading,
  trailing,
  onToggle,
  menuId,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onToggle: () => void;
  menuId: string;
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onToggle();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const root = wrapRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        onToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onToggle]);

  return (
    <div className="shell-meta-frame-wrap" ref={wrapRef}>
      <button
        type="button"
        className={clsx(
          "predict-page-meta-frame shell-meta-frame shell-meta-frame--button",
          open && "is-open",
          disabled && "is-disabled",
        )}
        title={title ?? value}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={onToggle}
      >
        {leading}
        <div className="predict-page-meta-text">
          <span className="predict-page-meta-label">{label}</span>
          <span className="predict-page-meta-value">{value}</span>
        </div>
        {trailing}
      </button>
      {open ? children : null}
    </div>
  );
}

function HeaderMetaFrameStatic({
  label,
  value,
  title,
  leading,
  trailing,
}: {
  label: string;
  value: string;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="predict-page-meta-frame shell-meta-frame" title={title ?? value}>
      {leading}
      <div className="predict-page-meta-text">
        <span className="predict-page-meta-label">{label}</span>
        <span className="predict-page-meta-value">{value}</span>
      </div>
      {trailing}
    </div>
  );
}

function ShellMetaPopover({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-labelledby={labelledBy}
      className="shell-meta-popover"
    >
      {children}
    </div>
  );
}

/** Project · Model · Engine header frames (m16 jobs, predict, projects). */
export function ShellMetaFrames({
  projectName = null,
  modelId = null,
  hasActiveProject = false,
  activeProjectId = null,
  projectDir = null,
  showEngine = false,
  showModel = true,
  modelSettingsOpen = false,
  onToggleModelSettings,
}: Props) {
  const { t } = useTranslation();
  const { runtimeStep, online, gracefulRuntimeRestart } = useSidecarStatus();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [resolvedModelName, setResolvedModelName] = useState<string | null>(
    null,
  );
  const projectMenuId = useId();
  const projectLabelId = useId();

  const lampState = gracefulRuntimeRestart
    ? "loading"
    : runtimeReadyLampState({ runtimeStep });
  const engineRunning = lampState === "on";
  const engineBusy = lampState === "loading";

  let engineValue = t("jobs.meta.engineStopped");
  if (engineRunning) {
    engineValue = t("jobs.meta.engineRunning");
  } else if (engineBusy) {
    // CPU/GPU restart uses the content banner; keep the engine readout short.
    engineValue = t("home.runtimeComponentActive");
  }
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const toggleProject = useCallback(() => {
    setOpenMenu((cur) => (cur === "project" ? null : "project"));
  }, []);

  useEffect(() => {
    if (openMenu !== "project") return;
    if (!online) {
      setProjects([]);
      setProjectsError(true);
      setProjectsLoading(false);
      return;
    }
    let cancelled = false;
    setProjectsLoading(true);
    setProjectsError(false);
    void fetchProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setProjectsError(true);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openMenu, online]);

  useEffect(() => {
    if (!engineRunning && openMenu) setOpenMenu(null);
  }, [engineRunning, openMenu]);

  useEffect(() => {
    const id = modelId?.trim() ?? "";
    if (!hasActiveProject || !id || !engineRunning || !online) {
      setResolvedModelName(null);
      return;
    }
    // Builtin ids are already display names; only resolve trained path ids.
    if (!id.includes("/") && !id.includes("\\")) {
      setResolvedModelName(null);
      return;
    }
    let cancelled = false;
    void fetchModels(projectDir ?? undefined)
      .then((models) => {
        if (cancelled) return;
        const hit = models.find((m) => m.id === id || m.path === id);
        setResolvedModelName(hit?.name?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setResolvedModelName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasActiveProject, modelId, projectDir, engineRunning, online]);

  const selectProject = (project: ProjectRecord) => {
    applyActiveProject(project);
    closeMenu();
  };

  if (showEngine) {
    const projectValue = projectName?.trim() || t("jobs.meta.noProject");
    const modelRaw = modelId?.trim() ? modelId.trim() : null;
    const modelValue = modelRaw
      ? shellModelDisplayLabel(modelRaw, resolvedModelName) ?? t("jobs.meta.noModel")
      : t("jobs.meta.noModel");

    return (
      <div className="shell-meta-frames" role="group" aria-label={t("predict.metaFrames.aria")}>
        {engineRunning ? (
          <>
            <HeaderMetaFrameButton
              label={t("spectrogram.segment.projectLabel")}
              value={projectValue}
              open={openMenu === "project"}
              ariaLabel={t("shellMeta.pickProject")}
              title={projectValue}
              trailing={<MetaChevron />}
              onToggle={toggleProject}
              menuId={projectMenuId}
            >
              <span id={projectLabelId} className="shell-meta-sr-only">
                {t("shellMeta.pickProject")}
              </span>
              <ShellMetaPopover
                id={projectMenuId}
                labelledBy={projectLabelId}
              >
                {projectsLoading ? (
                  <p className="shell-meta-popover-empty">{t("shellMeta.loading")}</p>
                ) : projectsError && !online ? (
                  <p className="shell-meta-popover-empty">{t("shellMeta.sidecarOffline")}</p>
                ) : projectsError ? (
                  <p className="shell-meta-popover-empty">{t("shellMeta.loadFailed")}</p>
                ) : projects.length === 0 ? (
                  <p className="shell-meta-popover-empty">{t("shellMeta.noProjects")}</p>
                ) : (
                  <ul className="shell-meta-popover-list">
                    {projects.map((p) => {
                      const selected = p.id === activeProjectId;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={clsx(
                              "shell-meta-popover-item",
                              selected && "is-selected",
                            )}
                            title={p.path}
                            onClick={() => selectProject(p)}
                          >
                            <span className="shell-meta-popover-item-name">
                              {p.display_name}
                            </span>
                            {selected ? (
                              <span className="shell-meta-popover-item-badge">
                                {t("shellMeta.active")}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ShellMetaPopover>
            </HeaderMetaFrameButton>

            {showModel ? (
              <HeaderMetaFrameStatic
                label={t("spectrogram.segment.modelLabel")}
                value={modelValue}
                title={modelRaw ?? modelValue}
              />
            ) : null}
          </>
        ) : null}

        <HeaderMetaFrameStatic
          label={t("jobs.meta.engine")}
          value={engineValue}
          leading={
            <RuntimeReadyLamp
              state={lampState}
              title={engineValue}
              aria-label={engineValue}
              className="shrink-0"
            />
          }
        />
      </div>
    );
  }

  if (!projectName && !(showModel && modelId)) return null;

  return (
    <div className="shell-meta-frames" role="group" aria-label={t("predict.metaFrames.aria")}>
      <PredictProjectModelFrames
        projectName={projectName}
        modelId={showModel ? modelId : null}
        modelSettingsOpen={modelSettingsOpen}
        onToggleModelSettings={onToggleModelSettings}
      />
    </div>
  );
}

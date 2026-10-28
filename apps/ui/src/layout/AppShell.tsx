import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { AppBrand } from "../components/AppBrand";
import { ClearedActiveProjectBanner } from "../components/ClearedActiveProjectBanner";
import { CommandPalette } from "../components/CommandPalette";
import { LabDock } from "../components/LabDock";
import { PipelineSnippetsShortageBanner } from "../components/PipelineSnippetsShortageBanner";
import { ProjectDataHealthBanner } from "../components/ProjectDataHealthBanner";
import { ShellMetaFrames } from "../components/ShellMetaFrames";
import { RuntimeRestartBanner } from "../components/RuntimeRestartBanner";
import { RuntimeRouteGuard } from "../components/RuntimeRouteGuard";
import { useSectionsAccessible } from "../hooks/useAppAccess";
import { useShellMetaFramesBridge } from "../hooks/useShellMetaFramesBridge";
import { isRuntimeFreeNavId } from "../lib/appAccess";
import {
  collapsedAfterEdgeDrag,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "../lib/sidebarCollapse";
import {
  shellMetaEngineVisible,
  shellMetaFramesVisible,
  shellMetaModelVisible,
} from "../lib/shellMetaFrames";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePreferences } from "../preferences/PreferencesContext";
import { NavIcon } from "../components/NavIcon";
import {
  pipelineNavInactiveForWorkspace,
  visibleNav,
  type NavItem,
} from "./navigation";
import { loadPredictSettings } from "../workspace/predictSettings";

function Header() {
  const location = useLocation();
  const workspace = useWorkspace();
  const bridge = useShellMetaFramesBridge();
  const showMeta = shellMetaFramesVisible(location.pathname);
  const jobsStudio = location.pathname === "/jobs";
  const alignMetaToStudio =
    showMeta && (location.pathname.startsWith("/predict") || jobsStudio);

  const projectName =
    bridge.projectNameOverride !== undefined
      ? bridge.projectNameOverride
      : workspace.projectName ?? null;
  const modelId =
    bridge.modelIdOverride !== undefined
      ? bridge.modelIdOverride
      : workspace.predictSettings?.model?.trim() ||
        loadPredictSettings().model ||
        null;
  const hasActiveProject = Boolean(
    workspace.activeProjectId && workspace.projectDir,
  );
  // Legacy workspace without activeProjectFocus: kind training → hide; else show.
  const focusForModel =
    workspace.activeProjectFocus ??
    (hasActiveProject
      ? workspace.activeProjectKind === "training"
        ? "training"
        : "recognition"
      : null);
  const showModel = shellMetaModelVisible({
    pathname: location.pathname,
    hasActiveProject,
    focus: focusForModel,
  });

  return (
    <header
      className={clsx(
        "mat-shell-header flex shrink-0 items-center justify-between gap-4 px-4 py-2",
        "min-h-14",
        alignMetaToStudio && "mat-shell-header--meta-studio",
      )}
    >
      <AppBrand studio={false} />
      {showMeta ? (
        <ShellMetaFrames
          projectName={projectName}
          modelId={modelId}
          hasActiveProject={hasActiveProject}
          activeProjectId={workspace.activeProjectId}
          projectDir={workspace.projectDir}
          showEngine={shellMetaEngineVisible(location.pathname)}
          showModel={showModel}
          modelSettingsOpen={bridge.modelSettingsOpen ?? false}
          onToggleModelSettings={bridge.onToggleModelSettings ?? undefined}
        />
      ) : null}
    </header>
  );
}

function SidebarNavItem({
  item,
  restricted,
  restrictedTitle,
  collapsed,
}: {
  item: NavItem;
  restricted: boolean;
  restrictedTitle?: string;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const labelText = t(`nav.${item.id}`);
  const label = (
    <>
      <NavIcon id={item.id} />
      {!collapsed ? (
        <span className="min-w-0 truncate">{labelText}</span>
      ) : (
        <span className="sr-only">{labelText}</span>
      )}
    </>
  );

  if (restricted) {
    return (
      <span
        aria-disabled="true"
        title={restrictedTitle ?? t("app.navRequiresRuntime")}
        className={clsx(
          "mat-nav-item flex cursor-not-allowed items-center text-foreground-muted opacity-45",
          collapsed ? "justify-center px-1" : "gap-2 px-2",
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <NavLink
      to={item.path}
      title={labelText}
      className={({ isActive }) =>
        clsx(
          "mat-nav-item flex items-center transition-colors",
          collapsed ? "justify-center px-1" : "gap-2 px-2",
          isActive
            ? "is-active font-medium"
            : "text-foreground-muted hover:bg-mat-raised hover:text-foreground",
        )
      }
    >
      {label}
    </NavLink>
  );
}

/** Variant C: thin right-edge grip — click or horizontal drag to collapse/expand. */
function SidebarCollapseGrip({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientX - drag.startX) > 3) drag.moved = true;
  };

  const finish = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const deltaX = e.clientX - drag.startX;
    if (!drag.moved) {
      onCollapsedChange(!collapsed);
      return;
    }
    onCollapsedChange(
      collapsedAfterEdgeDrag({ wasCollapsed: collapsed, deltaX }),
    );
  };

  return (
    <button
      type="button"
      className="mat-shell-sidebar-grip"
      aria-label={
        collapsed ? t("app.sidebarExpand") : t("app.sidebarCollapse")
      }
      aria-expanded={!collapsed}
      title={collapsed ? t("app.sidebarExpand") : t("app.sidebarCollapse")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <span className="mat-shell-sidebar-grip-bar" aria-hidden />
    </button>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const items = visibleNav();
  const sectionsAccessible = useSectionsAccessible();
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);

  const onCollapsedChange = useCallback((next: boolean) => {
    setCollapsed(next);
    saveSidebarCollapsed(next);
  }, []);

  return (
    <aside
      className={clsx(
        "mat-shell-sidebar relative flex h-full min-h-0 shrink-0 flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar",
      )}
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={t("app.sidebarNav")}
    >
      <nav
        className={clsx(
          "flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overflow-x-hidden p-1.5",
          collapsed && "pr-2",
        )}
      >
        {items.map((item) => {
          const focusBlocked =
            item.id === "pipeline" &&
            pipelineNavInactiveForWorkspace(workspace);
          const runtimeBlocked =
            !sectionsAccessible && !isRuntimeFreeNavId(item.id);
          return (
            <SidebarNavItem
              key={item.id}
              item={item}
              collapsed={collapsed}
              restricted={runtimeBlocked || focusBlocked}
              restrictedTitle={
                focusBlocked ? t("app.navRequiresTrainingFocus") : undefined
              }
            />
          );
        })}
      </nav>
      <SidebarCollapseGrip
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
      />
    </aside>
  );
}

export function AppShell() {
  const location = useLocation();
  const { defaultDockCollapsed } = usePreferences();
  const homeStudio = location.pathname === "/";
  const jobsStudio = location.pathname === "/jobs";
  const settingsStudio = location.pathname === "/settings";
  const helpStudio = location.pathname === "/help";
  const projectsStudio = location.pathname === "/projects";
  const predictStudio = location.pathname === "/predict";
  const resultsStudio = location.pathname === "/results";
  const pipelineStudio = location.pathname === "/pipeline";
  const modelsStudio = location.pathname === "/models";
  const pageStudio =
    homeStudio ||
    jobsStudio ||
    settingsStudio ||
    helpStudio ||
    projectsStudio ||
    predictStudio ||
    resultsStudio ||
    pipelineStudio ||
    modelsStudio;

  return (
    <div
      className={clsx(
        "app-viewport flex min-h-0 flex-col",
        homeStudio && "app-viewport--home-studio",
        jobsStudio && "app-viewport--jobs-studio",
        settingsStudio && "app-viewport--settings-studio",
        helpStudio && "app-viewport--help-studio",
        projectsStudio && "app-viewport--projects-studio",
        predictStudio && "app-viewport--predict-studio",
        resultsStudio && "app-viewport--results-studio",
        pipelineStudio && "app-viewport--pipeline-studio",
        modelsStudio && "app-viewport--models-studio",
      )}
      data-lab-dock={defaultDockCollapsed ? "collapsed" : "expanded"}
    >
      <CommandPalette />
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            className={clsx(
              "mat-shell-main flex min-h-0 flex-1 flex-col",
              pageStudio
                ? clsx(
                    "mat-shell-main--page-studio overflow-hidden",
                    homeStudio && "mat-shell-main--home-studio",
                    jobsStudio && "mat-shell-main--jobs-studio",
                    settingsStudio && "mat-shell-main--settings-studio",
                    helpStudio && "mat-shell-main--help-studio",
                    projectsStudio && "mat-shell-main--projects-studio",
                    predictStudio && "mat-shell-main--predict-studio",
                    resultsStudio && "mat-shell-main--results-studio",
                    pipelineStudio && "mat-shell-main--pipeline-studio",
                    modelsStudio && "mat-shell-main--models-studio",
                  )
                : "overflow-hidden p-6",
            )}
          >
            <ClearedActiveProjectBanner />
            <RuntimeRestartBanner />
            <ProjectDataHealthBanner />
            <PipelineSnippetsShortageBanner />
            <div
              className={clsx(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                pageStudio ? "overflow-hidden" : "overflow-auto",
              )}
            >
              <RuntimeRouteGuard />
            </div>
          </main>
          <LabDock />
        </div>
      </div>
    </div>
  );
}

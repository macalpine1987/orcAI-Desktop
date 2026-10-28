import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavIcon } from "../../components/NavIcon";
import { useSectionsAccessible } from "../../hooks/useAppAccess";
import { useWorkspace } from "../../hooks/useWorkspace";
import {
  pipelineNavInactiveForWorkspace,
  type NavItemId,
} from "../../layout/navigation";

type QuickAction = {
  id: string;
  titleKey: string;
  descKey: string;
  path: string;
  /** Sidebar icon reused on the action card (m01). */
  iconId?: NavItemId;
  /** Custom icon not present in the sidebar (m01 funnel for filter). */
  customIcon?: "filter";
  state?: Record<string, unknown>;
  requiresRuntime?: boolean;
};

/** m01 quick-action funnel — same stroke language as NavIcon. */
function IconFilterFunnel() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16l-6.2 7.2V18l-3.6 2v-7.8L4 5Z" />
    </svg>
  );
}

const ACTIONS: QuickAction[] = [
  {
    id: "predict",
    titleKey: "home.quickPredict",
    descKey: "home.quickPredictDesc",
    path: "/predict",
    iconId: "predict",
    state: { tab: "run" },
    requiresRuntime: true,
  },
  {
    id: "train",
    titleKey: "home.trainModel",
    descKey: "home.trainModelDesc",
    path: "/pipeline",
    iconId: "models",
    requiresRuntime: true,
  },
  {
    id: "filter",
    titleKey: "home.quickFilter",
    descKey: "home.quickFilterDesc",
    path: "/predict",
    customIcon: "filter",
    state: { tab: "filter" },
    requiresRuntime: true,
  },
  {
    id: "results",
    titleKey: "home.quickResults",
    descKey: "home.quickResultsDesc",
    path: "/results",
    iconId: "results",
    requiresRuntime: true,
  },
];

export function HomeQuickActions({
  predictBlocked = false,
}: {
  predictBlocked?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const sectionsAccessible = useSectionsAccessible();
  const hasProject = Boolean(workspace.activeProjectId && workspace.projectDir);

  return (
    <section className="home-quick-actions">
      <h2 className="mb-3 text-sm font-medium text-foreground">
        {t("home.quickActionsTitle")}
      </h2>
      <div className="home-quick-actions-grid">
        {ACTIONS.map((action) => {
          const blockedByTable = action.id === "predict" && predictBlocked;
          const blockedByFocus =
            action.id === "train" &&
            pipelineNavInactiveForWorkspace(workspace);
          const disabled =
            !hasProject ||
            Boolean(action.requiresRuntime && !sectionsAccessible) ||
            blockedByTable ||
            blockedByFocus;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              title={
                !hasProject
                  ? t("home.quickActionsNeedProject")
                  : blockedByFocus
                    ? t("app.navRequiresTrainingFocus")
                    : blockedByTable
                      ? t("projects.studio.table.predictBlockedStale")
                      : undefined
              }
              className="mat-card home-quick-action p-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() =>
                navigate(action.path, {
                  state: {
                    ...action.state,
                    fromHome: true,
                    projectId: workspace.activeProjectId,
                    projectDir: workspace.projectDir,
                  },
                })
              }
            >
              <span className="flex items-start gap-2.5">
                {action.customIcon === "filter" ? (
                  <span className="home-quick-action-icon mt-0.5 text-foreground-muted">
                    <IconFilterFunnel />
                  </span>
                ) : action.iconId ? (
                  <NavIcon
                    id={action.iconId}
                    className="home-quick-action-icon mt-0.5 text-foreground-muted"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {t(action.titleKey)}
                  </span>
                  <span className="mt-1 block text-xs text-foreground-muted">
                    {t(action.descKey)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

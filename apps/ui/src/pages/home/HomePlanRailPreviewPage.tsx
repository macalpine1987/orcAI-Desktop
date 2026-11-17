/**
 * Lab-chrome preview of Home + wizard plan rail.
 * Uses the same CSS tokens / RuntimeControlPanel / HomeProjectCard as production.
 * Route: /__preview/home-plan-rail (not in sidebar).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RuntimeControlPanel } from "../../components/RuntimeControlPanel";
import { PageHelpButton } from "../../components/PageHelpButton";
import { HomeProjectCard } from "./HomeProjectCard";
import { HomeQuickActions } from "./HomeQuickActions";
import {
  HOME_WIZARD_PLAN_DEMO_STEPS,
  type HomeWizardPlanStep,
} from "./HomeWizardPlanRail";

const DEMO_ERROR_STEPS: HomeWizardPlanStep[] = [
  { id: "create-spectrograms", status: "done" },
  { id: "create-label-arrays", status: "done" },
  { id: "create-snippet-table", status: "error" },
  { id: "create-tvt-snippet-tables", status: "queued" },
  { id: "create-tvt-data", status: "queued" },
  { id: "train", status: "queued" },
  { id: "test", status: "queued" },
];

type DemoMode = "running" | "idle" | "error";

export function HomePlanRailPreviewPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DemoMode>("running");

  const steps = useMemo(() => {
    if (mode === "idle") return null;
    if (mode === "error") return DEMO_ERROR_STEPS;
    return HOME_WIZARD_PLAN_DEMO_STEPS;
  }, [mode]);

  const foot = useMemo(() => {
    if (!steps) return null;
    if (mode === "error") {
      return "plan · сбой на create-snippet-table · остальное снято";
    }
    const done = steps.filter((s) => s.status === "done").length;
    return t("home.wizardPlanFoot", { done, total: steps.length });
  }, [mode, steps, t]);

  return (
    <div className="home-page home-studio home-plan-rail-preview">
      <div
        className="home-plan-rail-preview-banner"
        role="note"
      >
        <span>
          Превью Lab UI · маршрут{" "}
          <code>/__preview/home-plan-rail</code> · те же компоненты, что на
          Главной
        </span>
        <span className="home-plan-rail-preview-modes">
          <button
            type="button"
            className={mode === "running" ? "is-on" : undefined}
            onClick={() => setMode("running")}
          >
            План идёт
          </button>
          <button
            type="button"
            className={mode === "idle" ? "is-on" : undefined}
            onClick={() => setMode("idle")}
          >
            Без плана
          </button>
          <button
            type="button"
            className={mode === "error" ? "is-on" : undefined}
            onClick={() => setMode("error")}
          >
            Сбой
          </button>
        </span>
      </div>

      <div className="studio-panel home-work-panel">
        <div className="home-page-header">
          <div className="home-page-header-copy">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("home.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {t("home.subtitle")}
            </p>
          </div>
          <PageHelpButton />
        </div>

        <div className="home-panel-body">
          <div className="home-grid-top">
            <RuntimeControlPanel
              runtimeStep="ready"
              sidecarLine={{
                label: t("home.runtimeSidecar"),
                status: t("home.runtimeSidecarRunning"),
                detail: t("home.runtimeSidecarPort", { port: 8743 }),
                ok: true,
                active: false,
              }}
              engineLine={{
                label: t("home.runtimeEngine"),
                status: t("home.runtimeEngineLoaded"),
                detail: t("home.runtimeEngineBundled", { version: "3.0.4" }),
                ok: true,
                active: false,
              }}
              pythonLine={{
                label: t("home.runtimePython"),
                status: t("home.runtimePythonReady"),
                detail: t("home.runtimePythonBundled", { python: "3.11" }),
                ok: true,
                active: false,
              }}
              acceleratorLine={{
                label: t("home.runtimeAccelerator"),
                status: t("home.runtimeAcceleratorCpu"),
                detail: "CPU",
                ok: true,
                active: false,
              }}
              canStart={false}
              canRestart
              canStop
              busy={false}
              onStart={() => undefined}
              onRestart={() => undefined}
              onStop={() => undefined}
              runtimeAutostart={false}
              onRuntimeAutostartChange={() => undefined}
            />

            <HomeProjectCard
              projectName="Fjord-Field-2026"
              projectPath="/Users/demo/Fjord-Field-2026"
              projectId="preview-fjord-field-2026"
              recordings={42}
              annotations={38}
              predicted={12}
              activeModelLabel="orcai-isl-v1"
              tableSyncStatus="current"
              engineReady
              onChangeProject={() => undefined}
              wizardPlanSteps={steps}
              wizardPlanFoot={foot}
            />
          </div>

          <HomeQuickActions />

          <section className="home-recent-jobs mat-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">
                {t("home.recentJobsTitle")}
              </h2>
              <span className="font-mono text-[11px] text-[#7dffa3]">
                {t("home.recentJobsAll")}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-[#2a2c2f]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#232425] text-[10px] uppercase tracking-wider text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Команда</th>
                    <th className="px-3 py-2 font-semibold">Статус</th>
                    <th className="px-3 py-2 font-semibold">Проект</th>
                    <th className="px-3 py-2 font-semibold">
                      {t("home.recentJobsColFinished")}
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-t border-[#222425]">
                    <td className="px-3 py-2 text-[#9ce3ba]">train</td>
                    <td className="px-3 py-2">выполняется</td>
                    <td className="px-3 py-2 text-foreground-muted">
                      Fjord-Field-2026
                    </td>
                    <td className="px-3 py-2 text-foreground-muted">—</td>
                  </tr>
                  <tr className="border-t border-[#222425]">
                    <td className="px-3 py-2 text-[#9ce3ba]">create-tvt-data</td>
                    <td className="px-3 py-2">готово</td>
                    <td className="px-3 py-2 text-foreground-muted">
                      Fjord-Field-2026
                    </td>
                    <td className="px-3 py-2 text-foreground-muted">
                      10.11 16:42
                    </td>
                  </tr>
                  <tr className="border-t border-[#222425]">
                    <td className="px-3 py-2 text-[#9ce3ba]">predict</td>
                    <td className="px-3 py-2">готово</td>
                    <td className="px-3 py-2 text-foreground-muted">
                      Fjord-Field-2026
                    </td>
                    <td className="px-3 py-2 text-foreground-muted">
                      09.11 21:08
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

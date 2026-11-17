import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PIPELINE_STATUSES,
  TRAIN_PIPELINE_STEP_IDS,
  wizardPlanBlocksHpsearch,
} from "./trainPipeline";
import { TRAIN_PIPELINE_STEPS } from "../pipeline/steps";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");
const repo = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(uiSrc, rel), "utf8");
}

describe("T-7 training pipeline gate · / m07", () => {
  it("1. Eight orcAI steps in original order; hpsearch optional", () => {
    expect([...TRAIN_PIPELINE_STEP_IDS]).toEqual([
      "create-spectrograms",
      "create-label-arrays",
      "create-snippet-table",
      "create-tvt-snippet-tables",
      "create-tvt-data",
      "hpsearch",
      "train",
      "test",
    ]);
    expect(TRAIN_PIPELINE_STEPS.map((s) => s.id)).toEqual([...TRAIN_PIPELINE_STEP_IDS]);
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    expect(page).toContain("TRAIN_PIPELINE_STEP_IDS");
    expect(page).toContain("pipeline.optional");
    expect(page).toContain("wizardPlanBlocksHpsearch");
    expect(page).toContain("hpsearchOutsidePlan");
    // QA-M5: no blind 12s drop of optimistic plan while board fetch fails.
    expect(page).not.toContain("12_000");
    // QA-M6: wait for board before mounting TrainWizard.
    expect(page).toContain("board === null");
    expect(page).toContain("common.loading");
    expect(page).not.toContain("PIPELINE_STEPS.map");
    expect(wizardPlanBlocksHpsearch(null)).toBe(false);
    expect(
      wizardPlanBlocksHpsearch({
        plan_id: "p1",
        queued: 1,
        running: 0,
        job_id: "j1",
        includes_hpsearch: false,
      }),
    ).toBe(true);
    expect(
      wizardPlanBlocksHpsearch({
        plan_id: "p1",
        queued: 1,
        running: 0,
        job_id: "j1",
        includes_hpsearch: true,
      }),
    ).toBe(false);
    const ru = JSON.parse(read("../public/locales/ru/ru.json"));
    const en = JSON.parse(read("../public/locales/en/en.json"));
    expect(ru.pipeline.hpsearchOutsidePlan).toBeTruthy();
    expect(en.pipeline.hpsearchOutsidePlanHint).toBeTruthy();
  });

  it("2. FR-7.2 disk statuses + queued for job queue; blocked always has a reason key", () => {
    expect(PIPELINE_STATUSES).toEqual([
      "idle",
      "queued",
      "running",
      "done",
      "stale",
      "blocked",
      "error",
    ]);
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    const boardUi = read("lib/pipelineBoardUi.tsx");
    expect(boardUi).toContain("pipeline.status.");
    expect(boardUi).toContain("pipeline.reason.");
    expect(boardUi).toContain("job-status-pill");
    expect(page).toContain("PipelineStatusPill");
    expect(page).toContain('step.status === "blocked"');
    expect(page).toContain('step.status === "queued"');
    expect(boardUi).toContain("step.reason");
    expect(page).toContain('step.run_block === "upstream_failed"');
    const ru = read("../public/locales/ru/ru.json");
    expect(ru).toContain('"done": "Готово"');
    expect(ru).toContain('"idle": "Не выполнено"');
    expect(ru).toContain('"queued": "В очереди"');
    expect(ru).toContain('"stale": "Устарело"');
    expect(ru).toContain('"blocked": "Нет данных"');
    expect(ru).toContain("нужен обученный чекпоинт");
    expect(ru).toContain("сначала исправьте ошибку на предыдущем шаге");
    expect(ru).toContain("изменились параметры спектрограммы");
    expect(ru).toContain("изменились параметры сниппетов");
    const py = [
      readFileSync(
        join(repo, "apps/sidecar/src/orcai_desktop_sidecar/train_pipeline.py"),
        "utf8",
      ),
      readFileSync(
        join(repo, "apps/sidecar/src/orcai_desktop_sidecar/pipeline_constants.py"),
        "utf8",
      ),
      readFileSync(
        join(
          repo,
          "apps/sidecar/src/orcai_desktop_sidecar/pipeline_step_status.py",
        ),
        "utf8",
      ),
    ].join("\n");
    expect(py).toContain('STATUS_QUEUED = "queued"');
    expect(py).toContain('if job_status == "pending"');
  });

  it("3. Board reads GET /v1/projects/{id}/pipeline and polls disk state", () => {
    const page = [
      read("pages/PipelinePage.tsx"),
      read("hooks/usePipelineBoard.ts"),
      read("hooks/usePipelineBoardActions.ts"),
      read("hooks/usePipelineBoardPoll.ts"),
      read("lib/pollIntervals.ts"),
    ].join("\n");
    expect(page).toContain("fetchProjectPipeline");
    expect(page).toContain("POLL_IDLE_MS");
    expect(page).toContain("POLL_BUSY_MS");
    expect(page).toContain("visibilitychange");
    const api = [
      read("api/projects/index.ts"),
      read("api/projects/pipeline.ts"),
    ].join("\n");
    expect(api).toContain("/v1/projects/${id}/pipeline");
    const sidecar = [
      readFileSync(
        join(repo, "apps/sidecar/src/orcai_desktop_sidecar/routes/projects.py"),
        "utf8",
      ),
      readFileSync(
        join(
          repo,
          "apps/sidecar/src/orcai_desktop_sidecar/routes/project_routes_train.py",
        ),
        "utf8",
      ),
    ].join("\n");
    expect(sidecar).toContain('/v1/projects/{project_id}/pipeline');
    const py = [
      readFileSync(
        join(repo, "apps/sidecar/src/orcai_desktop_sidecar/train_pipeline.py"),
        "utf8",
      ),
      readFileSync(
        join(repo, "apps/sidecar/src/orcai_desktop_sidecar/pipeline_constants.py"),
        "utf8",
      ),
    ].join("\n");
    expect(py).toContain("def inspect_pipeline");
    expect(py).toContain("STATUS_DONE");
    expect(py).not.toContain("localStorage");
  });

  it("4. Readiness includes snippets vs n_batch × batch_size and key params", () => {
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    const boardUi = read("lib/pipelineBoardUi.tsx");
    expect(page).toContain("pipeline.ready.snippets");
    expect(boardUi).toContain("runtime-row-lamp");
    expect(boardUi).toContain("runtime-row-lamp-jewel");
    expect(page).toContain("n_batch");
    expect(page).toContain("settings-path-btn");
    expect(page).toContain("pipeline.editParams");
    expect(page).toContain("PipelineParamsModal");
    expect(page).not.toContain('state: { tab: "parameters" }');
    const ru = read("../public/locales/ru/ru.json");
    expect(ru).toContain('"editParamsTitle": "Параметры проекта"');
    expect(page).toContain("pipeline.wizard");
    expect(page).toContain("jobs-toolbar-filters");
    expect(page).toContain("refreshBoard");
    expect(page).toContain("pipeline.refreshed");
    expect(page).toContain("pp-refresh-wrap");
    expect(page).toContain("pp-split-rule");
    expect(page).toContain("pp-left-united");
    expect(page).toContain("pipeline.ready.accelMetal");
    expect(page).toContain('topic="train.pipeline"');
    expect(page).toContain("PageHelpButton");
  });

  it("5. ГОТОВО is done (Open), not the Run affordance", () => {
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    expect(page).toContain('step.status === "done"');
    expect(page).toContain("pipeline.open");
    expect(page).toContain("pipeline.more");
    expect(page).toContain("pipeline.rerun");
    const runBlock = page.slice(page.indexOf('step.status === "done"'));
    expect(runBlock).toContain("pipeline.open");
  });

  it("6. Layout uses studio flex/grid, not vh; joinFsPath stays ", () => {
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    expect(page).toContain("joinFsPath");
    expect(page).not.toMatch(/\+ ["']\/["']/);
    expect(page).not.toMatch(/\d+vh/);
    const css = read("styles/pipeline-studio.css");
    expect(css).not.toMatch(/height:\s*\d+vh/);
    expect(css).toContain("flex: 1 1 auto");
    expect(css).toContain(".pp-split-rule");
    expect(css).toContain(".pp-col-side");
    expect(page).toContain("pp-col-side");
    expect(page).toContain("pp-col-board");
    expect(page).not.toMatch(/className="pp-col[\s"]/);
    expect(css).toContain(".pp-col-board");
    expect(css).toContain("--m16-chrome-border: var(--border)");
    /* Shared scroll host (params pattern) — last pipeline steps stay reachable with dock open. */
    const bodyBlock = css.match(/\.pp-body \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(bodyBlock).toMatch(/overflow-y:\s*auto/);
    expect(bodyBlock).toContain("minmax(min-content, 100%)");
    expect(bodyBlock).toContain("scrollbar-gutter: stable");
    const toolbarBlock = css.match(/\.pp-toolbar \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(toolbarBlock).toContain("padding: 0 var(--m16-pad-main, 10px)");
    expect(toolbarBlock).toContain("overflow: hidden");
    expect(toolbarBlock).toContain("scrollbar-gutter: stable");
    expect(css).not.toContain("--pp-board-scrollbar");
    expect(css).toMatch(/\.pp-step \{[\s\S]*flex:\s*1 0 0/);
    expect(css).toContain(".pp-step-cmd-row");
    expect(css).toMatch(/\.pp-steps \{[\s\S]*overflow:\s*visible/);
    const stepBlock = css.match(/^\s*\.pp-step \{[^}]+\}\s*$/m)?.[0] ?? "";
    expect(stepBlock).toContain("background: var(--st-card)");
    expect(stepBlock).toMatch(/border:\s*1px solid var\(--st-card-rim\)/);
    expect(css).toMatch(
      /\.app-viewport--pipeline-studio \.pp-col-board \{[\s\S]*background: transparent/,
    );
    expect(css).toMatch(
      /\.app-viewport--pipeline-studio \.pp-col-side \{[\s\S]*border: 1px solid #2a2c2f/,
    );
    expect(css).toMatch(
      /\.pp-work-panel\.studio-panel \{[\s\S]*border: 1px solid var\(--m16-chrome-border/,
    );
    expect(css).not.toMatch(/(^|\n)\s*\.pp-btn\s*\{/);
    expect(css).toContain(".app-viewport--pipeline-studio .pp-step-actions .pp-btn");
    const shell = read("layout/AppShell.tsx");
    expect(shell).toContain("app-viewport--pipeline-studio");
    expect(shell).toContain("PipelineSnippetsShortageBanner");
  });

  it("shell banner explains snippets shortfall + Desktop n_batch clamp", () => {
    const banner = read("components/PipelineSnippetsShortageBanner.tsx");
    expect(banner).toContain("snippetsShortageHeaderTip");
    expect(banner).toContain("subscribeSnippetsReadiness");
    expect(banner).toContain("dataHealthBannerEnabled");
    expect(banner).toContain("setHeaderTip");
    expect(banner).toContain('"snippets"');
    expect(banner).toContain("shortage.split");
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    expect(page).toContain("publishSnippetsReadiness");
    expect(page).toContain("PROJECT_PARAMETERS_SAVED_EVENT");
    const api = [
      read("api/projects/index.ts"),
      read("api/projects/pipeline.ts"),
      read("api/projects/studio.ts"),
    ].join("\n");
    expect(api).toContain('cache: "no-store"');
    expect(api).toContain("notifyProjectParametersSaved");
    const health = read("components/ProjectDataHealthBanner.tsx");
    expect(health).toContain("setHeaderTip");
    const restart = read("components/RuntimeRestartBanner.tsx");
    expect(restart).toContain("shrink-0");
    const ru = read("../public/locales/ru/ru.json");
    expect(ru).toContain("snippetsShortageTitle");
    expect(ru).toContain("snippetsShortageHeaderTip");
    expect(ru).toContain("n_batch_*");
    expect(ru).toContain("larger than available snippets");
    expect(ru).toContain("snippetsShortageDesktopClamp");
    expect(ru).toContain("n_batch × batch_size");
    const css = read("styles/pipeline-studio.css");
    expect(css).toMatch(/\.pp-plan-banner \{[\s\S]*flex:\s*0\s+0\s+auto/);
  });

  it("export of the parameter file announces the saved path in the header", () => {
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts"), read("hooks/usePipelineBoardPoll.ts"), read("components/pipeline/PipelineReadiness.tsx"), read("components/pipeline/PipelineBoardSteps.tsx")].join("\n");
    expect(page).toContain("useSaveNotice");
    expect(page).toContain(
      'notifySaved(t("projects.studio.params.exported", { path: target }))',
    );
    const exportFn = page.match(/const exportParams = async \(\) => \{[\s\S]*?\n  \};/)?.[0];
    expect(exportFn).toBeTruthy();
    const savedAt = exportFn!.indexOf("notifySaved");
    const catchAt = exportFn!.indexOf("} catch");
    expect(savedAt).toBeGreaterThan(0);
    expect(catchAt).toBeGreaterThan(savedAt);
  });
});

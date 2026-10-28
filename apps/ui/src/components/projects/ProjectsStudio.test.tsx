import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import type {
  ProjectAnnotations,
  ProjectRecord,
  ProjectRecordingTable,
  ProjectSummary,
  ProjectTableRow,
} from "../../api/projects";
import { renderWithProviders } from "../../test/render";
import { ProjectAnnotationsTab } from "./ProjectAnnotationsTab";
import { ProjectCreateWizard } from "./ProjectCreateWizard";
import { ProjectHeaderCard } from "./ProjectHeaderCard";
import { ProjectReadinessPanel } from "./ProjectReadinessPanel";
import { ProjectRecordingsTab } from "./ProjectRecordingsTab";
import { ProjectsActionsBar } from "./ProjectsActionsBar";
import { ProjectTabs } from "./ProjectTabs";

const summary = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  project_id: "p1",
  display_name: "Isafjordur-2026",
  project_kind: "recognition",
  focus: "full",
  metrics: {
    recordings: 12,
    annotations: 9,
    predicted: 7,
    trained_models: 1,
    recordings_total: 12,
    annotations_total: 12,
  },
  primary_model_name: "orcai-isl-v1",
  recording_table: { path: "/p/recording_table.csv", sync_status: "current" },
  readiness: {
    recordings: "ready",
    annotations: "ready",
    predict: "ready",
    datasets: "ready",
    model: "ready",
  },
  readiness_lines: {
    recordings: { state: "ready", wav_count: 12, table_rows: 12 },
    annotations: { state: "ready", annotated: 9, total: 12 },
    predict: { state: "ready", predicted: 7, total: 12 },
    datasets: { state: "ready", file_count: 3, has_tvt_dir: true },
    model: { state: "ready", checkpoint_count: 1, model_name: "orcai-isl-v1" },
  },
  next_actions: ["predict", "train", "filter"],
  ...over,
});

const row = (over: Partial<ProjectTableRow> = {}): ProjectTableRow => ({
  recording: "01.wav",
  in_table: true,
  cells: { recording: "01.wav", channel: "1" },
  wav_path: "/p/recordings/01.wav",
  wav_exists: true,
  size_bytes: 1024,
  duration_sec: 60,
  sample_rate_hz: 48_000,
  channels: 2,
  resample_to_hz: null,
  annotation_path: null,
  annotation_exists: false,
  predict_status: "none",
  predicted_path: null,
  channel: 1,
  duplicate: false,
  ...over,
});

const table = (rows: ProjectTableRow[], over: Partial<ProjectRecordingTable> = {}): ProjectRecordingTable => ({
  project_id: "p1",
  table_path: "/p/recording_table.csv",
  table_exists: true,
  updated_at: 1_757_000_000,
  columns: ["recording", "channel", "HERDING"],
  standard_columns: ["recording", "channel"],
  class_columns: ["HERDING"],
  calls: ["HERDING"],
  target_sampling_rate_hz: 48_000,
  default_channel: 1,
  row_count: rows.length,
  rows,
  ...over,
});

const recordingsProps = {
  loading: false,
  mode: "full" as const,
  selected: new Set<string>(),
  busy: false,
  canModify: true,
  engineReady: true,
  showAllColumns: false,
  autoSyncCsv: true,
  tableNeedsRefresh: false,
  onToggleColumns: vi.fn(),
  onToggleAutoSyncCsv: vi.fn(),
  onToggleRow: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  onRefreshTable: vi.fn(),
  onAddWav: vi.fn(),
  onImportWavPaths: vi.fn(),
  onDeleteSelected: vi.fn(),
  onChannelChange: vi.fn(),
};

describe("ProjectCreateWizard · m32", () => {
  it("renders three focus cards as radios and disables Next until name + dir", () => {
    const onFocus = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectCreateWizard
        focus="recognition"
        displayName=""
        parentDir=""
        phase="form"
        busy={false}
        sidecarOnline
        error={null}
        onFocus={onFocus}
        onDisplayName={vi.fn()}
        onPickParent={vi.fn()}
        onCancel={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios.length).toBe(3);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll(".ps-focus-card.is-selected").length).toBe(1);
    // CLI hint per focus card (soft focus, not a lock)
    const cmds = Array.from(container.querySelectorAll(".ps-focus-card-cmd")).map(
      (el) => el.textContent ?? "",
    );
    expect(cmds.length).toBe(3);
    expect(cmds[0]).toMatch(/predict/);
    expect(cmds[1]).toMatch(/train/);
    expect(cmds[2]).toMatch(/predict.*train/);

    act(() => radios[2].click());
    expect(onFocus).toHaveBeenCalledWith("full");

    const next = container.querySelector<HTMLButtonElement>(".ps-btn-primary");
    expect(next?.disabled).toBe(true);
    unmount();
  });

  it("enables Next with name + dir and shows slug preview; init phase hides Next", () => {
    const onNext = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectCreateWizard
        focus="full"
        displayName="Fjord Field 2026"
        parentDir="/Users/me/orcai"
        phase="form"
        busy={false}
        sidecarOnline
        error={null}
        onFocus={vi.fn()}
        onDisplayName={vi.fn()}
        onPickParent={vi.fn()}
        onCancel={vi.fn()}
        onNext={onNext}
      />,
    );
    const dir = container.querySelector<HTMLInputElement>(".ps-input.is-mono");
    expect(dir?.value).toMatch(/\/Users\/me\/orcai\/fjord[-_]field[-_]2026/i);
    const next = container.querySelector<HTMLButtonElement>(".ps-btn-primary");
    expect(next?.disabled).toBe(false);
    act(() => next!.click());
    expect(onNext).toHaveBeenCalledTimes(1);
    unmount();

    const r2 = renderWithProviders(
      <ProjectCreateWizard
        focus="full"
        displayName="X"
        parentDir="/p"
        phase="init"
        busy
        sidecarOnline
        error={null}
        onFocus={vi.fn()}
        onDisplayName={vi.fn()}
        onPickParent={vi.fn()}
        onCancel={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(r2.container.querySelector(".ps-btn-primary")).toBeNull();
    expect(r2.container.querySelector('[role="status"]')).toBeTruthy();
    expect(r2.container.querySelectorAll('[role="radio"]').length).toBe(0);
    r2.unmount();
  });
});

describe("ProjectRecordingsTab · m33 / m34", () => {
  it("m33 empty state: title, steps, drop hint, WAV icon and add WAV action", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectRecordingsTab {...recordingsProps} table={table([])} mode="empty" />,
    );
    expect(container.querySelector(".ps-empty")).toBeTruthy();
    expect(container.querySelector(".ps-empty-title")).toBeTruthy();
    expect(container.querySelector(".ps-empty-drop-hint")).toBeTruthy();
    expect(container.querySelector(".ps-empty-icon")).toBeTruthy();
    expect(container.querySelector(".ps-empty-icon")?.textContent).toMatch(/WAV/);
    expect(container.querySelectorAll(".ps-empty-actions .ps-btn").length).toBe(1);
    expect(container.querySelector(".ps-table")).toBeNull();
    unmount();
  });

  it("renders CSV rows with computed columns, editable channel and 96k resample mark", () => {
    const onChannelChange = vi.fn();
    const rows = [
      row(),
      row({
        recording: "02.wav",
        sample_rate_hz: 96_000,
        resample_to_hz: 48_000,
        annotation_exists: true,
        annotation_path: "/p/a/02.txt",
        predict_status: "done",
        channel: 2,
      }),
      row({ recording: "03.wav", in_table: false, wav_exists: false }),
    ];
    const { container, unmount } = renderWithProviders(
      <ProjectRecordingsTab
        {...recordingsProps}
        table={table(rows)}
        onChannelChange={onChannelChange}
        selected={new Set(["01.wav"])}
      />,
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(3);
    expect(container.querySelectorAll("tbody tr.is-selected").length).toBe(1);
    // 96 kHz → 48 kHz mark
    expect(container.textContent).toMatch(/96/);
    expect(container.querySelectorAll(".ps-tag.is-warn").length).toBeGreaterThanOrEqual(2); // resample + not in table
    expect(container.querySelectorAll(".ps-tag.is-err").length).toBe(1); // wav missing
    expect(container.querySelector(".ps-hint-bar.is-warn")).toBeTruthy(); // table stale
    expect(container.querySelector(".ps-pill.is-done")).toBeTruthy();

    const channelInputs = container.querySelectorAll<HTMLInputElement>(".ps-channel-input");
    expect(channelInputs.length).toBe(3);
    expect(channelInputs[1].value).toBe("2");
    expect(channelInputs[2].disabled).toBe(true); // not in table → cannot edit

    // Channel is editable inline and bounded by the file's channel count.
    expect(channelInputs[0].getAttribute("min")).toBe("1");
    expect(channelInputs[0].getAttribute("max")).toBe("2");
    expect(channelInputs[0].disabled).toBe(false);

    // footer: updated + rows + base channel (filename only when missing, in header metrics)
    expect(container.querySelector(".ps-footer")?.textContent).toMatch(/3 rows|default channel/i);
    // Predict CTA lives on the page tab strip, not inside the recordings table.
    expect(container.querySelector(".ps-btn-primary")).toBeNull();
    unmount();
  });

  it("shows auto-sync checkbox and disables refresh when auto-sync is on", () => {
    const onToggleAutoSyncCsv = vi.fn();
    const onRefreshTable = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectRecordingsTab
        {...recordingsProps}
        table={table([row({ in_table: false })])}
        autoSyncCsv={false}
        tableNeedsRefresh
        onToggleAutoSyncCsv={onToggleAutoSyncCsv}
        onRefreshTable={onRefreshTable}
      />,
    );
    expect(container.textContent).toMatch(
      /Обновлять столбцы CSV автоматически|Update CSV columns automatically/,
    );
    const checks = container.querySelectorAll<HTMLInputElement>(".ps-toolbar-check input");
    expect(checks.length).toBeGreaterThanOrEqual(2);
    act(() => {
      checks[1].click();
    });
    expect(onToggleAutoSyncCsv).toHaveBeenCalled();

    const manual = renderWithProviders(
      <ProjectRecordingsTab
        {...recordingsProps}
        table={table([row()])}
        autoSyncCsv={false}
        tableNeedsRefresh
        onRefreshTable={onRefreshTable}
      />,
    );
    const refreshManual = Array.from(
      manual.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => /Обновить таблицу|Refresh table/i.test(b.textContent ?? ""));
    expect(refreshManual?.disabled).toBe(false);
    expect(refreshManual?.classList.contains("ps-btn-attention")).toBe(true);
    manual.unmount();

    const auto = renderWithProviders(
      <ProjectRecordingsTab
        {...recordingsProps}
        table={table([row()])}
        autoSyncCsv
        tableNeedsRefresh
        onRefreshTable={onRefreshTable}
      />,
    );
    const refreshAuto = Array.from(
      auto.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => /Обновить таблицу|Refresh table/i.test(b.textContent ?? ""));
    expect(refreshAuto?.disabled).toBe(true);
    expect(refreshAuto?.classList.contains("ps-btn-attention")).toBe(false);
    auto.unmount();
    unmount();
  });

  it("m35 lab/field recordings share table chrome (no mode-specific hint bars)", () => {
    // Recordings tab dropped data-hint="field"|"predict-seed"; lab vs field no longer
    // forks hint chrome here (soft focus lives elsewhere). Both modes show the table toolbar.
    const rows = [row()];
    const lab = renderWithProviders(
      <ProjectRecordingsTab {...recordingsProps} table={table(rows)} mode="lab" />,
    );
    expect(lab.container.querySelector('[data-hint="field"]')).toBeNull();
    expect(lab.container.querySelector('[data-hint="predict-seed"]')).toBeNull();
    expect(lab.container.querySelector(".ps-toolbar")).toBeTruthy();
    lab.unmount();

    const field = renderWithProviders(
      <ProjectRecordingsTab {...recordingsProps} table={table(rows)} mode="field" />,
    );
    expect(field.container.querySelector('[data-hint="field"]')).toBeNull();
    expect(field.container.querySelector('[data-hint="predict-seed"]')).toBeNull();
    expect(field.container.querySelector(".ps-toolbar")).toBeTruthy();
    field.unmount();
  });
});

describe("ProjectReadinessPanel · m36", () => {
  it("renders five lamp cards; ready → is-ready, attention → is-attention", () => {
    const s = summary({
      readiness: {
        recordings: "ready",
        annotations: "needed",
        predict: "needed",
        datasets: "empty",
        model: "ready",
      },
      readiness_lines: {
        ...summary().readiness_lines,
        annotations: { state: "needed", annotated: 3, total: 12 },
        predict: { state: "needed", predicted: 0, total: 12 },
        datasets: { state: "empty", file_count: 0, has_tvt_dir: false },
      },
    });
    const { container, unmount } = renderWithProviders(
      <ProjectReadinessPanel
        summary={s}
        focus="full"
        loading={false}
        online
        showNextSteps={false}
        onToggleNextSteps={vi.fn()}
        onNextStep={vi.fn()}
      />,
    );
    const cards = container.querySelectorAll(".ps-readiness-card");
    expect(cards.length).toBe(5);
    expect(container.querySelectorAll(".ps-readiness-card.is-ready").length).toBe(2);
    expect(container.querySelectorAll(".ps-readiness-card.is-attention").length).toBe(1);
    expect(container.querySelectorAll(".ps-lamp").length).toBe(5);
    unmount();
  });

  it("next steps toggle lists actions with CLI commands; full cycle line when all ready", () => {
    const onNextStep = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectReadinessPanel
        summary={summary()}
        focus="full"
        loading={false}
        online
        showNextSteps
        onToggleNextSteps={vi.fn()}
        onNextStep={onNextStep}
      />,
    );
    const steps = container.querySelectorAll<HTMLButtonElement>(".ps-next-step");
    expect(steps.length).toBeGreaterThan(0);
    const cmds = Array.from(container.querySelectorAll(".ps-next-step-cmd")).map(
      (el) => el.textContent ?? "",
    );
    expect(cmds.join(" ")).toMatch(/predict/);
    expect(cmds.join(" ")).toMatch(/train/);
    expect(cmds.join(" ")).toMatch(/filter-predictions/);
    expect(container.querySelector(".ps-full-cycle")).toBeTruthy();
    expect(container.querySelector(".ps-next-step.is-guided")).toBeTruthy();
    act(() => steps[0].click());
    expect(onNextStep).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("offline → hint instead of cards", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectReadinessPanel
        summary={null}
        focus="full"
        loading={false}
        online={false}
        showNextSteps={false}
        onToggleNextSteps={vi.fn()}
        onNextStep={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".ps-readiness-card").length).toBe(0);
    expect(container.textContent?.length).toBeGreaterThan(0);
    unmount();
  });

  it("field focus dims annotations/datasets/model; not-required copy", () => {
    const s = summary({
      readiness: {
        recordings: "ready",
        annotations: "empty",
        predict: "needed",
        datasets: "empty",
        model: "empty",
      },
      readiness_lines: {
        ...summary().readiness_lines,
        annotations: { state: "empty", annotated: 0, total: 12 },
        predict: { state: "needed", predicted: 0, total: 12 },
        datasets: { state: "empty", file_count: 0, has_tvt_dir: false },
        model: { state: "empty", checkpoint_count: 0, model_name: null },
      },
    });
    const { container, unmount } = renderWithProviders(
      <ProjectReadinessPanel
        summary={s}
        focus="recognition"
        loading={false}
        online
        showNextSteps={false}
        onToggleNextSteps={vi.fn()}
        onNextStep={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".ps-readiness-card.is-inactive").length).toBe(3);
    expect(container.querySelectorAll(".ps-readiness-card.is-ready").length).toBe(1);
    expect(container.textContent).toMatch(/не требуется|not required/i);
    expect(container.textContent).not.toMatch(/нет аннотаций|no annotations/i);
    unmount();
  });

  it("lab focus dims only predict with not-required copy", () => {
    const s = summary({
      readiness: {
        recordings: "ready",
        annotations: "ready",
        predict: "empty",
        datasets: "needed",
        model: "empty",
      },
    });
    const { container, unmount } = renderWithProviders(
      <ProjectReadinessPanel
        summary={s}
        focus="training"
        loading={false}
        online
        showNextSteps={false}
        onToggleNextSteps={vi.fn()}
        onNextStep={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".ps-readiness-card.is-inactive").length).toBe(1);
    expect(container.textContent).toMatch(/не требуется|not required/i);
    unmount();
  });
});

describe("ProjectTabs · m02", () => {
  it("four tabs with counts, active tab marked", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectTabs
        active="recordings"
        counts={{ recordings: 12, annotations: 9, artifacts: 3, parameters: null }}
        onChange={onChange}
      />,
    );
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs.length).toBe(4);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].classList.contains("predict-tab")).toBe(true);
    expect(container.querySelector(".predict-tabs-m03")).toBeTruthy();
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("9");
    act(() => tabs[3].click());
    expect(onChange).toHaveBeenCalledWith("parameters");
    expect(container.querySelectorAll('button:not([role="tab"])').length).toBe(0);
    unmount();
  });

  it("field focus shows only recordings and parameters", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectTabs
        active="recordings"
        tabs={["recordings", "parameters"]}
        counts={{ recordings: 4, parameters: null }}
        onChange={vi.fn()}
      />,
    );
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(container.textContent).not.toMatch(/аннотац|annotat/i);
    expect(container.textContent).not.toMatch(/артефакт|artifact/i);
    unmount();
  });
});

const projectRecord = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: "p1",
  path: "/tmp/Isafjordur-2026",
  display_name: "Isafjordur-2026",
  description: "",
  orcai_name: "Isafjordur-2026",
  project_kind: "recognition",
  focus: "full",
  focus_source: "stored",
  created_at: 1,
  updated_at: 1,
  recording_table_path: "/tmp/Isafjordur-2026/recording_table.csv",
  recordings_dir: "/tmp/Isafjordur-2026/recordings",
  wav_count: 12,
  initialized: true,
  ...over,
});

describe("ProjectHeaderCard · m02 metrics / focus", () => {
  const headerProps = {
    table: table([row()]),
    isActive: true,
    busy: false,
    engineReady: true,
    onChangeFocus: vi.fn(),
    onDelete: vi.fn(),
    onInit: vi.fn(),
  };

  it("hides annotations metric when focus is recognition", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectHeaderCard
        {...headerProps}
        project={projectRecord({ focus: "recognition" })}
        summary={summary({ focus: "recognition" })}
        focus="recognition"
      />,
    );
    expect(container.querySelector(".ps-header-name")?.textContent).toBe("Isafjordur-2026");
    expect(container.textContent).toMatch(/Записи|Recordings/);
    expect(container.textContent).toMatch(/Классы|Classes/);
    expect(container.textContent).not.toMatch(/Аннотации|Annotations/);
    unmount();
  });

  it("shows annotations metric for full and training focus", () => {
    for (const focus of ["full", "training"] as const) {
      const { container, unmount } = renderWithProviders(
        <ProjectHeaderCard
          {...headerProps}
          project={projectRecord({ focus })}
          summary={summary({ focus })}
          focus={focus}
        />,
      );
      expect(container.textContent).toMatch(/Аннотации|Annotations/);
      unmount();
    }
  });

  it("focus radios call onChangeFocus and disable while busy", () => {
    const onChangeFocus = vi.fn();
    const idle = renderWithProviders(
      <ProjectHeaderCard
        {...headerProps}
        project={projectRecord()}
        summary={summary()}
        focus="full"
        onChangeFocus={onChangeFocus}
      />,
    );
    const radios = idle.container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios.length).toBe(3);
    const training = Array.from(radios).find((r) =>
      /Обучение|Model training/i.test(r.textContent ?? ""),
    );
    expect(training).toBeTruthy();
    act(() => training!.click());
    expect(onChangeFocus).toHaveBeenCalledWith("training");
    idle.unmount();

    const busy = renderWithProviders(
      <ProjectHeaderCard
        {...headerProps}
        project={projectRecord()}
        summary={summary()}
        focus="full"
        busy
        onChangeFocus={onChangeFocus}
      />,
    );
    expect(
      Array.from(busy.container.querySelectorAll<HTMLButtonElement>('[role="radio"]')).every(
        (r) => r.disabled,
      ),
    ).toBe(true);
    busy.unmount();
  });
});

describe("ProjectAnnotationsTab · empty m23", () => {
  const emptyAnnotations = (): ProjectAnnotations => ({
    project_id: "p1",
    classes: [],
    classes_source: "parameters",
    has_mask_columns: false,
    rows: [],
    unlisted_labels: [],
    annotated_count: 0,
    total_count: 0,
    unpaired: [],
    annotations_dir: "/p/annotations",
  });

  it("empty state shows TXT icon and add action", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectAnnotationsTab
        data={emptyAnnotations()}
        loading={false}
        mode="full"
        busy={false}
        canModify
        onAddAnnotations={vi.fn()}
        onImportPaths={vi.fn()}
        onDeleteAnnotations={vi.fn()}
        onOpenAnnotationsFolder={vi.fn()}
      />,
    );
    expect(container.querySelector(".ps-empty")).toBeTruthy();
    expect(container.querySelector(".ps-empty-icon")?.textContent).toMatch(/TXT/);
    expect(container.querySelectorAll(".ps-empty-actions .ps-btn").length).toBe(1);
    unmount();
  });
});

describe("ProjectsActionsBar · busy gating", () => {
  it("create, open folder, and list are disabled while busy", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectsActionsBar
        hasProject
        busy
        onCreate={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenProjectList={vi.fn()}
      />,
    );
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const create = buttons.find((b) => /Создать|Create/i.test(b.textContent ?? ""));
    const openFolder = buttons.find((b) =>
      /Открыть папку проекта|Open project folder/i.test(b.textContent ?? ""),
    );
    const list = buttons.find((b) => /Список|Project list/i.test(b.textContent ?? ""));
    expect(create?.disabled).toBe(true);
    expect(list?.disabled).toBe(true);
    expect(openFolder?.disabled).toBe(true);
    unmount();
  });
});

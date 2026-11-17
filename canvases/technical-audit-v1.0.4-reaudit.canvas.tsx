import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";
import { useMemo, useState } from "react";

type Severity = "High" | "Medium" | "Low";
type Category =
  | "Architecture"
  | "Memory / Perf"
  | "Errors / Stability"
  | "GUI / UX";

type Finding = {
  id: string;
  severity: Severity;
  category: Category;
  file: string;
  lines: string;
  title: string;
  evidence: string;
  status: "open" | "closed";
};

/** Re-audit fix pass · 2026-11-13 · all findings closed. */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "High",
    category: "Architecture",
    file: "useProjectsPageModel + dialogs/lifecycle/nav",
    lines: "composer ~402",
    title: "Projects god-hook — закрыто",
    evidence: "useProjectDialogs / StudioUiState / StudioLifecycle / NavActions; return keys same.",
    status: "closed",
  },
  {
    id: "ARCH-02",
    severity: "High",
    category: "Architecture",
    file: "usePredictBatchRun + types/csv/overwrite/fileLoop",
    lines: "hook ~318",
    title: "Batch Options bag — закрыто",
    evidence: "Types + predictBatchCsv/Overwrite/FileLoop; signature unchanged.",
    status: "closed",
  },
  {
    id: "ARCH-03",
    severity: "High",
    category: "Architecture",
    file: "sidecar public helpers + _ aliases",
    lines: "cross-module",
    title: "Private _foo cross-imports — закрыто",
    evidence:
      "JOBS_LOCK/REGISTRY, resolve_hps_parameter_path, collect_csv_batch_files, trim_section_cache, AUDIO_CACHE_DIR; _ aliases kept.",
    status: "closed",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "PipelinePage + Readiness/BoardSteps",
    lines: "page ~321",
    title: "PipelinePage JSX — закрыто",
    evidence: "PipelineReadiness + PipelineBoardSteps extracted.",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "usePipelineBoard + poll/cache/actions",
    lines: "hook ~435",
    title: "Pipeline board god-hook — закрыто",
    evidence: "pipelineBoardCache + usePipelineBoardPoll + Actions; bag same.",
    status: "closed",
  },
  {
    id: "ARCH-06",
    severity: "Medium",
    category: "Architecture",
    file: "Filter/SegmentRail/TrainMonitor/Detections/Params/Viewer",
    lines: "shells ≤401",
    title: "Studio shells — закрыто",
    evidence:
      "Filter~280 · SegmentRail~347 · TrainMonitor~268 · Detections~248 · Params~401 · Viewer~12.",
    status: "closed",
  },
  {
    id: "ARCH-07",
    severity: "Medium",
    category: "Architecture",
    file: "lib/pollIntervals.ts",
    lines: "shared",
    title: "Poll constants — закрыто",
    evidence: "Centralized pipeline/monitor/health/homeWizard; BOOT_POLL_MS=750 kept.",
    status: "closed",
  },
  {
    id: "ARCH-08",
    severity: "Medium",
    category: "Architecture",
    file: "routes/*/schemas imports",
    lines: "explicit",
    title: "Star-import schemas — закрыто",
    evidence: "Explicit imports in projects/fs/jobs/runtime/models/media.",
    status: "closed",
  },
  {
    id: "ARCH-09",
    severity: "Medium",
    category: "Architecture",
    file: "SpectrogramViewer + useSpectrogramViewerModel",
    lines: "viewer 12",
    title: "Viewer orchestrator — закрыто",
    evidence: "Thin viewer → model hook + buildSpectrogramChromeProps bags.",
    status: "closed",
  },
  {
    id: "ARCH-10",
    severity: "Medium",
    category: "Architecture",
    file: "project_crud façade + read/ops/helpers",
    lines: "façade 41",
    title: "project_crud god — закрыто",
    evidence: "project_crud_helpers + project_crud_read + project_crud_ops; routes import façade.",
    status: "closed",
  },
  {
    id: "ARCH-11",
    severity: "Medium",
    category: "Architecture",
    file: "adapters/predict collect_csv_batch_files",
    lines: "public",
    title: "Predict cancel coupling — закрыто",
    evidence: "collect_csv_batch_files public; cancel_cleanup uses public name.",
    status: "closed",
  },
  {
    id: "ARCH-12",
    severity: "Low",
    category: "Architecture",
    file: "lib/timeouts.ts",
    lines: "shared",
    title: "Timeout duplicates — закрыто",
    evidence: "300_000 + 30min single source; re-exported from fetch/tile/wait/import.",
    status: "closed",
  },
  {
    id: "PERF-01",
    severity: "High",
    category: "Memory / Perf",
    file: "routes/media.py labels_preview",
    lines: "async+executor",
    title: "labels_preview off event loop — закрыто",
    evidence: "async + spec_executor for STFT/tf_bounds.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "High",
    category: "Memory / Perf",
    file: "results_summary + media route",
    lines: "async+caps",
    title: "results/summary — закрыто",
    evidence: "to_thread; soft file/row caps + truncated; KPIs aggregate.",
    status: "closed",
  },
  {
    id: "PERF-03",
    severity: "High",
    category: "Memory / Perf",
    file: "audio_playback|segment",
    lines: "executor",
    title: "audio encode — закрыто",
    evidence: "encode on spec_executor before FileResponse.",
    status: "closed",
  },
  {
    id: "PERF-04",
    severity: "High",
    category: "Memory / Perf",
    file: "spectrogram_histogram",
    lines: "executor",
    title: "histogram — закрыто",
    evidence: "spec_executor for power load.",
    status: "closed",
  },
  {
    id: "PERF-05",
    severity: "High",
    category: "Memory / Perf",
    file: "GET /v1/jobs + JobsListContext",
    lines: "to_thread; log:[]",
    title: "jobs list fat logs — закрыто",
    evidence: "include_log=False on list; UI merge keeps SSE tails; poll strip 200.",
    status: "closed",
  },
  {
    id: "PERF-06",
    severity: "Medium",
    category: "Memory / Perf",
    file: "models_list",
    lines: "to_thread",
    title: "models rglob — закрыто",
    evidence: "async list via to_thread.",
    status: "closed",
  },
  {
    id: "PERF-07",
    severity: "Medium",
    category: "Memory / Perf",
    file: "filter preview fs route",
    lines: "to_thread",
    title: "filter preview — закрыто",
    evidence: "pandas filter on to_thread.",
    status: "closed",
  },
  {
    id: "PERF-08",
    severity: "Medium",
    category: "Memory / Perf",
    file: "delete recordings",
    lines: "to_thread",
    title: "delete recordings — закрыто",
    evidence: "POST/DELETE via to_thread like siblings.",
    status: "closed",
  },
  {
    id: "PERF-09",
    severity: "Medium",
    category: "Memory / Perf",
    file: "ResultsPage snapshots",
    lines: "5k row cap",
    title: "Results LRU rows — закрыто",
    evidence: "slimResultsSnapshotForCache ≤5k rows; live summary full.",
    status: "closed",
  },
  {
    id: "PERF-10",
    severity: "Medium",
    category: "Memory / Perf",
    file: "JobsListContext + jobLogTail",
    lines: "strip 200",
    title: "Jobs poll RAM — закрыто",
    evidence: "stripJobLogForListPoll before merge; SSE tails preserved.",
    status: "closed",
  },
  {
    id: "PERF-11",
    severity: "Medium",
    category: "Memory / Perf",
    file: "spectrogram_cache.py",
    lines: "oversize skip",
    title: "RAM oversize matrix — закрыто",
    evidence: "nbytes > _RAM_MAX_BYTES → skip RAM keep; disk unchanged.",
    status: "closed",
  },
  {
    id: "PERF-12",
    severity: "Medium",
    category: "Memory / Perf",
    file: "spectrogramColormapLut + canvas",
    lines: "chunked",
    title: "Colormap main-thread hitch — закрыто",
    evidence: "grayToRgbaPixelsAsync + rAF chunks + AbortSignal.",
    status: "closed",
  },
  {
    id: "ERR-01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "LabDockPanes + batch row",
    lines: "format*",
    title: "Raw job.error display — закрыто",
    evidence: "formatUserFacingError* on Lab + finished.error queue line.",
    status: "closed",
  },
  {
    id: "ERR-02",
    severity: "Medium",
    category: "Errors / Stability",
    file: "api/jobs.ts",
    lines: "throwJobsHttpError",
    title: "HTTP Error body dump — закрыто",
    evidence: "status + truncated detail only.",
    status: "closed",
  },
  {
    id: "ERR-03",
    severity: "Medium",
    category: "Errors / Stability",
    file: "useSidecarHealthPolling + userFacingError",
    lines: "exit regex",
    title: "Home lastError raw exit — закрыто",
    evidence: "formatUserFacingErrorI18n; KNOWN_ERROR_KEYS matches exited (status).",
    status: "closed",
  },
  {
    id: "ERR-04",
    severity: "Medium",
    category: "Errors / Stability",
    file: "usePredictRecordingTable",
    lines: "format*",
    title: "Recording-table raw message — закрыто",
    evidence: "formatUserFacingErrorRequired.",
    status: "closed",
  },
  {
    id: "ERR-05",
    severity: "Medium",
    category: "Errors / Stability",
    file: "useProjectsPageModel init",
    lines: "format*",
    title: "Project init raw error — закрыто",
    evidence: "formatUserFacingErrorRequired on activeJob.error.",
    status: "closed",
  },
  {
    id: "ERR-06",
    severity: "Low",
    category: "Errors / Stability",
    file: "usePredictBatchRun",
    lines: "format*",
    title: "Batch finished.error — закрыто",
    evidence: "Formatted into queue failure line.",
    status: "closed",
  },
  {
    id: "ERR-07",
    severity: "Low",
    category: "Errors / Stability",
    file: "sidecar BLE001",
    lines: "accepted",
    title: "except Exception best-effort — ок",
    evidence: "No bare except:; logged; start_fn→FAILED. Accepted residual.",
    status: "closed",
  },
  {
    id: "UX-01",
    severity: "Medium",
    category: "GUI / UX",
    file: "JobsPage.tsx",
    lines: "busy latch",
    title: "Jobs actionBusy disable all — закрыто",
    evidence: "disabled={actionBusyId != null} on all row actions.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Medium",
    category: "GUI / UX",
    file: "PipelinePage.tsx",
    lines: "busy latch",
    title: "Pipeline busy disable all — закрыто",
    evidence: "Run/Cancel/Rerun/plan cancel when busyId != null.",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Medium",
    category: "GUI / UX",
    file: "LabDockPanes.tsx",
    lines: "format*",
    title: "Lab raw errors — закрыто",
    evidence: "job.error formatted for display.",
    status: "closed",
  },
  {
    id: "UX-04",
    severity: "Low",
    category: "GUI / UX",
    file: "PredictParamsRunStudio",
    lines: "batchCancelling",
    title: "Predict Cancel latch — закрыто",
    evidence: "Cancel disabled while batchCancelling.",
    status: "closed",
  },
  {
    id: "UX-05",
    severity: "Medium",
    category: "GUI / UX",
    file: "formatter gaps",
    lines: "closed via ERR*",
    title: "User-facing formatter gaps — закрыто",
    evidence: "Home/table/init/batch/Lab routed through format*.",
    status: "closed",
  },
  {
    id: "UX-06",
    severity: "Low",
    category: "GUI / UX",
    file: "inputs",
    lines: "ok",
    title: "Number inputs — ок",
    evidence: "Predict/filter guards already; HPS Number||fallback accepted.",
    status: "closed",
  },
  {
    id: "UX-07",
    severity: "Low",
    category: "GUI / UX",
    file: "layout scale",
    lines: "ok",
    title: "Layout scale — ок",
    evidence: "cqh heroes; vh modal caps; no change needed.",
    status: "closed",
  },
];

export default function TechnicalAuditReauditClosed() {
  const theme = useHostTheme();
  const [sev, setSev] = useState<"All" | Severity>("All");
  const [cat, setCat] = useState<"All" | Category>("All");
  const [openOnly, setOpenOnly] = useState(true);

  const openFindings = useMemo(
    () => FINDINGS.filter((f) => f.status === "open"),
    [],
  );

  const filtered = useMemo(() => {
    const base = openOnly ? openFindings : FINDINGS;
    return base.filter(
      (f) =>
        (sev === "All" || f.severity === sev) &&
        (cat === "All" || f.category === cat),
    );
  }, [sev, cat, openOnly, openFindings]);

  const counts = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0, Open: openFindings.length };
    for (const f of openFindings) c[f.severity] += 1;
    return c;
  }, [openFindings]);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1140 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · re-audit · закрыто</H1>
        <Text tone="secondary">
          Fix pass after re-audit · {new Date().toISOString().slice(0, 10)} ·
          Open = {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="danger" />
        <Stat value={String(counts.Medium)} label="Medium open" tone="warning" />
        <Stat value={String(counts.Low)} label="Low open" tone="info" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Все 38 пунктов re-audit закрыты или accepted. Sync media/jobs/models на
        to_thread/executor; Results/Jobs RAM caps; formatUserFacingError на
        Home/Lab/batch/table/init; Jobs/Pipeline busy latch; ARCH splits
        (Projects/Batch/Pipeline/Viewer/crud) + pollIntervals/timeouts +
        public sidecar helpers. tsc · gates · pytest зелёные.
      </Callout>

      <Card>
        <CardHeader trailing={<Pill size="sm">{filtered.length} shown</Pill>}>
          Фильтр
        </CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              <Pill active={openOnly} onClick={() => setOpenOnly(true)}>
                Open only
              </Pill>
              <Pill active={!openOnly} onClick={() => setOpenOnly(false)}>
                Include closed
              </Pill>
            </Row>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {(["All", "High", "Medium", "Low"] as const).map((s) => (
                <Pill key={s} active={sev === s} onClick={() => setSev(s)}>
                  {s}
                </Pill>
              ))}
            </Row>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {(
                [
                  "All",
                  "Architecture",
                  "Memory / Perf",
                  "Errors / Stability",
                  "GUI / UX",
                ] as const
              ).map((c) => (
                <Pill key={c} active={cat === c} onClick={() => setCat(c)}>
                  {c}
                </Pill>
              ))}
            </Row>
          </Stack>
        </CardBody>
      </Card>

      <H2>Findings</H2>
      <Table
        headers={["ID", "Sev", "Category", "Location", "Issue"]}
        columnAlign={["left", "left", "left", "left", "left"]}
        rows={filtered.map((f) => [
          f.id,
          f.severity,
          f.category,
          <Stack key={`${f.id}-loc`} gap={2}>
            <Text weight="medium" size="small">
              {f.file}
            </Text>
            <Text tone="secondary" size="small">
              L{f.lines}
            </Text>
          </Stack>,
          <Stack key={`${f.id}-body`} gap={4}>
            <Text weight="medium">{f.title}</Text>
            <Text tone="secondary" size="small">
              {f.evidence}
            </Text>
          </Stack>,
        ])}
      />

      <Divider />

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H2>Проверки</H2>
          <Text size="small" weight="medium">
            tsc · ek5/7/8/9/12 · runtime · p12 · userFacingError
          </Text>
          <Text size="small">pytest jobs/pipeline/projects/results</Text>
        </Stack>
        <Stack gap={8}>
          <H2>Accepted residual</H2>
          <Text
            size="small"
            tone="secondary"
            style={{ color: theme.fg.muted }}
          >
            ERR-07 BLE001 best-effort · UX-06/07 inputs/layout already OK ·
            model hooks may still be large behind thin façades.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}

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

/** Re-audit #2 fix pass · 2026-11-13 · all findings closed/accepted. */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "High",
    category: "Architecture",
    file: "routes/common.py + stripped routers",
    lines: "orcai_available",
    title: "Route boilerplate — закрыто",
    evidence: "Shared orcai_available(); unused imports stripped per router.",
    status: "closed",
  },
  {
    id: "ARCH-02",
    severity: "High",
    category: "Architecture",
    file: "pipeline_inspect_assemble + train_pipeline",
    lines: "inspect_pipeline thin",
    title: "inspect_pipeline god — закрыто",
    evidence: "Step assembly/readiness extracted; def inspect_pipeline stays for ek12.",
    status: "closed",
  },
  {
    id: "ARCH-03",
    severity: "High",
    category: "Architecture",
    file: "public helpers + consumers",
    lines: "cross-module",
    title: "_foo cross-imports — закрыто",
    evidence: "Consumers on AUDIO_CACHE_DIR, JOBS_LOCK, sync_persist, APP_DIR, …; _ aliases kept.",
    status: "closed",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "adapters/spectrogram façade",
    lines: "~331",
    title: "Spectrogram >500 — закрыто",
    evidence: "meta/histogram/waveform/tile modules; façade re-exports.",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "jobs.py façade",
    lines: "~69",
    title: "jobs thick façade — закрыто",
    evidence: "job_registry + job_lifecycle; _jobs/_lock/_sync_persist on jobs for tests.",
    status: "closed",
  },
  {
    id: "ARCH-06",
    severity: "Medium",
    category: "Architecture",
    file: "lib/timeouts.ts",
    lines: "SHORT/MEDIUM",
    title: "HTTP short timeouts — закрыто",
    evidence: "SIDECAR_HTTP_SHORT/MEDIUM/MEDIUM_LONG used in jobs/fs/models/filterPreview.",
    status: "closed",
  },
  {
    id: "ARCH-07",
    severity: "Medium",
    category: "Architecture",
    file: "lib/pollIntervals.ts",
    lines: "monitor log + summary",
    title: "pollIntervals gaps — закрыто",
    evidence: "TrainMonitor log 1500/4000 + project summary 8000 centralized.",
    status: "closed",
  },
  {
    id: "ARCH-08",
    severity: "Medium",
    category: "Architecture",
    file: "preferencesHydration.ts",
    lines: "hydrate split",
    title: "Preferences god — закрыто",
    evidence: "Hydrate/first-launch extracted; provider API unchanged.",
    status: "closed",
  },
  {
    id: "ARCH-09",
    severity: "Medium",
    category: "Architecture",
    file: "pipelineErrorCopy.ts",
    lines: "copy tables",
    title: "pipelineErrorExplain monolith — закрыто",
    evidence: "Copy tables split; classify re-exported.",
    status: "closed",
  },
  {
    id: "ARCH-10",
    severity: "Medium",
    category: "Architecture",
    file: "routes/media + audio",
    lines: "public cache",
    title: "AUDIO_CACHE_DIR consumers — закрыто",
    evidence: "media uses public AUDIO_CACHE_DIR / audio_cache_key.",
    status: "closed",
  },
  {
    id: "ARCH-11",
    severity: "Low",
    category: "Architecture",
    file: "COPY_FEEDBACK_MS",
    lines: "1600",
    title: "Copy toast delay — закрыто",
    evidence: "Shared 1600ms in Params/Filter/Wizard/LabDock.",
    status: "closed",
  },
  {
    id: "PERF-01",
    severity: "High",
    category: "Memory / Perf",
    file: "routes/runtime capabilities",
    lines: "async+to_thread",
    title: "capabilities TF probe — закрыто",
    evidence: "async GET; probe payload via asyncio.to_thread.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "High",
    category: "Memory / Perf",
    file: "routes/models import/export",
    lines: "async+to_thread",
    title: "models copytree — закрыто",
    evidence: "import/export off event loop.",
    status: "closed",
  },
  {
    id: "PERF-03",
    severity: "High",
    category: "Memory / Perf",
    file: "cache clear + factory reset",
    lines: "async+to_thread",
    title: "rmtree on loop — закрыто",
    evidence: "spectrograms_cache_clear + maintenance_factory_reset via to_thread.",
    status: "closed",
  },
  {
    id: "PERF-04",
    severity: "Medium",
    category: "Memory / Perf",
    file: "ResultsPage live summary",
    lines: "5k slim",
    title: "Results live 50k — закрыто",
    evidence: "setSummary(slimResultsSnapshotForCache); KPIs from aggregates.",
    status: "closed",
  },
  {
    id: "PERF-05",
    severity: "Medium",
    category: "Memory / Perf",
    file: "fs read/write-text",
    lines: "async+to_thread",
    title: "fs text I/O — закрыто",
    evidence: "32MiB cap kept; I/O on to_thread.",
    status: "closed",
  },
  {
    id: "PERF-06",
    severity: "Low",
    category: "Memory / Perf",
    file: "labels_export_audacity",
    lines: "spec_executor",
    title: "Audacity export sync — закрыто",
    evidence: "async + run_in_executor(spec_executor).",
    status: "closed",
  },
  {
    id: "ERR-01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "SettingsRuntimePanel",
    lines: "restart catch",
    title: "Device switch silent — закрыто",
    evidence: "Rollback + formatUserFacingErrorRequired → notifyHeaderError.",
    status: "closed",
  },
  {
    id: "ERR-02",
    severity: "Medium",
    category: "Errors / Stability",
    file: "segmentTime.ts",
    lines: "finite guard",
    title: "NaN segment bounds — закрыто",
    evidence: "Non-finite → safe {t0:0,t1:span}; tests added.",
    status: "closed",
  },
  {
    id: "ERR-03",
    severity: "Medium",
    category: "Errors / Stability",
    file: "capabilities",
    lines: "via PERF-01",
    title: "Cold probe hang feel — закрыто",
    evidence: "Probe no longer blocks uvicorn event loop.",
    status: "closed",
  },
  {
    id: "ERR-04",
    severity: "Low",
    category: "Errors / Stability",
    file: "useProjectNavActions openPredict",
    lines: "beginBusy",
    title: "openPredict latch — закрыто",
    evidence: "beginBusy/endBusy; Projects Predict disabled={busy}.",
    status: "closed",
  },
  {
    id: "ERR-05",
    severity: "Low",
    category: "Errors / Stability",
    file: "BLE001",
    lines: "accepted",
    title: "except Exception — ок",
    evidence: "No bare except:; best-effort logged. Accepted.",
    status: "closed",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "detections max-height:none",
    lines: "gate",
    title: "Detections layout — ок",
    evidence: "layoutScaleGate intentional; unchanged.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Medium",
    category: "GUI / UX",
    file: "Projects Predict CTA",
    lines: "busy",
    title: "Predict double-click — закрыто",
    evidence: "openPredict busy latch (ERR-04).",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "TrainWizardFooter",
    lines: "busy",
    title: "Wizard secondary buttons — закрыто",
    evidence: "Cancel/Back/Copy disabled={busy}.",
    status: "closed",
  },
  {
    id: "UX-04",
    severity: "Low",
    category: "GUI / UX",
    file: "PredictParamsRunStudio",
    lines: "Copy",
    title: "CLI Copy during batch — закрыто",
    evidence: "disabled={batchRunning || !commandLine}.",
    status: "closed",
  },
  {
    id: "UX-05",
    severity: "Low",
    category: "GUI / UX",
    file: "SettingsRuntimePanel",
    lines: "toast",
    title: "Device snap-back UX — закрыто",
    evidence: "Header error on restart failure (ERR-01).",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit2Closed() {
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
        <H1>orcAI Desktop · re-audit #2 · закрыто</H1>
        <Text tone="secondary">
          Fix pass · {new Date().toISOString().slice(0, 10)} · Open ={" "}
          {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="danger" />
        <Stat value={String(counts.Medium)} label="Medium open" tone="warning" />
        <Stat value={String(counts.Low)} label="Low open" tone="info" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Все 27 пунктов re-audit #2 закрыты или accepted. Capabilities/models/
        cache/fs/audacity на to_thread/executor; Results live slim 5k; route
        common + inspect assemble + public _ consumers; jobs/spectrogram
        façades; Settings/openPredict/wizard/Copy locks; segmentTime finite.
        tsc · gates · pytest зелёные.
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
            tsc · ek4/12 · runtime · p12 · segmentTime
          </Text>
          <Text size="small">pytest jobs/pipeline/fs/models/maintenance</Text>
        </Stack>
        <Stack gap={8}>
          <H2>Accepted</H2>
          <Text
            size="small"
            tone="secondary"
            style={{ color: theme.fg.muted }}
          >
            ERR-05 BLE001 · UX-01 detections max-height:none (layout gate)
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}

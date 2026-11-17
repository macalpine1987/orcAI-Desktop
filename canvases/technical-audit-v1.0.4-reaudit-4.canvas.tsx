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

/**
 * Residual re-audit #4 after #3 closed (Results 5k, singleflight, façades,
 * poll/timeout leftovers, silentCatch reconcile). No code changes this pass.
 * Scope: what still remains.
 */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/sidecar.rs",
    lines: "1–991",
    title: "Shell sidecar god-module (~991 LOC)",
    evidence:
      "Spawn, watch thread, port pick/free, curl health/engine wait, launch spec, log tail in one file. Violates SRP; harder to test/port than UI façades already split.",
    status: "open",
  },
  {
    id: "ARCH-02",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/ui_http.rs",
    lines: "1–891",
    title: "Custom keep-alive HTTP client (~891 LOC)",
    evidence:
      "Pool, framing, base64 body, BODY_CAP in one module. Parallel to sidecar.rs size debt; not a façade yet.",
    status: "open",
  },
  {
    id: "ARCH-03",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../routes/projects.py",
    lines: "1–543 · 27 routers",
    title: "projects router grab-bag (27 endpoints)",
    evidence:
      "CRUD, recordings import/delete, annotations, artifacts, pipeline, snippet calculator, train monitor, parameters, CSV preview — one APIRouter. Import scheduling + dual delete live here.",
    status: "open",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../model_studio_list.py",
    lines: "~479",
    title: "model_studio_list still large after façade",
    evidence:
      "List enrichment, detail, spectro key compare, dir size rglob, CSV/MBA helpers remain in one module (façade only re-exports). Soft residual called out in #3.",
    status: "open",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "useRuntimeLifecycle.ts + useSidecarHealthPolling.ts",
    lines: "~475 + ~465",
    title: "Runtime orchestration hooks still dense",
    evidence:
      "startAll/stopAll/engine/device restart vs health poll + Tauri listeners + orphan stop. Options bags are wide; further extract (boot vs steady-state) would shrink SRP surface.",
    status: "open",
  },
  {
    id: "ARCH-06",
    severity: "Medium",
    category: "Architecture",
    file: "apps/ui/.../usePredictPageState.ts",
    lines: "~472",
    title: "Predict page state composer still heavy",
    evidence:
      "Composes queue/batch/filter/analysis/profiles/tabs/nav/workspace + shell meta bridge. Thin page façade pattern works, but the composer itself is still a god-hook.",
    status: "open",
  },
  {
    id: "ARCH-07",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../routes/jobs.py + models.py + runtime.py + fs.py",
    lines: "sync def handlers",
    title: "Sync FastAPI handlers on event loop",
    evidence:
      "jobs_create/cancel/queue, models_detail/compatibility, engine_start/stop, fs_exists/orcai-parameter are plain def (not to_thread). Disk/CPU work can stall other async routes under load.",
    status: "open",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "apps/ui/.../PreferencesContext.tsx",
    lines: "~481",
    title: "Preferences context bag",
    evidence:
      "Theme/locale/scale/dock/verbosity/compute device + persist/hydrate/erase in one provider. Split storage vs chrome sync would match other façade work.",
    status: "open",
  },
  {
    id: "ARCH-09",
    severity: "Low",
    category: "Architecture",
    file: "routes/projects.py delete recordings",
    lines: "307–325",
    title: "Dual delete-recordings endpoints",
    evidence:
      "POST .../recordings/delete and DELETE .../recordings both call the same impl — intentional client quirk, still DRY noise in the router.",
    status: "open",
  },
  {
    id: "ARCH-10",
    severity: "Low",
    category: "Architecture",
    file: "apps/ui/.../SpectrogramIcons.tsx",
    lines: "~487",
    title: "Icon dump module",
    evidence:
      "Large SVG icon barrel; no logic risk, but keeps OVER_350 inventory noisy. Split by domain (transport / studio / chrome) if touching icons.",
    status: "open",
  },
  {
    id: "ARCH-11",
    severity: "Low",
    category: "Architecture",
    file: "project_annotation_stats / pipeline_inspect_assemble / train_monitor",
    lines: "~528 / ~524 / ~515",
    title: "Sidecar mid-size domain modules",
    evidence:
      "Already extracted from larger gods; still >500 LOC. Next split only if behavior changes touch them — not urgent vs shell/routes.",
    status: "open",
  },
  {
    id: "PERF-01",
    severity: "Medium",
    category: "Memory / Perf",
    file: "src-tauri/src/lib.rs + sidecar.rs",
    lines: "lib 139–146 · sidecar 533–564",
    title: "sidecar_engine_start blocks up to 600s",
    evidence:
      "async command with sync body: start_engine_and_wait polls health with thread::sleep up to timeout_secs=600. UI await is fine; occupies a Tauri blocking worker for the whole warmup.",
    status: "open",
  },
  {
    id: "PERF-02",
    severity: "Medium",
    category: "Memory / Perf",
    file: "src-tauri/src/sidecar.rs",
    lines: "79–88 · 438",
    title: "begin_sidecar_start can sleep ~12s",
    evidence:
      "port_listening_with_retries(port, 48, 250ms) inside begin_sidecar_start before background spawn. Same async-command pool; worst-case stalls concurrent host invokes.",
    status: "open",
  },
  {
    id: "PERF-03",
    severity: "Medium",
    category: "Memory / Perf",
    file: "src-tauri/src/ui_http.rs",
    lines: "12–14",
    title: "HTTP body cap 64 MiB in RAM",
    evidence:
      "BODY_CAP = 64 * 1024 * 1024; responses buffered then base64 for WKWebView. Large spectrogram/audio-adjacent payloads can spike process RSS.",
    status: "open",
  },
  {
    id: "PERF-04",
    severity: "Medium",
    category: "Memory / Perf",
    file: "routes/models.py + model_studio_list.py",
    lines: "models 28–40 · list _dir_size_bytes",
    title: "models_detail sync + directory walk",
    evidence:
      "get_model_detail on event loop; _dir_size_bytes rglob walks model trees. Concurrent UI selects can hitch other /v1 traffic.",
    status: "open",
  },
  {
    id: "PERF-05",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/sidecar/.../routes/fs.py",
    lines: "58–75",
    title: "fs/read-text up to 32 MiB",
    evidence:
      "_FS_TEXT_MAX_BYTES = 32 MiB fully read into a string. Guarded 413, but peak memory = full file + JSON encode.",
    status: "open",
  },
  {
    id: "PERF-06",
    severity: "Low",
    category: "Memory / Perf",
    file: "job_lifecycle cancel_jobs_on_shutdown",
    lines: "cancel settle=True default",
    title: "Shutdown cancel settles workers sync",
    evidence:
      "jobs_cancel_active → cancel_jobs_on_shutdown → cancel_job(settle=True default) joins workers on the request thread before process kill. Correct for Quit; can delay Stop if workers hang.",
    status: "open",
  },
  {
    id: "ERR-01",
    severity: "Low",
    category: "Errors / Stability",
    file: "apps/sidecar/.../store.py",
    lines: "127–139",
    title: "sqlite check_same_thread=False",
    evidence:
      "connect() disables same-thread check; safe if always via db_session close, risky if a long-lived conn is shared across threads without discipline.",
    status: "open",
  },
  {
    id: "ERR-02",
    severity: "Low",
    category: "Errors / Stability",
    file: "except Exception (BLE001)",
    lines: "sidecar adapters / jobs",
    title: "Broad except Exception — accepted",
    evidence:
      "No bare except: found. Broad Exception catches remain intentional around orcAI/TF edges. Same accepted residual as #3.",
    status: "closed",
  },
  {
    id: "ERR-03",
    severity: "Low",
    category: "Errors / Stability",
    file: "useTrainWizardLaunch.ts",
    lines: "286–294",
    title: "Empty catch on launch rollback cancel",
    evidence:
      "Best-effort cancelJob in catch {}; intentional. Not silentCatch-tagged; low risk.",
    status: "open",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "styles/analysis-lab-filter.css",
    lines: "2558 · 2595 · 2602",
    title: "Filter studio max-height: none",
    evidence:
      "Detections/table-hero use max-height:none (layout gate intentionally allows predict-results detections). Confirm filter paths stay capped by parent flex/min-height:0 — same contract as accepted UX-01 #3.",
    status: "open",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Models busy locks",
    lines: "PredictParams* · ModelsPage",
    title: "Busy locks present — spot-check OK",
    evidence:
      "PredictParams queue/run disable on batchRunning/busy; ModelsPage useBusyGuard. No new missing-lock High/Medium found this pass.",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate / modal vh caps",
    lines: "train-wizard / projects / ConfirmDialog",
    title: "vh only on modal caps — OK",
    evidence:
      "Heroes use cqh/container; 100vh limited to modal max-height min(..., calc(100vh-3rem)) per TZ. Not a regression.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit4() {
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
        <H1>orcAI Desktop · residual re-audit #4</H1>
        <Text tone="secondary">
          После закрытия #3 · без правок кода ·{" "}
          {new Date().toISOString().slice(0, 10)} · Open = {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="success" />
        <Stat
          value={String(counts.Medium)}
          label="Medium open"
          tone="warning"
        />
        <Stat value={String(counts.Low)} label="Low open" tone="info" />
      </Grid>

      <Callout tone="warning" title="Вердикт">
        High = 0. Критичные #3 (Results wire, stampede, KPI, leftovers) закрыты.
        Остаток — mid-size gods: Rust shell (sidecar.rs / ui_http.rs), projects
        router, runtime hooks, sync FastAPI + долгий engine wait, BODY_CAP 64
        MiB. Bare except: нет. Таймеры/SSE cleanup в UI в целом с clear.
        Inventory: 64 файла ≥350 LOC, 11 ≥500.
      </Callout>

      <Callout tone="neutral" title="Уже закрыто в #3 (не повторять)">
        Results soft 5k + KPI from summary · section_cache singleflight ·
        transport/projectsStudio/model_studio façade / jobs_create ·
        pollIntervals leftovers · SIDECAR_HTTP_PREVIEW_MS · reconcile
        silentCatch · ResultsStudio extracts.
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

      <Stack gap={6}>
        <H2>Приоритет, если править дальше</H2>
        <Text size="small" tone="secondary">
          1) Sync FastAPI → to_thread для models_detail / тяжёлых jobs handlers.
          2) Разрез routes/projects.py по доменам. 3) sidecar.rs / ui_http.rs
          модули. 4) Runtime hooks split. 5) BODY_CAP / engine-wait worker
          hygiene — по необходимости.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Accepted: BLE001 · detections max-height:none (layout gate) · busy
          locks / vh modal caps OK.
        </Text>
      </Stack>
    </Stack>
  );
}

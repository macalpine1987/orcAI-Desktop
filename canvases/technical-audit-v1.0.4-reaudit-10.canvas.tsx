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
 * Residual re-audit #10 — deep audit, no code changes.
 * Scope: what remains after fix passes #6–#9 / reaudit-9.
 * Method: LOC inventory, bare-except scan, sync-route scan, UI timer/busy/vh/error spot-check.
 */
const FINDINGS: Finding[] = [
  // ——— Architecture ———
  {
    id: "ARCH-20",
    severity: "Low",
    category: "Architecture",
    file: "project_studio_table / spectrogram_render / store / train_monitor / pipeline_inspect_assemble",
    lines: "501–524",
    title: "Sidecar mid-size domains (optional split)",
    evidence:
      "5 production modules ≥500. Already post-extract (studio_table from project_studio; inspect_assemble from pipeline). Split only with behavior change — not SRP blockers vs closed #6–#9 debt.",
    status: "open",
  },
  {
    id: "ARCH-21",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState.ts",
    lines: "~456",
    title: "Predict page composer — accepted",
    evidence:
      "Intentional hook composer + public return bag; PredictPage façade thin; shell meta / queue already extracted (#9). Further split = API churn without behavior gain.",
    status: "closed",
  },
  {
    id: "ARCH-22",
    severity: "Low",
    category: "Architecture",
    file: "useRuntimeLifecycle.ts + SidecarContext",
    lines: "~401 · ~353",
    title: "Runtime orchestration — closed (#7/#9)",
    evidence:
      "closePolicy / engine host / health snapshot / Tauri listeners extracted; Context is wiring. Residual size is lifecycle surface, not a god-class.",
    status: "closed",
  },
  {
    id: "ARCH-23",
    severity: "Low",
    category: "Architecture",
    file: "api/projects/types.ts + *.test.*",
    lines: "584 · tests 513–798",
    title: "Types / test bulk ≥500 — accepted",
    evidence:
      "4 of 11 ≥500 are tests; types.ts is API surface, not runtime god-class. Inventory: 11 ≥500, 66 ≥350.",
    status: "closed",
  },
  {
    id: "ARCH-24",
    severity: "Low",
    category: "Architecture",
    file: "SIDECAR_DEFAULT_PORT = 8741",
    lines: "sidecar.ts · sidecar/mod.rs · main.py",
    title: "Triplicated default port — documented DRY",
    evidence:
      "Comments require keep-in-sync; runtime binds dynamic port; UI refuses unbound default in production path (hasRuntimeSidecarBase). Not a behavior bug.",
    status: "closed",
  },
  {
    id: "ARCH-25",
    severity: "Low",
    category: "Architecture",
    file: "lib.rs / Preferences / Icons / annotation_stats / queue",
    lines: "post-#9",
    title: "Prior Low bag — closed (#9)",
    evidence:
      "commands/ split · controllers · spectrogramIcons barrel · counts/readiness façade · queue import/lifecycle. lib~235, prefs~259, icons façade~2, stats~212, queue~126.",
    status: "closed",
  },

  // ——— Memory / Perf ———
  {
    id: "PERF-10",
    severity: "Low",
    category: "Memory / Perf",
    file: "routes/runtime.py health()",
    lines: "18–27",
    title: "Sync /health on event loop — accepted",
    evidence:
      "Only sync FastAPI handler in routes/. Docstring: polled often; engine_runtime_info lock-local. engine/capabilities use to_thread.",
    status: "closed",
  },
  {
    id: "PERF-11",
    severity: "Low",
    category: "Memory / Perf",
    file: "store.py connect / db_session",
    lines: "127–151",
    title: "SQLite check_same_thread=False — documented",
    evidence:
      "Contract: prefer db_session; connect() callers must close. maintenance.reset_desktop_database uses try/finally close (L89–97). Production paths use with db_session().",
    status: "closed",
  },
  {
    id: "PERF-12",
    severity: "Low",
    category: "Memory / Perf",
    file: "UI timers / Tauri listeners / SSE",
    lines: "spot-check",
    title: "Listener / timer cleanup — OK",
    evidence:
      "SidecarContext 500ms interval clears; train monitor intervals + onCloseRequested unlisten; useSidecarTauriListeners dispose; spectrogram layout debounce clear; reconcile focus timer clear.",
    status: "closed",
  },
  {
    id: "PERF-13",
    severity: "Low",
    category: "Memory / Perf",
    file: "BODY_CAP / port retry / Results 5k",
    lines: "prior passes",
    title: "Prior perf items — closed",
    evidence:
      "BODY_CAP 32 MiB · port 8×100ms · Results truncation / singleflight · LRU Maps — from #6–#7.",
    status: "closed",
  },

  // ——— Errors / Stability ———
  {
    id: "ERR-10",
    severity: "Low",
    category: "Errors / Stability",
    file: "apps/sidecar (BLE001)",
    lines: "~28 files",
    title: "except Exception — accepted boundaries",
    evidence:
      "bare except: = 0 under apps/. Broad Exception at job cancel/worker/media/TF boundaries with noqa + HTTP/log mapping. Not silent swallow of user actions.",
    status: "closed",
  },
  {
    id: "ERR-11",
    severity: "Low",
    category: "Errors / Stability",
    file: "formatUserFacingError* / silentCatch",
    lines: "runtime + jobs + pages",
    title: "User-facing errors — OK",
    evidence:
      "Toasts/pages use formatUserFacingErrorRequired/I18n; silentCatch on best-effort (home models, lifecycle). No raw stack in primary UX paths.",
    status: "closed",
  },
  {
    id: "ERR-12",
    severity: "Low",
    category: "Errors / Stability",
    file: "Heavy I/O vs GUI thread",
    lines: "routes + workers",
    title: "Main-thread hang risk — mitigated",
    evidence:
      "HTTP handlers async+to_thread for disk/jobs/media; orcAI jobs in worker threads; engine start via host HTTP (not WKWebView fetch). Sync health only.",
    status: "closed",
  },

  // ——— GUI / UX ———
  {
    id: "UX-10",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Projects / Pipeline / Models / Home",
    lines: "busy props",
    title: "Busy locks — OK",
    evidence:
      "useBusyGuard; batchRunning disables run; pipeline busyId; projects busy; filter/export busy. Spot-check no missing lock on primary start actions.",
    status: "closed",
  },
  {
    id: "UX-11",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate / modal vh / max-height:none",
    lines: "css + gates",
    title: "Scale / layout contract — OK",
    evidence:
      "100vh only modal caps (min(…rem, calc(100vh-3rem))); heroes use cqh/flex. Filter/detections max-height:none intentional (nested scroll). Train monitor uses 100dvh.",
    status: "closed",
  },
  {
    id: "UX-12",
    severity: "Low",
    category: "GUI / UX",
    file: "Input validation",
    lines: "forms / dialogs",
    title: "Input validation — OK (residual)",
    evidence:
      "Filter min/max → JSON null; shell_open_url http(s) only; project name check endpoint; wav-only import filter. No new High/Medium validation gaps found this pass.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit10() {
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
        <H1>orcAI Desktop · residual re-audit #10</H1>
        <Text tone="secondary">
          Глубокий аудит без правок кода · после #9 · 2026-11-13 · Open ={" "}
          {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="success" />
        <Stat
          value={String(counts.Medium)}
          label="Medium open"
          tone="success"
        />
        <Stat value={String(counts.Low)} label="Low open" tone="info" />
      </Grid>

      <Callout tone="success" title="Вердикт: что ещё осталось">
        High = 0 · Medium = 0. Критичный и mid debt из #3–#9 закрыты. Единственный
        открытый пункт — optional Low: 5 mid-size sidecar-модулей (501–524 LOC),
        которые уже post-extract; дробить имеет смысл только при смене поведения.
        Bare except: = 0. Sync HTTP handler: только /health (намеренно). Таймеры,
        busy-locks, layout, user-facing errors — OK.
      </Callout>

      <Callout tone="neutral" title="Инвентарь">
        ≥500 LOC: 11 файлов (4 — тесты; 1 — types.ts; 5 — sidecar domains; 1 —
        закрытый composer-контекст вне ≥500). ≥350: 66. Закрыто ранее: Rust
        commands/, ui_http/, media routers, to_thread, runtime hooks, prefs
        controllers, icons barrel, annotation_stats split, predict queue split.
      </Callout>

      <Callout tone="info" title="По четырём осям запроса">
        1) Clean Code — god-modules сняты; остаток = intentional composers +
        optional sidecar mid-size. 2) Память/perf — db_session/close, listener
        cleanup, BODY_CAP, to_thread. 3) Ошибки — нет голого except:; BLE001 на
        границах. 4) GUI — busy locks + formatUserFacingError* + layout gates.
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
        <H2>Если править дальше</H2>
        <Text size="small" tone="secondary">
          Только optional: split project_studio_table.py (~501),
          adapters/spectrogram_render.py (~507), store.py (~513),
          train_monitor.py (~515), pipeline_inspect_assemble.py (~524) — при
          реальной смене поведения. Не трогать usePredictPageState return bag и
          types/tests ради LOC.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Код не менялся в этом проходе. Предыдущий fix: reaudit-9 canvas.
        </Text>
      </Stack>
    </Stack>
  );
}

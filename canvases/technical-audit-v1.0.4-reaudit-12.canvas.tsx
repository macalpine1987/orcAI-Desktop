import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
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
  status: "open" | "accepted";
};

/**
 * Deep residual re-audit #12 — no code changes.
 * Method: LOC inventory (prod ≥350/500), bare-except scan, sync-route scan,
 * UI timer/listener cleanup heuristic, Map/LRU bounds, raw-error surfaces,
 * busy-lock / vh / formatUserFacing spot-check. Baseline after ARCH-20 (#11).
 */
const FINDINGS: Finding[] = [
  // ——— Architecture ———
  {
    id: "ARCH-30",
    severity: "Low",
    category: "Architecture",
    file: "production modules ≥500",
    lines: "inventory",
    title: "God-modules — none in runtime code",
    evidence:
      "Only production ≥500 is apps/ui/src/api/projects/types.ts (584, API surface). Prior mid-size sidecar (≥501) split in #11. No SRP-blocking god-class left.",
    status: "accepted",
  },
  {
    id: "ARCH-31",
    severity: "Low",
    category: "Architecture",
    file: "useSpectrogramViewerModel · TrainWizard* · train_live · project_studio_annotations · usePredictPageState",
    lines: "456–489",
    title: "Mid-size composers / domain modules — intentional",
    evidence:
      "~52 prod files ≥350. Heaviest composers already post-extract façades. Further split = API churn without behavior gain. Not open debt.",
    status: "accepted",
  },
  {
    id: "ARCH-32",
    severity: "Low",
    category: "Architecture",
    file: "SIDECAR_DEFAULT_PORT = 8741",
    lines: "sidecar.ts · sidecar/mod.rs · main.py",
    title: "Triplicated default port — documented DRY",
    evidence:
      "Keep-in-sync comments; runtime uses dynamic port; UI refuses unbound default (hasRuntimeSidecarBase). Not a behavior bug.",
    status: "accepted",
  },
  {
    id: "ARCH-33",
    severity: "Low",
    category: "Architecture",
    file: "routes/media.py · routes/projects.py",
    lines: "20–30",
    title: "Nested FastAPI include_router — accepted style",
    evidence:
      "media → labels/results/spectrogram/audio/maintenance; projects → crud/recordings/studio/train. Flat façade at main.py. Not a god-router.",
    status: "accepted",
  },

  // ——— Memory / Perf ———
  {
    id: "PERF-20",
    severity: "Low",
    category: "Memory / Perf",
    file: "routes/runtime.py health()",
    lines: "17–27",
    title: "Only sync FastAPI handler — intentional",
    evidence:
      "def health() keeps event loop light; engine_runtime_info is lock-local. All other routes async + asyncio.to_thread for disk/CPU.",
    status: "accepted",
  },
  {
    id: "PERF-21",
    severity: "Low",
    category: "Memory / Perf",
    file: "UI timers / EventSource / AbortController",
    lines: "JobsList · pipeline poll · train monitor · jobEventStream · ColormapCanvas",
    title: "Listener / interval cleanup — OK",
    evidence:
      "setInterval paired with clearInterval in production hooks. connectJobEventStream returns es.close(). ColormapCanvas aborts + drops grayRef on unmount. False-positive heuristic hits were comments/tests only.",
    status: "accepted",
  },
  {
    id: "PERF-22",
    severity: "Low",
    category: "Memory / Perf",
    file: "store_db · job_logs · caches",
    lines: "db_session · prune · LRU",
    title: "DB / cache bounds — OK",
    evidence:
      "db_session always closes; maintenance reset_desktop_database try/finally close. Jobs log flush timer cancelable. Pipeline/section/tile/build_locks/UI Maps capped (12–64 / bytes).",
    status: "accepted",
  },
  {
    id: "PERF-23",
    severity: "Low",
    category: "Memory / Perf",
    file: "Qt signals/slots",
    lines: "N/A",
    title: "Widget signal cleanup — not applicable",
    evidence:
      "Stack is Tauri 2 + React (no Qt). Window close = hide-on-close + stopEngine/stopSidecar on quit. React effect cleanups cover listeners.",
    status: "accepted",
  },

  // ——— Errors / Stability ———
  {
    id: "ERR-20",
    severity: "Low",
    category: "Errors / Stability",
    file: "apps/**/*.py",
    lines: "scan",
    title: "Bare except: = 0",
    evidence:
      "No bare except: under apps/. BaseException only in tmp cleanup (project_studio_table_io L85–87, predict_recording L94–98) with re-raise. BLE001 at job/media/TF boundaries with noqa + HTTP/log mapping.",
    status: "accepted",
  },
  {
    id: "ERR-21",
    severity: "Low",
    category: "Errors / Stability",
    file: "UI user-facing errors",
    lines: "formatUserFacingError*",
    title: "Raw stack-toasts — none found",
    evidence:
      "Spot-check: setError/setLastError paths use formatUserFacingErrorI18n/Required. silentCatch for background probes. No raw err.message toast surfaces in pages/hooks scan.",
    status: "accepted",
  },
  {
    id: "ERR-22",
    severity: "Low",
    category: "Errors / Stability",
    file: "Heavy work off main thread",
    lines: "to_thread · chunked gray extract",
    title: "GUI-thread block risk — mitigated",
    evidence:
      "Sidecar disk/STFT via asyncio.to_thread. SpectrogramColormapCanvas chunked extractGrayLuminanceAsync / grayToRgbaPixelsAsync yields to event loop. Native dialogs via Tauri plugin.",
    status: "accepted",
  },

  // ——— GUI / UX ———
  {
    id: "UX-20",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict* · ModelsStudio · Filter",
    lines: "busy / fieldsDisabled",
    title: "Busy locks during jobs — OK",
    evidence:
      "PredictParamsRunStudio / QueuePanel / FilterStudio / ModelsStudio disable actions on busy|batchRunning. Engine/runtime gates on Home remain.",
    status: "accepted",
  },
  {
    id: "UX-21",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate · analysis-lab* · train-*",
    lines: "cqh / modal vh cap",
    title: "Window scale / vh policy — OK",
    evidence:
      "Heroes use container/cqh (gates forbid plot vh). Modal caps min(Nrem, calc(100vh-3rem)) per TZ. Monitor uses 100dvh for detached window.",
    status: "accepted",
  },
  {
    id: "UX-22",
    severity: "Low",
    category: "GUI / UX",
    file: "callDurationLimits · filter inputs · wizard",
    lines: "prior + gates",
    title: "Input validation / copy — OK",
    evidence:
      "Duration limits parse point/comma; empty→null JSON. pipelineErrorCopy for train remediation. No new invalid-input crash paths found this pass.",
    status: "accepted",
  },
];

export default function TechnicalAuditReaudit12() {
  const theme = useHostTheme();
  const [sev, setSev] = useState<"All" | Severity>("All");
  const [cat, setCat] = useState<"All" | Category>("All");
  const [showAccepted, setShowAccepted] = useState(true);

  const openFindings = useMemo(
    () => FINDINGS.filter((f) => f.status === "open"),
    [],
  );

  const filtered = useMemo(() => {
    const base = showAccepted
      ? FINDINGS
      : FINDINGS.filter((f) => f.status === "open");
    return base.filter(
      (f) =>
        (sev === "All" || f.severity === sev) &&
        (cat === "All" || f.category === cat),
    );
  }, [sev, cat, showAccepted]);

  const byCat = useMemo(() => {
    const order: Category[] = [
      "Architecture",
      "Memory / Perf",
      "Errors / Stability",
      "GUI / UX",
    ];
    return order.map((c) => ({
      cat: c,
      items: FINDINGS.filter((f) => f.category === c),
    }));
  }, []);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1140 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · deep re-audit #12</H1>
        <Text tone="secondary">
          v1.0.4 residual · no code changes · 2026-11-13 · после ARCH-20 (#11)
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="0" label="Open findings" tone="success" />
        <Stat value="0" label="High open" tone="success" />
        <Stat value="0" label="Medium open" tone="success" />
        <Stat value="0" label="Low open" tone="success" />
      </Grid>

      <Callout tone="success" title="Вердикт — что ещё осталось?">
        Actionable open = 0 (High/Medium/Low). Критичный и mid debt закрыты в
        #6–#11. Ниже — только принятые trade-off’ы (accepted), не очередь на
        правку. Новый сплит/рефактор — только при смене поведения.
      </Callout>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Метод</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                LOC: 1 prod ≥500 (types.ts) · ~52 prod ≥350 · tests отдельно
              </Text>
              <Text size="small">
                bare except: = 0 · sync HTTP = 1 (/health) · raw toast scan = 0
              </Text>
              <Text size="small">
                LRU/prune: jobs, pipeline, section, tiles, build_locks, UI Maps
              </Text>
              <Text size="small">
                UI: busy locks · layoutScaleGate · formatUserFacing*
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Inventory (prod ≥450)</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small" tone="secondary">
                Composers / domain — not open debt
              </Text>
              <Text size="small">
                useSpectrogramViewerModel 489 · defaults 488 · ModelStep 483
              </Text>
              <Text size="small">
                train_live 462 · annotations 457 · usePredictPageState 456
              </Text>
              <Text size="small">
                DetectionsTable 453 · audioPlayback 451 · SegmentRail 449
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader trailing={<Pill size="sm">{filtered.length} shown</Pill>}>
          Фильтр
        </CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              <Pill
                active={!showAccepted}
                onClick={() => setShowAccepted(false)}
              >
                Open only (0)
              </Pill>
              <Pill
                active={showAccepted}
                onClick={() => setShowAccepted(true)}
              >
                Include accepted
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

      <H2>Findings (accepted residuals)</H2>
      {!showAccepted && openFindings.length === 0 ? (
        <Callout tone="neutral" title="Open only">
          Нет открытых пунктов. Включите «Include accepted», чтобы видеть
          принятые остатки по четырём осям аудита.
        </Callout>
      ) : (
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
              <Row gap={8} style={{ alignItems: "center" }}>
                <Text weight="medium">{f.title}</Text>
                <Pill size="sm" tone="neutral">
                  {f.status}
                </Pill>
              </Row>
              <Text tone="secondary" size="small">
                {f.evidence}
              </Text>
            </Stack>,
          ])}
        />
      )}

      <Divider />

      <H2>По осям аудита</H2>
      <Stack gap={14}>
        {byCat.map(({ cat: c, items }) => (
          <Stack key={c} gap={6}>
            <H3>{c}</H3>
            {items.map((f) => (
              <Text key={f.id} size="small">
                {f.id}: {f.title} — {f.file} (L{f.lines})
              </Text>
            ))}
          </Stack>
        ))}
      </Stack>

      <Divider />

      <Stack gap={6}>
        <H2>Дальше</H2>
        <Text size="small" tone="secondary">
          Очереди на «Поправь» по аудиту нет. Не дробить types/tests/composers
          ради LOC. Следующий цикл — только при регрессии или новой фиче.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Prior: reaudit-11 closed ARCH-20 · this pass confirms Open stays 0.
        </Text>
      </Stack>
    </Stack>
  );
}

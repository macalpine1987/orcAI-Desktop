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
};

/** Re-audit remediation closed 2026-11-13. */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "High",
    category: "Architecture",
    file: "apps/ui/.../labDock/* + LabDock.tsx",
    lines: "shell ~200",
    title: "LabDock god-component — закрыто",
    evidence:
      "Позитивный контроль: LabDockChrome / LabDockPanes / LabDockMain; thin LabDock export.",
  },
  {
    id: "ARCH-02",
    severity: "High",
    category: "Architecture",
    file: "apps/ui/.../spectrogram/detection*",
    lines: "table + columns + modals",
    title: "Таблица детекций — закрыто",
    evidence:
      "Позитивный контроль: detectionTableColumns, useModalFocus, DetectionsTableModals.",
  },
  {
    id: "ARCH-03",
    severity: "High",
    category: "Architecture",
    file: "apps/ui/.../predictParams/*",
    lines: "helpers + QueueRow + StudioSwitch",
    title: "PredictParamsRunStudio — закрыто",
    evidence:
      "Позитивный контроль: predictParamsHelpers, QueueRow, StudioSwitch вынесены.",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "apps/ui/hooks/usePredictPageState.ts",
    lines: "composer + workspace sync hook",
    title: "Predict composer — закрыто",
    evidence:
      "Позитивный контроль: usePredictWorkspaceModelSync + существующие predict hooks.",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "apps/ui/sidecar/SidecarContext.tsx",
    lines: "tick 500ms",
    title: "Runtime tick / poll — закрыто",
    evidence:
      "Позитивный контроль: starting tick 250→500ms; silentCatch на invoke-пробах.",
  },
  {
    id: "ARCH-06",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/job_types.py + train_pipeline_cache.py",
    lines: "types / cache",
    title: "Sidecar domain split — закрыто",
    evidence:
      "Позитивный контроль: Job/JobStatus → job_types; pipeline cache → train_pipeline_cache.",
  },
  {
    id: "ARCH-07",
    severity: "Low",
    category: "Architecture",
    file: "apps/sidecar/.../helpers_cmd.py",
    lines: "rewrite_table_base_dirs",
    title: "Публичный rewrite_table_base_dirs — закрыто",
    evidence:
      "Позитивный контроль: public rewrite_table_base_dirs; _-alias сохранён.",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "apps/ui/api/sidecar.ts",
    lines: "6–10",
    title: "SIDECAR_DEFAULT_PORT fallback — ок",
    evidence:
      "Позитивный контроль: документированный fallback; health только с runtimeBase.",
  },
  {
    id: "ARCH-09",
    severity: "Low",
    category: "Architecture",
    file: "apps/ui/.../SpectrogramViewerChrome.tsx",
    lines: "17–32",
    title: "Chrome props сгруппированы — ок",
    evidence:
      "Позитивный контроль предыдущего фикса.",
  },
  {
    id: "PERF-01",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/sidecar/.../routes/projects.py",
    lines: "recording-table / annotations / artifacts",
    title: "Disk-роуты async+to_thread — закрыто",
    evidence:
      "Позитивный контроль: table/channel/annotations/import/delete/artifacts на to_thread.",
  },
  {
    id: "PERF-02",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/sidecar/.../spectrogram_cache.py",
    lines: "37–48",
    title: "Disk cache default 1 GiB — закрыто",
    evidence:
      "Позитивный контроль: default 1 GiB; ORCAI_SPEC_CACHE_MAX_BYTES override.",
  },
  {
    id: "PERF-03",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/ui/lib/spectrogramTileCache.ts",
    lines: "4–8, 48–70",
    title: "Клиентский tile LRU — закрыто",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "PERF-04",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/sidecar/.../routes/fs.py",
    lines: "91–136",
    title: "fs_read/write text capped 32 MiB — закрыто",
    evidence:
      "Позитивный контроль MEM-01.",
  },
  {
    id: "PERF-05",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/ui/sidecar/SidecarContext.tsx",
    lines: "563–567",
    title: "Boot tick 500ms — закрыто",
    evidence:
      "Позитивный контроль: интервал 500ms при starting.",
  },
  {
    id: "PERF-06",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/sidecar/.../job_queue.py + main.py",
    lines: "stop(); shutdown",
    title: "Scheduler stop на process exit — закрыто",
    evidence:
      "Позитивный контроль MEM-07.",
  },
  {
    id: "ERR-01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "apps/sidecar (jobs/runner/train_live/…)",
    lines: "BLE001 best-effort",
    title: "Широкие except Exception — ок",
    evidence:
      "Позитивный контроль: осознанный trade-off persist/parse; без голых except:.",
  },
  {
    id: "ERR-02",
    severity: "Medium",
    category: "Errors / Stability",
    file: "apps/ui/lib/silentCatch.ts",
    lines: "Sidecar / Jobs / colormap / Home",
    title: "Тихие catch с DEV warn — закрыто",
    evidence:
      "Позитивный контроль: silentCatch + ключевые call sites.",
  },
  {
    id: "ERR-03",
    severity: "Low",
    category: "Errors / Stability",
    file: "apps/ui/lib/userFacingError.ts",
    lines: "27–80",
    title: "Единый truncate + i18n — ок",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "PredictParamsRunStudio.tsx",
    lines: "216+",
    title: "Блокировка полей при batchRunning — ок",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "PredictFilterStudio.tsx",
    lines: "100–141",
    title: "Валидация duration draft — ок",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "styles/train-monitor.css + modal CSS",
    lines: "tm 100dvh",
    title: "Масштаб monitor/модалок — ок",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "UX-04",
    severity: "Low",
    category: "GUI / UX",
    file: "useProjectsPageModel.ts",
    lines: "264–287",
    title: "Poll студии 12s — ок",
    evidence:
      "Позитивный контроль.",
  },
  {
    id: "UX-05",
    severity: "Low",
    category: "GUI / UX",
    file: "hooks/useNowSec.ts",
    lines: "entire",
    title: "Общий live-clock — закрыто",
    evidence:
      "Позитивный контроль UX-05.",
  },
];

export default function TechnicalAuditRepass() {
  const theme = useHostTheme();
  const [sev, setSev] = useState<"All" | Severity>("All");
  const [cat, setCat] = useState<"All" | Category>("All");
  const [openOnly, setOpenOnly] = useState(true);

  const openFindings = useMemo(
    () =>
      FINDINGS.filter(
        (f) =>
          !f.title.includes("закрыто") &&
          !f.title.includes("ок") &&
          !f.evidence.startsWith("Позитивный"),
      ),
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
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · повторный технический аудит</H1>
        <Text tone="secondary">
          Baseline v1.0.4+ · remediation closed ·{" "}
          {new Date().toISOString().slice(0, 10)}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High" tone="danger" />
        <Stat value={String(counts.Medium)} label="Medium" tone="warning" />
        <Stat value={String(counts.Low)} label="Low (open)" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Все пункты повторного аудита закрыты: UI-монолиты разрезаны, disk-роуты
        на to_thread, cache default 1 GiB, публичный rewrite_table_base_dirs,
        tick 500ms, silentCatch, job_types / pipeline cache.
      </Callout>

      <Card>
        <CardHeader
          trailing={<Pill size="sm">{filtered.length} shown</Pill>}
        >
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
        rowTone={filtered.map((f) =>
          f.severity === "High"
            ? "danger"
            : f.severity === "Medium"
              ? "warning"
              : undefined,
        )}
      />

      <Divider />

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H2>Закрыто в этом проходе</H2>
          <Text size="small">LabDock / Detections / ParamsRunStudio modules</Text>
          <Text size="small">to_thread annotations/artifacts/table · cache 1 GiB</Text>
          <Text size="small">rewrite_table_base_dirs public · tick 500ms</Text>
          <Text size="small">silentCatch · job_types · train_pipeline_cache</Text>
          <Text size="small">usePredictWorkspaceModelSync</Text>
        </Stack>
        <Stack gap={8}>
          <H2>Статус</H2>
          <Text size="small" weight="medium">
            Open findings: {counts.Open}
          </Text>
          <Text
            size="small"
            tone="secondary"
            style={{ marginTop: 8, color: theme.fg.muted }}
          >
            Include closed — полный список с позитивными контролями.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}

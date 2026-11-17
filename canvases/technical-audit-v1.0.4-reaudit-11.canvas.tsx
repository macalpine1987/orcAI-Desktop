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
 * Residual re-audit #11 — after ARCH-20 mid-size sidecar split (post #10).
 * Verify: PYTHONPATH=src pytest (jobs/projects/studio/maintenance/render/monitor) 126 passed.
 */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-20",
    severity: "Low",
    category: "Architecture",
    file: "sidecar mid-size domains",
    lines: "was 501–524",
    title: "Mid-size sidecar split — closed (#11)",
    evidence:
      "table→io/status/ops · spectrogram_render→color/audio · store→db/jobs/projects · train_monitor→helpers · inspect→steps/payload. Façades keep public imports. store._APP_DIR patch contract preserved.",
    status: "closed",
  },
  {
    id: "ARCH-21",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState / types / tests",
    lines: "composers · ≥500 tests",
    title: "Intentional composers / test bulk — accepted",
    evidence:
      "Predict page composer + API types + large tests remain; not production god-classes.",
    status: "closed",
  },
  {
    id: "PERF-10",
    severity: "Low",
    category: "Memory / Perf",
    file: "routes/runtime.py health()",
    lines: "18–27",
    title: "Sync /health — accepted",
    evidence: "Only sync FastAPI handler; intentional.",
    status: "closed",
  },
  {
    id: "ERR-10",
    severity: "Low",
    category: "Errors / Stability",
    file: "BLE001 / bare except",
    lines: "boundaries",
    title: "Exception boundaries — accepted",
    evidence: "bare except: = 0. Linear→dB now numpy (avoid broken librosa/numba host path).",
    status: "closed",
  },
  {
    id: "UX-10",
    severity: "Low",
    category: "GUI / UX",
    file: "busy / layout / errors",
    lines: "prior",
    title: "GUI contracts — OK",
    evidence: "Busy locks, formatUserFacingError*, layout gates unchanged this pass.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit11() {
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
        <H1>orcAI Desktop · residual re-audit #11</H1>
        <Text tone="secondary">
          После fix ARCH-20 · 2026-11-13 · Open = {counts.Open}
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
        <Stat value={String(counts.Low)} label="Low open" tone="success" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        High = 0 · Medium = 0 · Open Low = 0. Последний open-пункт #10 (mid-size
        sidecar) закрыт façade-сплитами. Verify: 126 pytest green (PYTHONPATH=src).
        Остаток ≥500 — только types.ts и крупные тесты.
      </Callout>

      <Callout tone="neutral" title="Что сделано в #11">
        project_studio_table → io/status/ops · spectrogram_render → color/audio ·
        store → db/jobs/projects (+ _APP_DIR на façade для patch) · train_monitor
        → helpers · pipeline_inspect → steps/payload · linear→dB через numpy.
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
        <H2>Дальше</H2>
        <Text size="small" tone="secondary">
          Критичный/mid/Low debt по аудиту закрыт. Дальнейшие сплиты — только при
          смене поведения. Не дробить types/tests ради LOC.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Inventory: ≥500 ≈ types + tests only · production mid-size domains &lt;
          350 façade.
        </Text>
      </Stack>
    </Stack>
  );
}

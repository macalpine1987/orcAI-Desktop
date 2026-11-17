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

/** Residual re-audit #3 fix pass · closed. */
const FINDINGS: Finding[] = [
  {
    id: "PERF-01",
    severity: "Medium",
    category: "Memory / Perf",
    file: "results_summary.py",
    lines: "soft 5k",
    title: "Results wire 50k — закрыто",
    evidence: "_RESULTS_SOFT_ROW_LIMIT=5000; KPIs scan full; rows truncated + truncated=true.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "Medium",
    category: "Memory / Perf",
    file: "runtime_state section_cache_get_or_build",
    lines: "singleflight",
    title: "Cache stampede — закрыто",
    evidence: "Singleflight for results/project summary + pipeline; fresh bypass; fails uncached.",
    status: "closed",
  },
  {
    id: "ERR-01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "ResultsStudio + resultsFiltersAreBaseline",
    lines: "KPI from summary",
    title: "KPI undercount — закрыто",
    evidence: "Baseline filters → data.summary/classes; filtered → recompute from rows.",
    status: "closed",
  },
  {
    id: "ARCH-01",
    severity: "Medium",
    category: "Architecture",
    file: "useSpectrogramTransportZoom",
    lines: "façade ~81",
    title: "Transport god-hook — закрыто",
    evidence: "zoom/pan/loop modules; public hook façade.",
    status: "closed",
  },
  {
    id: "ARCH-02",
    severity: "Medium",
    category: "Architecture",
    file: "projectsStudio barrel",
    lines: "~167",
    title: "projectsStudio grab-bag — закрыто",
    evidence: "readiness + wizardPaths; barrel re-exports.",
    status: "closed",
  },
  {
    id: "ARCH-03",
    severity: "Medium",
    category: "Architecture",
    file: "model_studio façade",
    lines: "~29",
    title: "model_studio monolith — закрыто",
    evidence: "list + io modules; façade re-exports (list still ~479 accepted size).",
    status: "closed",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "routes/jobs + job_create_route",
    lines: "router ~314",
    title: "jobs_create in router — закрыто",
    evidence: "Create body → job_create_route.py.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Results truncated banner",
    lines: "export visible-only",
    title: "Export/filter scope — закрыто",
    evidence: "Banner shown+total; export wording visible-only; class options from full classes.",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Low",
    category: "Architecture",
    file: "pollIntervals.ts",
    lines: "studio/reconcile/jobs",
    title: "poll leftovers — закрыто",
    evidence: "PROJECT_STUDIO / WORKSPACE_RECONCILE / JOBS_LIST_POLL centralized.",
    status: "closed",
  },
  {
    id: "ARCH-06",
    severity: "Low",
    category: "Architecture",
    file: "timeouts.ts",
    lines: "PREVIEW 30s",
    title: "filterPreview 30s — закрыто",
    evidence: "SIDECAR_HTTP_PREVIEW_MS.",
    status: "closed",
  },
  {
    id: "ARCH-07",
    severity: "Low",
    category: "Architecture",
    file: "ResultsStudio",
    lines: "~228",
    title: "ResultsStudio shell — закрыто",
    evidence: "KPI/chart/table extracts.",
    status: "closed",
  },
  {
    id: "ERR-02",
    severity: "Low",
    category: "Errors / Stability",
    file: "useReconcileWorkspaceOnRuntime",
    lines: "silentCatch",
    title: "Reconcile bare catch — закрыто",
    evidence: "silentCatch(\"reconcileWorkspace\").",
    status: "closed",
  },
  {
    id: "ERR-03",
    severity: "Low",
    category: "Errors / Stability",
    file: "BLE001",
    lines: "accepted",
    title: "except Exception — ок",
    evidence: "Accepted residual.",
    status: "closed",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "detections max-height:none",
    lines: "gate",
    title: "Layout contract — ок",
    evidence: "layoutScaleGate intentional; unchanged.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit3Closed() {
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
        <H1>orcAI Desktop · residual re-audit #3 · закрыто</H1>
        <Text tone="secondary">
          Fix + re-verify · {new Date().toISOString().slice(0, 10)} · Open ={" "}
          {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="success" />
        <Stat value={String(counts.Medium)} label="Medium open" tone="warning" />
        <Stat value={String(counts.Low)} label="Low open" tone="info" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Все 14 residual-пунктов закрыты или accepted. Results soft-cap 5k + KPI
        из summary; singleflight кэш; transport/projectsStudio/model_studio/
        jobs_create/ResultsStudio сплиты; poll/timeout leftovers; reconcile
        silentCatch. Перепроверка: tsc · ek5/7/9 · runtime · p12 · pytest 85.
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

      <Text size="small" tone="secondary" style={{ color: theme.fg.muted }}>
        Accepted: BLE001 · detections max-height:none (layout gate). Soft
        residual size: model_studio_list ~479.
      </Text>
    </Stack>
  );
}

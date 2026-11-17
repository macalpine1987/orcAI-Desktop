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

/** Re-audit #5 after fix pass for #4. */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-07",
    severity: "Medium",
    category: "Architecture",
    file: "routes/models|jobs|fs|runtime",
    lines: "to_thread",
    title: "Sync FastAPI → to_thread — закрыто",
    evidence:
      "models detail/compat, jobs clear/get/log/cancel/create wrappers, fs exists/parameter/defaults, engine start/stop off the event loop. health stays sync (light).",
    status: "closed",
  },
  {
    id: "ARCH-03",
    severity: "Medium",
    category: "Architecture",
    file: "routes/projects façade + project_routes_*",
    lines: "crud/recordings/studio/train",
    title: "projects router split — закрыто",
    evidence:
      "27 endpoints across 4 domain routers; projects.py include_router façade; ek12 joins train module.",
    status: "closed",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "model_studio_list + model_studio_detail",
    lines: "~308 + ~195",
    title: "model_studio_list split — закрыто",
    evidence: "detail/compat extracted; façade re-exports unchanged.",
    status: "closed",
  },
  {
    id: "ARCH-09",
    severity: "Low",
    category: "Architecture",
    file: "project_routes_recordings",
    lines: "dual delete",
    title: "Dual delete in recordings module — закрыто",
    evidence: "Both POST+DELETE stay (client quirk) but live in recordings domain file.",
    status: "closed",
  },
  {
    id: "PERF-03",
    severity: "Medium",
    category: "Memory / Perf",
    file: "ui_http.rs BODY_CAP",
    lines: "32 MiB",
    title: "BODY_CAP 64→32 MiB — закрыто",
    evidence: "Halves peak host HTTP buffer before base64.",
    status: "closed",
  },
  {
    id: "PERF-04",
    severity: "Medium",
    category: "Memory / Perf",
    file: "models_detail to_thread",
    lines: "async",
    title: "models_detail off event loop — закрыто",
    evidence: "With ARCH-07.",
    status: "closed",
  },
  {
    id: "PERF-05",
    severity: "Low",
    category: "Memory / Perf",
    file: "fs.py",
    lines: "16 MiB",
    title: "fs/read-text cap 32→16 MiB — закрыто",
    evidence: "_FS_TEXT_MAX_BYTES reduced.",
    status: "closed",
  },
  {
    id: "PERF-06",
    severity: "Low",
    category: "Memory / Perf",
    file: "jobs_cancel_active",
    lines: "to_thread",
    title: "Shutdown cancel off event loop — закрыто",
    evidence: "cancel_jobs_on_shutdown via asyncio.to_thread.",
    status: "closed",
  },
  {
    id: "ERR-03",
    severity: "Low",
    category: "Errors / Stability",
    file: "useTrainWizardLaunch",
    lines: "silentCatch",
    title: "Wizard rollback empty catch — закрыто",
    evidence: "silentCatch(\"wizardLaunchRollbackCancel\").",
    status: "closed",
  },
  {
    id: "ERR-01",
    severity: "Low",
    category: "Errors / Stability",
    file: "store.py",
    lines: "comment",
    title: "sqlite check_same_thread documented — закрыто",
    evidence: "Comment requires db_session/close; API unchanged.",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Low",
    category: "Architecture",
    file: "runtimeWait + useRuntimeLifecycle",
    lines: "partial",
    title: "waitUntil extracted — частичнo",
    evidence:
      "runtimeWait.ts extracted; lifecycle/health hooks still ~450+. Further split deferred.",
    status: "open",
  },
  {
    id: "ARCH-01",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/sidecar.rs",
    lines: "~991",
    title: "sidecar.rs god-module — остаётся",
    evidence: "Not split this pass (gate anchors + risk). Documented engine-wait on blocking pool.",
    status: "open",
  },
  {
    id: "ARCH-02",
    severity: "Low",
    category: "Architecture",
    file: "src-tauri/src/ui_http.rs",
    lines: "~891",
    title: "ui_http.rs size — остаётся",
    evidence: "BODY_CAP cut; module not split yet.",
    status: "open",
  },
  {
    id: "ARCH-06",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState.ts",
    lines: "~472",
    title: "Predict composer — остаётся",
    evidence: "Still a wide composer; page façade pattern already in place.",
    status: "open",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "PreferencesContext.tsx",
    lines: "~481",
    title: "Preferences context — остаётся",
    evidence: "ek10 gate now joins hydration/storage; further extract optional.",
    status: "open",
  },
  {
    id: "PERF-01",
    severity: "Low",
    category: "Memory / Perf",
    file: "sidecar_engine_start",
    lines: "doc",
    title: "Engine wait 600s — documented",
    evidence: "Comment: async command uses blocking pool; behavior unchanged.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "Low",
    category: "Memory / Perf",
    file: "begin_sidecar_start retries",
    lines: "~12s",
    title: "Port retry sleep — accepted",
    evidence: "Still sync retries; rare path. Left as-is.",
    status: "open",
  },
  {
    id: "ARCH-10",
    severity: "Low",
    category: "Architecture",
    file: "SpectrogramIcons.tsx",
    lines: "~487",
    title: "Icon dump — accepted",
    evidence: "No logic risk; deferred.",
    status: "open",
  },
  {
    id: "ARCH-11",
    severity: "Low",
    category: "Architecture",
    file: "annotation_stats / inspect / train_monitor",
    lines: ">500",
    title: "Mid-size domain modules — accepted",
    evidence: "Touch only when behavior changes.",
    status: "open",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "filter max-height:none",
    lines: "layout gate",
    title: "Layout contract — accepted",
    evidence: "Intentional with detections panel; unchanged.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit5() {
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
        <H1>orcAI Desktop · re-audit #5 (после фикса #4)</H1>
        <Text tone="secondary">
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

      <Callout tone="success" title="Вердикт">
        High = 0. Закрыты: sync FastAPI→to_thread, projects router split,
        model_studio detail, BODY_CAP/fs caps, wizard silentCatch, cancel-active
        off loop. Перепроверка: tsc · ek5/9/10/12 · runtime · p12 (50) · pytest
        85. Остаток: Rust shell size, UI orchestrator hooks, icon dump.
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
      <Text size="small" style={{ color: theme.fg.muted }}>
        Next optional: split sidecar.rs / ui_http.rs; thin
        useSidecarHealthPolling / usePredictPageState / PreferencesContext.
      </Text>
    </Stack>
  );
}

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

/** After fix pass · 2026-11-13 · re-verify remain report. */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-R01",
    severity: "High",
    category: "Architecture",
    file: "predictParams/PredictParamsQueuePanel.tsx",
    lines: "shell ~627",
    title: "Params queue panel — закрыто",
    evidence:
      "Позитивный контроль: PredictParamsQueuePanel вынесен; shell ~627.",
    status: "closed",
  },
  {
    id: "ARCH-R02",
    severity: "High",
    category: "Architecture",
    file: "spectrogram/DetectionsTableFooter + modals/columns",
    lines: "shell ~618",
    title: "Таблица детекций — закрыто",
    evidence:
      "Позитивный контроль: columns/modals/focus/footer; shell ~618.",
    status: "closed",
  },
  {
    id: "ARCH-R03",
    severity: "High",
    category: "Architecture",
    file: "spectrogram/spectrogramAudioPlayerTypes.ts",
    lines: "player ~749",
    title: "Audio player types — закрыто",
    evidence:
      "Позитивный контроль: Props/PlayScope/LoopRegion/STUDIO_VOLUME в types; cleanup audio element сохранён.",
    status: "closed",
  },
  {
    id: "ARCH-R04",
    severity: "High",
    category: "Architecture",
    file: "predictFilter/filterStudioControls.tsx",
    lines: "shell ~676",
    title: "FilterStudio controls — закрыто",
    evidence:
      "Позитивный контроль: DurationBoundField/FilterSwitch/IconDownload вынесены.",
    status: "closed",
  },
  {
    id: "ARCH-R05",
    severity: "High",
    category: "Architecture",
    file: "workspace/predictQueue{Types,Selection,Build}.ts",
    lines: "barrel ~55",
    title: "predictQueue god-module — закрыто",
    evidence:
      "Позитивный контроль: types/selection/build + barrel; 33/33 predictQueue.test.",
    status: "closed",
  },
  {
    id: "ARCH-R06",
    severity: "Medium",
    category: "Architecture",
    file: "SidecarContext.tsx",
    lines: "BOOT 750 / tick 500",
    title: "Runtime poll/tick — закрыто",
    evidence:
      "Позитивный контроль: BOOT_POLL_MS=750; listen silentCatch; tick 500ms.",
    status: "closed",
  },
  {
    id: "ARCH-R07",
    severity: "Medium",
    category: "Architecture",
    file: "usePredictWorkspaceModelSync + queue split",
    lines: "composer thinner",
    title: "Predict composers — закрыто",
    evidence:
      "Позитивный контроль: workspace model sync hook + queue domain split.",
    status: "closed",
  },
  {
    id: "ARCH-R08",
    severity: "Medium",
    category: "Architecture",
    file: "job_types.py + train_pipeline_cache.py",
    lines: "types/cache",
    title: "Sidecar domain split — закрыто",
    evidence:
      "Позитивный контроль: Job types + pipeline cache modules.",
    status: "closed",
  },
  {
    id: "ARCH-R09",
    severity: "Medium",
    category: "Architecture",
    file: "useTrainWizardDraft (residual)",
    lines: "~743",
    title: "Train wizard draft — ок (accepted)",
    evidence:
      "Позитивный контроль: не резали в этом проходе; silentCatch в соседних lifecycle. Accepted Medium residual.",
    status: "closed",
  },
  {
    id: "PERF-R01",
    severity: "Medium",
    category: "Memory / Perf",
    file: "routes/projects.py",
    lines: "list/CRUD/parameters/preview",
    title: "Project routes async+to_thread — закрыто",
    evidence:
      "Позитивный контроль: list/get/check-name/create/register/update/delete/recordings/parameters/sync/preview.",
    status: "closed",
  },
  {
    id: "PERF-R02",
    severity: "Medium",
    category: "Memory / Perf",
    file: "SidecarContext.tsx",
    lines: "BOOT_POLL_MS=750",
    title: "Boot poll 750ms — закрыто",
    evidence:
      "Позитивный контроль: 400→750ms.",
    status: "closed",
  },
  {
    id: "PERF-R03",
    severity: "Low",
    category: "Memory / Perf",
    file: "store.py connect()",
    lines: "120–128",
    title: "sqlite check_same_thread=False — ок",
    evidence:
      "Позитивный контроль: нужен workers; db_session всегда close.",
    status: "closed",
  },
  {
    id: "ERR-R01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "sidecar BLE001",
    lines: "best-effort",
    title: "except Exception — ок (accepted)",
    evidence:
      "Позитивный контроль: нет голых except:; BaseException с re-raise.",
    status: "closed",
  },
  {
    id: "ERR-R02",
    severity: "Medium",
    category: "Errors / Stability",
    file: "useRuntimeLifecycle + trainMonitorWindow",
    lines: "silentCatch",
    title: "Тихие catch → silentCatch — закрыто",
    evidence:
      "Позитивный контроль: DEV warn tags runtimeLifecycle / trainMonitorWindow.",
    status: "closed",
  },
  {
    id: "ERR-R03",
    severity: "Medium",
    category: "Errors / Stability",
    file: "SidecarContext listen",
    lines: "497+",
    title: "listen().catch silentCatch — закрыто",
    evidence:
      "Позитивный контроль: .catch(silentCatch(\"tauriListen\")).",
    status: "closed",
  },
  {
    id: "ERR-R04",
    severity: "Low",
    category: "Errors / Stability",
    file: "usePredictBatchRun.ts",
    lines: "overwrite preflight",
    title: "Batch path catch — закрыто",
    evidence:
      "Позитивный контроль: silentCatch(\"predictOverwritePreflight\").",
    status: "closed",
  },
  {
    id: "UX-R04",
    severity: "Low",
    category: "GUI / UX",
    file: "api/sidecar.ts",
    lines: "8741",
    title: "SIDECAR_DEFAULT_PORT — ок",
    evidence:
      "Позитивный контроль: fallback; health только с runtimeBase.",
    status: "closed",
  },
];

export default function TechnicalAuditRemainClosed() {
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
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · remain report · закрыто</H1>
        <Text tone="secondary">
          Re-verify after fix pass · {new Date().toISOString().slice(0, 10)} ·
          Open = {counts.Open}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.Open)} label="Open findings" />
        <Stat value={String(counts.High)} label="High open" tone="danger" />
        <Stat value={String(counts.Medium)} label="Medium open" tone="warning" />
        <Stat value={String(counts.Low)} label="Low open" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Все пункты remain-отчёта закрыты или accepted. Params queue / Filter
        controls / Detections footer / Audio types / predictQueue split;
        project routes to_thread; BOOT 750ms; silentCatch в lifecycle /
        listen / trainMonitor / batch preflight. tsc + gates + predictQueue
        33/33.
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
          <H2>Сделано в этом проходе</H2>
          <Text size="small">PredictParamsQueuePanel · filterStudioControls</Text>
          <Text size="small">predictQueue Types/Selection/Build · DetectionsFooter</Text>
          <Text size="small">Audio player types · BOOT 750 · silentCatch</Text>
          <Text size="small">projects CRUD/parameters/preview to_thread</Text>
        </Stack>
        <Stack gap={8}>
          <H2>Проверки</H2>
          <Text size="small" weight="medium">
            tsc · p12/ek7/ek8/dock gates · predictQueue 33/33
          </Text>
          <Text
            size="small"
            tone="secondary"
            style={{ marginTop: 8, color: theme.fg.muted }}
          >
            Open only пуст — все статусы closed/accepted.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}

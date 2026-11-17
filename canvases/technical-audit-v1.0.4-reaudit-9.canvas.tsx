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
 * Residual re-audit #9 — after Low debt fix pass (post reaudit-8).
 * Verified: cargo check · tsc · 8 gate suites (79) · annotation_stats import.
 */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-15",
    severity: "Low",
    category: "Architecture",
    file: "src-tauri/src/commands/",
    lines: "lib~235 · cmds split",
    title: "Tauri command bag — closed (#9)",
    evidence:
      "commands/{sidecar,window,shell}_cmds; lib.rs pub use + generate_handler; cargo check green.",
    status: "closed",
  },
  {
    id: "ARCH-06",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState.ts",
    lines: "~456",
    title: "Predict page composer — closed (#9)",
    evidence:
      "Shell meta bridge extracted; still intentional hook composer + public return bag. PredictPage façade thin.",
    status: "closed",
  },
  {
    id: "ARCH-14",
    severity: "Low",
    category: "Architecture",
    file: "usePredictQueue + viewer",
    lines: "queue~126",
    title: "Queue orchestrator — closed (#9)",
    evidence:
      "Import + lifecycle hooks extracted; viewer already façades sub-hooks.",
    status: "closed",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "PreferencesContext.tsx",
    lines: "~259 + controllers",
    title: "Preferences provider — closed (#9)",
    evidence:
      "usePreferencesControllers holds setters/factory reset; hydration already separate. Gates join façade.",
    status: "closed",
  },
  {
    id: "ARCH-10",
    severity: "Low",
    category: "Architecture",
    file: "SpectrogramIcons.tsx",
    lines: "façade~2",
    title: "Icon dump — closed (#9)",
    evidence:
      "spectrogramIcons/{nav,zoom,tool,transport,base}; stable export * façade.",
    status: "closed",
  },
  {
    id: "ARCH-11",
    severity: "Low",
    category: "Architecture",
    file: "annotation_stats split",
    lines: "counts/readiness/façade",
    title: "Sidecar mid-size (largest) — closed (#9)",
    evidence:
      "project_annotation_{counts,readiness,stats} façade; registry imports unchanged. Remaining 501–524 optional.",
    status: "closed",
  },
  {
    id: "ARCH-16",
    severity: "Low",
    category: "Architecture",
    file: "types.ts + large *.test.*",
    lines: "584 · tests 513–798",
    title: "Types / test bulk ≥500 — accepted",
    evidence:
      "Not production god-classes; 4 of 12 ≥500 are tests. types.ts is API surface.",
    status: "closed",
  },
  {
    id: "ARCH-17",
    severity: "Low",
    category: "Architecture",
    file: "studio_table / spectrogram_render / store / train_monitor / inspect_assemble",
    lines: "501–524",
    title: "Residual mid-size sidecar domains",
    evidence:
      "Post-extract domains; split only with behavior change. Not SRP blockers vs prior passes.",
    status: "open",
  },
  {
    id: "PERF-08",
    severity: "Low",
    category: "Memory / Perf",
    file: "runtime.py health()",
    lines: "~18",
    title: "Sync /health — accepted",
    evidence: "Intentionally sync+cheap; engine/capabilities already to_thread.",
    status: "closed",
  },
  {
    id: "ERR-02",
    severity: "Low",
    category: "Errors / Stability",
    file: "except Exception (BLE001)",
    lines: "media / adapters",
    title: "Broad except Exception — accepted",
    evidence: "No bare except: under apps/. Boundaries map to HTTP.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Models busy",
    lines: "unchanged",
    title: "Busy locks — OK",
    evidence: "batchRunning/busy/fieldsDisabled; useBusyGuard.",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate / modal vh",
    lines: "cqh heroes",
    title: "Scale contract — OK",
    evidence: "100vh only modal caps. Filter/detections max-height:none intentional.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit9() {
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
        <H1>orcAI Desktop · residual re-audit #9</H1>
        <Text tone="secondary">
          После fix Low debt (#8 open) · 2026-11-13 · Open = {counts.Open}
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

      <Callout tone="success" title="Вердикт">
        High = 0 · Medium = 0 · Open Low = 1 (optional mid-size sidecar).
        Закрыто в этом проходе: lib.rs→commands/, Preferences controllers,
        SpectrogramIcons barrel, usePredictQueue import/lifecycle,
        annotation_stats counts/readiness, shell meta bridge. Verify: cargo
        check · tsc · 79 gate tests.
      </Callout>

      <Callout tone="neutral" title="Уже закрыто (не повторять)">
        Results 5k · singleflight · to_thread · projects/media façades ·
        runtimeWait · BODY_CAP · port-retry · sidecar/ui_http Rust modules ·
        runtime hooks · formatUserFacingError / silentCatch.
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
          Только optional Low: split studio_table / spectrogram_render / store /
          train_monitor / inspect_assemble при смене поведения. usePredictPageState
          остаётся composer (публичный return bag) — не дробить без нужды.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Inventory: 12 файлов ≥500 LOC (4 — тесты) · ~67 ≥350 · bare except: 0.
        </Text>
      </Stack>
    </Stack>
  );
}

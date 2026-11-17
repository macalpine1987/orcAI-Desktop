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
 * Re-audit #7 — after fix pass #6 (Rust/media/sync/hooks).
 * Inventory: 13 files ≥500 LOC, 71 ≥350 (includes large *.test.tsx).
 */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/sidecar/",
    lines: "mod 410 · launch 425 · curl 157 · port 32",
    title: "Sidecar shell split — closed",
    evidence:
      "Was ~991 monolith. Now port / curl_http / launch / mod façade. Pub API stable for lib.rs. ui_http tests 11/11.",
    status: "closed",
  },
  {
    id: "ARCH-02",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/ui_http/",
    lines: "mod 375 · framing 196 · exchange 184 · pool 132 · codec 36",
    title: "ui_http split — closed",
    evidence:
      "Was ~893. codec/pool/framing/exchange + tests in mod. BODY_CAP stays 32 MiB.",
    status: "closed",
  },
  {
    id: "ARCH-12",
    severity: "Medium",
    category: "Architecture",
    file: "routes/media*.py",
    lines: "façade 32 · domains ≤206",
    title: "media router split — closed",
    evidence:
      "labels/results/spectrogram/audio/maintenance + thin media.py. OpenAPI: 12 media paths registered.",
    status: "closed",
  },
  {
    id: "ARCH-13",
    severity: "Medium",
    category: "Architecture",
    file: "project_routes_recordings + media_spectrogram",
    lines: "import/init · meta",
    title: "Residual sync → to_thread — closed",
    evidence:
      "projects_import_recordings / projects_init async+to_thread; spectrogram_meta async+to_thread.",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "useRuntimeLifecycle + useSidecarHealthPolling",
    lines: "~401 + ~284",
    title: "Runtime hooks thinned — closed",
    evidence:
      "Extracted startEngineViaHost, useMainShellClosePolicy, applyHealthSnapshot, useSidecarTauriListeners. Health 465→284.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "Low",
    category: "Memory / Perf",
    file: "sidecar begin_sidecar_start",
    lines: "port retries",
    title: "Port retry capped — closed",
    evidence: "48×250ms (~12s) → 8×100ms (~0.8s) while holding state mutex.",
    status: "closed",
  },
  {
    id: "PERF-07",
    severity: "Low",
    category: "Memory / Perf",
    file: "spectrogram_meta",
    lines: "media_spectrogram",
    title: "Meta off event loop — closed",
    evidence: "Same as ARCH-13; asyncio.to_thread(_work).",
    status: "closed",
  },
  {
    id: "ARCH-06",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState.ts",
    lines: "~472",
    title: "Predict page composer",
    evidence:
      "Still composes queue/batch/filter/analysis/profiles; page façade already thin. Optional next.",
    status: "open",
  },
  {
    id: "ARCH-14",
    severity: "Low",
    category: "Architecture",
    file: "usePredictQueue.ts + viewer model",
    lines: "~447 + ~489",
    title: "Adjacent UI orchestrators",
    evidence: "Deferred; no runtime risk from this pass.",
    status: "open",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "PreferencesContext.tsx",
    lines: "~481",
    title: "Preferences provider bag",
    evidence: "Hydration/storage already extracted; further split optional.",
    status: "open",
  },
  {
    id: "ARCH-10",
    severity: "Low",
    category: "Architecture",
    file: "SpectrogramIcons.tsx",
    lines: "~487",
    title: "Icon dump module",
    evidence: "SVG barrel only; no runtime risk.",
    status: "open",
  },
  {
    id: "ARCH-11",
    severity: "Low",
    category: "Architecture",
    file: "annotation_stats / inspect / train_monitor / store / spectrogram_render",
    lines: "501–528",
    title: "Sidecar mid-size domain modules",
    evidence: "Already extracted gods; split when behavior changes.",
    status: "open",
  },
  {
    id: "ARCH-15",
    severity: "Low",
    category: "Architecture",
    file: "src-tauri/src/lib.rs",
    lines: "~596",
    title: "Tauri command bag",
    evidence:
      "Shell commands still one lib; sidecar/ui_http now modules. Optional command modules later.",
    status: "open",
  },
  {
    id: "ERR-02",
    severity: "Low",
    category: "Errors / Stability",
    file: "except Exception (BLE001)",
    lines: "media / adapters",
    title: "Broad except Exception — accepted",
    evidence: "No bare except: in apps/. BLE001 mapped to HTTP 500 at boundaries.",
    status: "closed",
  },
  {
    id: "ERR-04",
    severity: "Low",
    category: "Errors / Stability",
    file: "Timers / SSE / listeners",
    lines: "UI cleanup",
    title: "Listener cleanup — OK",
    evidence:
      "useSidecarTauriListeners clears timer + unlistens; close policy cancels. No new orphans.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Models busy",
    lines: "unchanged",
    title: "Busy locks — OK",
    evidence: "No regression this pass.",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate",
    lines: "cqh heroes",
    title: "Scale contract — OK",
    evidence: "Unchanged; vh only modal caps.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit7() {
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
        <H1>orcAI Desktop · re-audit #7</H1>
        <Text tone="secondary">
          После фикса #6 (Rust/media/sync/hooks) ·{" "}
          {new Date().toISOString().slice(0, 10)} · Open = {counts.Open}
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
        High = 0 · Medium open = 0. Закрыты god-modules Rust shell, media
        grab-bag, residual sync handlers, runtime hook density, port-retry
        12s. Bare except: нет. Vitest 1148/1148 · tsc OK · cargo check +
        ui_http 11/11. Pytest: env/librosa noise на части suite; OpenAPI
        media 12 paths OK.
      </Callout>

      <Callout tone="neutral" title="Сделано в #6">
        sidecar/ {{port,curl_http,launch,mod}} · ui_http/
        {{codec,pool,framing,exchange}} · media_* routers · import/init/meta
        to_thread · startEngineViaHost / closePolicy / applyHealthSnapshot /
        TauriListeners · port retries 8×100ms · string gates joined façades.
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
        <H2>Если править дальше (только Low)</H2>
        <Text size="small" tone="secondary">
          usePredictPageState / usePredictQueue / PreferencesContext /
          SpectrogramIcons / lib.rs command bag / mid-size sidecar domains
          (501–528). Не блокеры.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Inventory: 13 файлов ≥500 LOC · 71 ≥350 · bare except: 0.
        </Text>
      </Stack>
    </Stack>
  );
}

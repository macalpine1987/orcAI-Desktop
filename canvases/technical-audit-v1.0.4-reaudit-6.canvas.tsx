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
 * Residual re-audit #6 — after fix pass #5.
 * No code changes this pass. Inventory: 10 files ≥500 LOC, 63 ≥350.
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
      "Spawn, watch, port pick/free, curl health/engine wait, launch spec, log tail still one file. Largest remaining SRP debt.",
    status: "open",
  },
  {
    id: "ARCH-02",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/ui_http.rs",
    lines: "1–893",
    title: "Custom HTTP client still monolithic",
    evidence:
      "BODY_CAP cut to 32 MiB in #5; pool/framing/base64/codec remain one ~893 LOC module.",
    status: "open",
  },
  {
    id: "ARCH-12",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../routes/media.py",
    lines: "~443 · 12 routers",
    title: "media router grab-bag",
    evidence:
      "Audacity export, labels preview, results summary, spectrogram meta/warm/tile/waveform/histogram, audio playback/segment, factory reset — one APIRouter.",
    status: "open",
  },
  {
    id: "ARCH-13",
    severity: "Medium",
    category: "Architecture",
    file: "project_routes_recordings + media spectrogram_meta",
    lines: "recordings 58–132 · media 167–180",
    title: "Residual sync FastAPI handlers",
    evidence:
      "projects_import_recordings / projects_init are plain def; spectrogram_meta does disk+meta on event loop. Most other routes already to_thread (#5).",
    status: "open",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "useRuntimeLifecycle + useSidecarHealthPolling",
    lines: "~463 + ~465",
    title: "Runtime orchestration hooks still dense",
    evidence:
      "waitUntil extracted (#5); startAll/stopAll/device restart vs health poll+Tauri listeners still large Options bags.",
    status: "open",
  },
  {
    id: "ARCH-06",
    severity: "Low",
    category: "Architecture",
    file: "usePredictPageState.ts",
    lines: "~472",
    title: "Predict page composer",
    evidence:
      "Composes queue/batch/filter/analysis/profiles/tabs; page is thin, composer is still a god-hook.",
    status: "open",
  },
  {
    id: "ARCH-14",
    severity: "Low",
    category: "Architecture",
    file: "usePredictQueue.ts + useSpectrogramViewerModel.tsx",
    lines: "~447 + ~489",
    title: "Adjacent UI orchestrators",
    evidence:
      "Viewer model already façades sub-hooks but stays ~489; predict queue mixes import/sync/selection.",
    status: "open",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "PreferencesContext.tsx",
    lines: "~481",
    title: "Preferences provider bag",
    evidence:
      "Theme/locale/scale/dock/verbosity/device + persist. ek10 joins hydration/storage; further split optional.",
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
    file: "annotation_stats / inspect_assemble / train_monitor / store / spectrogram_render",
    lines: "501–528",
    title: "Sidecar mid-size domain modules",
    evidence:
      "Already extracted gods; still >500. Split when behavior changes — not urgent vs Rust/media.",
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
      "Shell commands, window chrome, sidecar invoke surface in one lib. Related to ARCH-01.",
    status: "open",
  },
  {
    id: "PERF-02",
    severity: "Low",
    category: "Memory / Perf",
    file: "sidecar.rs port_listening_with_retries",
    lines: "79–88 · begin ~438",
    title: "Port retry can sleep ~12s on blocking pool",
    evidence:
      "48×250ms inside begin_sidecar_start (async command). Rare; UI await OK, pool occupancy remains.",
    status: "open",
  },
  {
    id: "PERF-07",
    severity: "Low",
    category: "Memory / Perf",
    file: "spectrogram_meta sync",
    lines: "media 167–180",
    title: "Sync spectrogram meta on event loop",
    evidence:
      "get_spectrogram_meta + path resolve without to_thread; warm/tile already use executor.",
    status: "open",
  },
  {
    id: "ERR-02",
    severity: "Low",
    category: "Errors / Stability",
    file: "except Exception (BLE001)",
    lines: "media / adapters",
    title: "Broad except Exception — accepted",
    evidence:
      "No bare except: in apps/. BLE001 at media spectrogram/audio boundaries mapped to HTTP.",
    status: "closed",
  },
  {
    id: "ERR-04",
    severity: "Low",
    category: "Errors / Stability",
    file: "Timers / SSE / listeners",
    lines: "UI cleanup",
    title: "Listener cleanup — spot-check OK",
    evidence:
      "Widespread clearInterval/clearTimeout/removeEventListener; jobEventStream + tile cache abort paths present. No new orphan-timer High found.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Models busy",
    lines: "PredictParams* · ModelsPage",
    title: "Busy locks — OK",
    evidence: "batchRunning/busy/fieldsDisabled; ModelsPage useBusyGuard. No new missing-lock finding.",
    status: "closed",
  },
  {
    id: "UX-03",
    severity: "Low",
    category: "GUI / UX",
    file: "layoutScaleGate / modal vh",
    lines: "cqh heroes",
    title: "Scale contract — OK",
    evidence:
      "Heroes use cqh/container; 100vh only modal caps. detections max-height:none intentional (gate).",
    status: "closed",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "analysis-lab-filter.css",
    lines: "2558+",
    title: "Filter max-height:none — accepted",
    evidence: "Same layout contract as detections table-hero; parent min-height:0.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit6() {
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
        <H1>orcAI Desktop · residual re-audit #6</H1>
        <Text tone="secondary">
          После фикса #5 · без правок кода ·{" "}
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
        High = 0. Критичное из #3–#5 закрыто (Results 5k, singleflight, sync
        to_thread, projects split, BODY_CAP). Остаток — размер Rust shell,
        media router, residual sync handlers, UI orchestrator hooks. Bare
        except: нет. Таймеры/busy-locks/layout — OK.
      </Callout>

      <Callout tone="neutral" title="Уже закрыто (не повторять)">
        Results soft-cap + KPI · section_cache singleflight · projects domain
        routers · model_studio detail · FastAPI to_thread (jobs/models/fs/engine)
        · BODY_CAP 32 · fs 16 MiB · wizard silentCatch · cancel-active
        to_thread · runtimeWait extract.
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
          1) sidecar.rs / ui_http.rs модули. 2) media.py → spectrogram/audio/
          results routers. 3) spectrogram_meta + import/init → to_thread. 4)
          useSidecarHealthPolling / useRuntimeLifecycle / usePredictPageState.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Inventory: 10 файлов ≥500 LOC · 63 ≥350 · bare except: 0.
        </Text>
      </Stack>
    </Stack>
  );
}

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
 * Residual re-audit #8 — after fix pass #6 / reaudit-7.
 * No code changes this pass. Inventory: 13 ≥500 LOC, 71 ≥350.
 */
const FINDINGS: Finding[] = [
  {
    id: "ARCH-01",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/sidecar/",
    lines: "mod~410 · launch~425",
    title: "Sidecar shell split — closed (#7)",
    evidence: "port/curl_http/launch/mod; pub API for lib.rs intact.",
    status: "closed",
  },
  {
    id: "ARCH-02",
    severity: "Medium",
    category: "Architecture",
    file: "src-tauri/src/ui_http/",
    lines: "mod~375 + domains",
    title: "ui_http split — closed (#7)",
    evidence: "codec/pool/framing/exchange; BODY_CAP 32 MiB.",
    status: "closed",
  },
  {
    id: "ARCH-12",
    severity: "Medium",
    category: "Architecture",
    file: "routes/media*.py",
    lines: "façade~32",
    title: "media grab-bag — closed (#7)",
    evidence: "OpenAPI still lists 12 media paths via nested include_router.",
    status: "closed",
  },
  {
    id: "ARCH-13",
    severity: "Medium",
    category: "Architecture",
    file: "import/init/meta",
    lines: "recordings + media_spectrogram",
    title: "Residual sync handlers — closed (#7)",
    evidence:
      "HTTP handlers async+to_thread. Remaining sync defs are helpers (jobs_create, _*_sync) or health().",
    status: "closed",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "runtime hooks",
    lines: "~401 + ~284",
    title: "Runtime orchestration — closed (#7)",
    evidence: "closePolicy / engine host / health snapshot / Tauri listeners extracted.",
    status: "closed",
  },
  {
    id: "PERF-02",
    severity: "Low",
    category: "Memory / Perf",
    file: "sidecar/mod.rs begin_sidecar_start",
    lines: "~325",
    title: "Port retry — closed (#7)",
    evidence: "8×100ms (~0.8s), not 48×250ms.",
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
      "Composes queue/batch/filter/analysis/profiles/tabs; PredictPage façade already thin.",
    status: "open",
  },
  {
    id: "ARCH-14",
    severity: "Low",
    category: "Architecture",
    file: "usePredictQueue.ts + useSpectrogramViewerModel.tsx",
    lines: "~447 + ~489",
    title: "Adjacent UI orchestrators",
    evidence: "Viewer already façades sub-hooks; queue mixes import/sync/selection.",
    status: "open",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "PreferencesContext.tsx",
    lines: "~481",
    title: "Preferences provider bag",
    evidence: "Hydration/storage extracted; theme/locale/scale/dock/device still one provider.",
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
    file: "annotation_stats / inspect_assemble / train_monitor / store / spectrogram_render / studio_table",
    lines: "501–528",
    title: "Sidecar mid-size domain modules",
    evidence: "Already post-extract; split when behavior changes — not SRP blockers vs #6.",
    status: "open",
  },
  {
    id: "ARCH-15",
    severity: "Low",
    category: "Architecture",
    file: "src-tauri/src/lib.rs",
    lines: "~596",
    title: "Tauri command bag",
    evidence: "Shell commands / window chrome / sidecar invoke in one lib. Optional next.",
    status: "open",
  },
  {
    id: "ARCH-16",
    severity: "Low",
    category: "Architecture",
    file: "api/projects/types.ts + large *.test.tsx",
    lines: "584 · tests 513–798",
    title: "Types / test bulk ≥500",
    evidence: "Not production god-classes; tests inflate ≥500 count (4 of 13).",
    status: "open",
  },
  {
    id: "PERF-08",
    severity: "Low",
    category: "Memory / Perf",
    file: "runtime.py health()",
    lines: "~18",
    title: "Sync /health on event loop — accepted",
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
    id: "ERR-04",
    severity: "Low",
    category: "Errors / Stability",
    file: "Timers / SSE / listeners",
    lines: "UI cleanup",
    title: "Listener cleanup — OK",
    evidence:
      "Spot-check: clearTimeout/Interval, removeEventListener, unlisten, abort paths widespread. DB conn.close in engine/store/maintenance.",
    status: "closed",
  },
  {
    id: "ERR-05",
    severity: "Low",
    category: "Errors / Stability",
    file: "store.py check_same_thread=False",
    lines: "~135–137",
    title: "SQLite cross-thread — documented",
    evidence: "Comment requires db_session/close; not a new leak finding.",
    status: "closed",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "Predict / Models busy",
    lines: "unchanged",
    title: "Busy locks — OK",
    evidence: "batchRunning/busy/fieldsDisabled; useBusyGuard. No new missing-lock.",
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
      "100vh only modal caps (min(…rem, calc(100vh-3rem))). Filter/detections max-height:none intentional.",
    status: "closed",
  },
  {
    id: "UX-04",
    severity: "Low",
    category: "GUI / UX",
    file: "formatUserFacingError* / silentCatch",
    lines: "runtime + jobs",
    title: "User-facing errors — OK",
    evidence: "Toasts use formatUserFacingErrorI18n; silentCatch on best-effort paths.",
    status: "closed",
  },
];

export default function TechnicalAuditReaudit8() {
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
        <H1>orcAI Desktop · residual re-audit #8</H1>
        <Text tone="secondary">
          После #7 · без правок кода ·{" "}
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
        High = 0 · Medium = 0. Критичное и mid-size debt из #3–#7 закрыты
        (Results/singleflight/to_thread/projects/media/Rust shell/runtime
        hooks/port-retry). Остаток — только Low: UI composers, icon barrel,
        prefs bag, lib.rs command bag, mid-size sidecar domains, крупные
        тесты/types. Bare except: нет. Таймеры/busy-locks/layout/user-facing
        errors — OK.
      </Callout>

      <Callout tone="neutral" title="Уже закрыто (не повторять)">
        sidecar/ + ui_http/ modules · media_* routers · import/init/meta
        to_thread · runtimeWait + closePolicy + health snapshot + Tauri
        listeners · BODY_CAP 32 · port 8×100ms · formatUserFacingError /
        silentCatch · Results 5k + singleflight.
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
          Только Low: 1) usePredictPageState / usePredictQueue. 2)
          PreferencesContext. 3) lib.rs command modules. 4) mid-size sidecar
          (501–528) при смене поведения. Icons/tests — по желанию.
        </Text>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Inventory: 13 файлов ≥500 LOC (4 — тесты) · 71 ≥350 · bare except: 0.
        </Text>
      </Stack>
    </Stack>
  );
}

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

type Verdict = "Pass" | "Fail" | "Blocked" | "N/A";
type Sev = "Blocker" | "Major" | "Minor";

type Suite = {
  id: string;
  area: string;
  method: string;
  result: Verdict;
  evidence: string;
};

type Defect = {
  id: string;
  sev: Sev;
  status: "Open" | "Accepted" | "Env";
  title: string;
  evidence: string;
};

const SUITES: Suite[] = [
  {
    id: "S-UI",
    area: "UI · Vitest",
    method: "npm test (apps/ui)",
    result: "Pass",
    evidence: "183 files · 1168 tests · 0 failed (incl. PredictSession, Projects hydrate, LabKeepAlive, EK/P gates)",
  },
  {
    id: "S-SID",
    area: "Sidecar · pytest",
    method: "bundled python3.11 -m pytest (unsandboxed)",
    result: "Pass",
    evidence: "478 passed · 9 skipped · 13 subtests · 0 failed",
  },
  {
    id: "S-TSC",
    area: "UI · Typecheck",
    method: "tsc --noEmit",
    result: "Pass",
    evidence: "exit 0",
  },
  {
    id: "S-GATE",
    area: "Contracts · string gates",
    method: "session / keep-alive / layout / autonomy files",
    result: "Pass",
    evidence:
      "13/13: no queueRefreshAt · hydrateFromProject · nav dedupe · focus gate · App provider · keep-alive · no spectrogram 100vh · verify script present",
  },
  {
    id: "S-AUTO",
    area: "Packaging · AUTONOMY GATE",
    method: "verify-app-python.sh /tmp/orcAI Desktop.app",
    result: "Pass",
    evidence: "AUTONOMY GATE PASSED · orcAI 3.0.4 · models 2 · no Homebrew leaks · relocation OK",
  },
  {
    id: "S-SESS",
    area: "Predict · session store",
    method: "unit + Projects CTA + source contract",
    result: "Pass",
    evidence:
      "hydrateFromProject sets queue/activeProject · WORKSPACE_CHANGED pull · ERR-30/PERF-31 gates · CTA calls hydrate then navigate { tab }",
  },
  {
    id: "S-KA",
    area: "Lab · keep-alive",
    method: "LabKeepAliveHost + sectionActive consumers",
    result: "Pass",
    evidence:
      "Predict/Results always hosted when runtime accessible · audio/tiles/Results fetch gated by sectionActive · Results TTL 60s Map cap 16",
  },
  {
    id: "S-AUDIT",
    area: "Residual audit #13",
    method: "re-verify open findings fixed",
    result: "Pass",
    evidence: "ERR-30 / PERF-31 / TEST-01 closed · Open High/Medium/Low = 0",
  },
  {
    id: "S-MAN",
    area: "Manual E2E in .app UI",
    method: "Projects → Predict → Analysis on stamp",
    result: "Blocked",
    evidence:
      "Stamp .app is v1.0.4 @ Nov 13 23:10 — predates session-store source delta. Autonomy OK, but UI smoke of hydrate path needs rebuild or run from current tree.",
  },
];

const DEFECTS: Defect[] = [
  {
    id: "QA-01",
    sev: "Minor",
    status: "Open",
    title: "Stamp .app UI lag behind session-store source",
    evidence:
      "/tmp/orcAI Desktop.app CFBundleShortVersionString=1.0.4; working tree has PredictSessionProvider + openPredict hydrate (uncommitted). AUTONOMY PASS on stamp; release handoff of session-store needs rebuild.",
  },
  {
    id: "QA-02",
    sev: "Minor",
    status: "Accepted",
    title: "Spectrogram* tests emit act(...) stderr noise",
    evidence:
      "SpectrogramAudioPlayer / SpectrogramViewer tests Pass but log React act warnings. No assertion failures.",
  },
  {
    id: "QA-03",
    sev: "Minor",
    status: "Env",
    title: "Sidecar audio cache fails under Cursor sandbox",
    evidence:
      "test_mono_cache_roundtrip LibsndfileError writing ~/.orcai-desktop/audio-cache in sandbox; Pass with full FS. Not a product defect.",
  },
];

export default function SeniorQaSessionStore() {
  const theme = useHostTheme();
  const pass = SUITES.filter((s) => s.result === "Pass").length;
  const fail = SUITES.filter((s) => s.result === "Fail").length;
  const blocked = SUITES.filter((s) => s.result === "Blocked").length;
  const openBlockers = DEFECTS.filter(
    (d) => d.status === "Open" && d.sev === "Blocker",
  ).length;
  const openMajors = DEFECTS.filter(
    (d) => d.status === "Open" && d.sev === "Major",
  ).length;
  const openMinors = DEFECTS.filter(
    (d) => d.status === "Open" && d.sev === "Minor",
  ).length;

  const signOff =
    fail === 0 && openBlockers === 0 && openMajors === 0 ? "Pass" : "Fail";

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1120 }}>
      <Stack gap={6}>
        <H1>Senior QA · orcAI Desktop v1.0.4</H1>
        <Text tone="secondary">
          Full product pass · 2026-11-13 · focus: Predict session store +
          residual #13 · Lab-only · no orcAI fork
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat
          value={signOff}
          label="Sign-off"
          tone={signOff === "Pass" ? "success" : "danger"}
        />
        <Stat value={String(pass)} label="Suites Pass" tone="success" />
        <Stat
          value={String(blocked)}
          label="Suites Blocked"
          tone={blocked ? "warning" : "success"}
        />
        <Stat
          value={`${openBlockers}/${openMajors}/${openMinors}`}
          label="Open B/Maj/Min"
          tone={openMinors ? "warning" : "success"}
        />
      </Grid>

      <Callout
        tone={signOff === "Pass" ? "success" : "danger"}
        title="Вердикт Senior QA"
      >
        {signOff === "Pass"
          ? "Pass (conditional). Автотесты UI+sidecar, typecheck, contract gates и AUTONOMY GATE — зелёные. Blocker/Major open = 0. Условие: перед отдачей session-store пользователю пересобрать .app (QA-01)."
          : "Fail — см. открытые Blocker/Major."}
      </Callout>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Scope</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small">Runtime · Projects · Predict session · keep-alive</Text>
              <Text size="small">EK gates (4–16) via vitest string gates</Text>
              <Text size="small">Sidecar jobs/audio/spectrogram/pipeline</Text>
              <Text size="small">Packaging autonomy on /tmp/orcAI Desktop.app</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Build under test</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small">Desktop UI package 1.0.4 · stamp Info 1.0.4</Text>
              <Text size="small">orcAI in .app: 3.0.4</Text>
              <Text size="small">Source: session store + audit #13 fixes (WT)</Text>
              <Text size="small">Stamp mtime: ~23:10 (pre session-store UI)</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>Test matrix</H2>
      <Table
        headers={["ID", "Area", "Result", "Evidence"]}
        columnAlign={["left", "left", "left", "left"]}
        rows={SUITES.map((s) => [
          s.id,
          <Stack key={`${s.id}-a`} gap={2}>
            <Text weight="medium" size="small">
              {s.area}
            </Text>
            <Text tone="secondary" size="small">
              {s.method}
            </Text>
          </Stack>,
          <Pill
            key={`${s.id}-r`}
            size="sm"
            tone={
              s.result === "Pass"
                ? "success"
                : s.result === "Fail"
                  ? "danger"
                  : "warning"
            }
          >
            {s.result}
          </Pill>,
          <Text key={`${s.id}-e`} size="small" tone="secondary">
            {s.evidence}
          </Text>,
        ])}
      />

      <H2>Defects / residuals</H2>
      <Table
        headers={["ID", "Sev", "Status", "Finding"]}
        columnAlign={["left", "left", "left", "left"]}
        rows={DEFECTS.map((d) => [
          d.id,
          d.sev,
          d.status,
          <Stack key={`${d.id}-b`} gap={4}>
            <Text weight="medium">{d.title}</Text>
            <Text size="small" tone="secondary">
              {d.evidence}
            </Text>
          </Stack>,
        ])}
      />

      <Divider />

      <H2>Manual checklist (post-rebuild)</H2>
      <Stack gap={6}>
        <Text size="small">1. Запуск → jewel green · Projects editable</Text>
        <Text size="small">
          2. Проекты → Распознавание: Analysis enabled для predicted WAV
        </Text>
        <Text size="small">
          3. Sidebar away/back: spectrogram keep-alive · Results TTL soft
        </Text>
        <Text size="small">4. Focus on Home: no predict queue refetch chatter</Text>
        <Text size="small">5. ⌘W hide · ⌘Q stop sidecar+engine</Text>
      </Stack>

      <Divider />

      <Stack gap={6}>
        <H3>Sign-off</H3>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Pill size="sm" tone="success">
            Automated: Pass
          </Pill>
          <Pill size="sm" tone="warning">
            Stamp UI: rebuild required for session-store
          </Pill>
          <Pill size="sm" tone="success">
            Autonomy: PASSED
          </Pill>
        </Row>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Source: vitest 1168 · pytest 478 · verify-app-python · contract gates
          · residual audit #13
        </Text>
      </Stack>
    </Stack>
  );
}

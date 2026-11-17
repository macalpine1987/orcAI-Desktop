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
  status: "Open" | "Closed" | "Accepted" | "Env";
  title: string;
  evidence: string;
};

const SUITES: Suite[] = [
  {
    id: "S-TSC",
    area: "UI · Typecheck",
    method: "tsc -b (apps/ui)",
    result: "Pass",
    evidence: "exit 0",
  },
  {
    id: "S-UI",
    area: "UI · Vitest full",
    method: "vitest run (apps/ui)",
    result: "Pass",
    evidence:
      "184 files · 1170 tests · 0 failed (after manualCopyGate sync). Incl. PredictSession×5, SpectrogramLogicLcd×2, LabKeepAlive, EK/P gates",
  },
  {
    id: "S-SID",
    area: "Sidecar · unittest",
    method: "bundled python3.11 -m unittest discover",
    result: "Pass",
    evidence: "485 tests · 0 failed · NUMBA_CACHE_DIR set · unsandboxed",
  },
  {
    id: "S-RUST",
    area: "Tauri · cargo test",
    method: "cargo test (src-tauri)",
    result: "Pass",
    evidence: "14 passed · 0 failed",
  },
  {
    id: "S-GATE",
    area: "Contracts · logic gates",
    method: "session / keep-alive / runtime / LCD / errors",
    result: "Pass",
    evidence:
      "navAppliedKeyRef + handoff key · focus refresh only engineReady∧predict-path · no queueRefreshAt · LabKeepAlive Predict+Results · LCD transport on Position · formatUserFacingError in 36 modules · startAll/stopAll + hide≠quit",
  },
  {
    id: "S-AUTO",
    area: "Packaging · AUTONOMY GATE",
    method: "verify-app-python.sh on backup .app",
    result: "Pass",
    evidence:
      "Downloads/…/artifacts/orcAI Desktop.app · AUTONOMY GATE PASSED · orcAI 3.0.4 · models 2 · no Homebrew · relocation OK · /tmp stamp absent",
  },
  {
    id: "S-AUDIT",
    area: "Residual audit #13 reopen",
    method: "source re-check ERR-30/PERF-31/TEST-01",
    result: "Pass",
    evidence: "All three still present in code+tests · Open High/Medium/Low = 0",
  },
  {
    id: "S-MAN",
    area: "Manual E2E in running .app",
    method: "Home → Projects → Predict → Analysis → Monitor",
    result: "Blocked",
    evidence:
      "Interactive Lab UI not driven this pass (no live window automation). Stamp only in Downloads backup; /tmp/orcAI Desktop.app missing. Logic covered by unit/gates; click-path still human.",
  },
];

const DEFECTS: Defect[] = [
  {
    id: "QA-M01",
    sev: "Minor",
    status: "Closed",
    title: "manualCopyGate drifted after Windows dual-platform wording",
    evidence:
      "EN expected «hidden in the macOS build UI»; manual had «Desktop UI». Gate updated; vitest 1170/1170 green. Not a product logic bug.",
  },
  {
    id: "QA-M02",
    sev: "Minor",
    status: "Open",
    title: "No interactive .app smoke this session",
    evidence:
      "Cannot claim pixel/click coverage for Analysis LCD, keep-alive away/back, or train monitor window without launching the UI. Recommend one human pass on backup or rebuilt stamp.",
  },
  {
    id: "QA-M03",
    sev: "Minor",
    status: "Accepted",
    title: "Intentional composers remain mid-size",
    evidence:
      "usePredictPageState / useSpectrogramViewerModel / types.ts ≥350–500 LOC by design (audit #12/#13 accepted). Not SRP blockers; further split = churn.",
  },
];

const SERIOUS_LEFT: { topic: string; verdict: string }[] = [
  {
    topic: "Runtime start/stop / hide≠quit",
    verdict: "Нет серьёзного открытого долга — контракт в коде и тестах",
  },
  {
    topic: "Predict queue SoT / nav handoff / focus refresh",
    verdict: "Закрыто (ERR-30/PERF-31) — unit + string gates",
  },
  {
    topic: "Jobs cancel / start_fn fail / project scope",
    verdict: "Sidecar 485 green; FAIL≠hang covered earlier",
  },
  {
    topic: "Train monitor window / pipeline board",
    verdict: "Автопокрытие gates; живой клик — только ручной смоук",
  },
  {
    topic: "Spectrogram tiles LRU / LCD Position",
    verdict: "Unit + CSS contract; визуальный смоук — ручной",
  },
  {
    topic: "Autonomy / portable Python",
    verdict: "PASSED на backup .app",
  },
];

export default function SeniorQaMacFull20261115() {
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
    <Stack gap={20} style={{ padding: 20, maxWidth: 1140 }}>
      <Stack gap={6}>
        <H1>Senior QA · orcAI Desktop macOS</H1>
        <Text tone="secondary">
          Full product pass · 2026-11-15 · v1.0.4 · logic/functions focus ·
          Lab-only · no orcAI fork
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
          ? "Pass. Серьёзных открытых дефектов логики/функций (Blocker/Major) нет. Автотесты UI+sidecar+Rust, contract gates и AUTONOMY — зелёные. Остаётся только ручной click-smoke в .app (Minor QA-M02), не блокер релиза логики."
          : "Fail — см. открытые Blocker/Major."}
      </Callout>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Что прогнано</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small">tsc · vitest 1170 · sidecar unittest 485 · cargo 14</Text>
              <Text size="small">Session / keep-alive / LCD / runtime / errors gates</Text>
              <Text size="small">AUTONOMY on Downloads backup .app</Text>
              <Text size="small">Residual #13 ERR-30 / PERF-31 / TEST-01 reopen</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Что не прогнано</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small">Живой клик по Lab UI / монитору обучения</Text>
              <Text size="small">Полный train/predict на реальных WAV в этом сеансе</Text>
              <Text size="small">/tmp stamp отсутствует — только backup .app</Text>
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

      <H2>Есть ли ещё серьёзное для проверки?</H2>
      <Table
        headers={["Тема", "Оценка"]}
        columnAlign={["left", "left"]}
        rows={SERIOUS_LEFT.map((r) => [
          <Text key={r.topic} weight="medium" size="small">
            {r.topic}
          </Text>,
          <Text key={`${r.topic}-v`} size="small" tone="secondary">
            {r.verdict}
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

      <H2>Рекомендуемый ручной смоук (15 мин)</H2>
      <Stack gap={6}>
        <Text size="small">1. Запуск → jewel green · ⌘W hide · ⌘Q stop</Text>
        <Text size="small">2. Проект → Распознавание: очередь переживает уход на Главную</Text>
        <Text size="small">3. Анализ: ▶ у Позиции, цифры не прыгают · Results keep-alive</Text>
        <Text size="small">4. Обучение: Монитор во 2-м окне · свернуть Lab · монитор жив</Text>
        <Text size="small">5. Отмена задачи / Stop на Главной снимает незавершённые</Text>
      </Stack>

      <Divider />

      <Stack gap={6}>
        <H3>Sign-off</H3>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Pill size="sm" tone="success">
            Automated: Pass
          </Pill>
          <Pill size="sm" tone="success">
            Logic debts High/Med: 0
          </Pill>
          <Pill size="sm" tone="warning">
            Manual click-smoke: pending
          </Pill>
          <Pill size="sm" tone="success">
            Autonomy: PASSED
          </Pill>
        </Row>
        <Text size="small" style={{ color: theme.fg.muted }}>
          Evidence: vitest 1170 · unittest 485 · cargo 14 · verify-app-python ·
          canvas senior-qa-v1.0.4-mac-full-2026-11-15
        </Text>
      </Stack>
    </Stack>
  );
}

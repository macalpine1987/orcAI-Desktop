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
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

const GATE = [
  { id: "G1", name: "ek13TrainWizardGate", n: "6/6" },
  { id: "G2", name: "ek13QaPlan", n: "13/13" },
  { id: "G3", name: "ek12PipelineGate", n: "7/7" },
  { id: "G4", name: "classColors + p15 + projectsStudio", n: "28/28" },
  { id: "G5", name: "tsc --noEmit", n: "exit 0" },
];

const BLOCK_A = [
  { id: "A-01", req: "5 шагов · сценарий с нуля", v: "PASS" },
  { id: "A-02", req: "План 7 без hpsearch (default)", v: "PASS" },
  { id: "A-02b", req: "Opt-in hpsearch перед train", v: "PASS" },
  { id: "A-03", req: "Prep-only = 5, без train", v: "PASS" },
  { id: "A-04", req: "JSON + очередь jobs (код)", v: "PASS" },
  { id: "A-05", req: "Только ключи orcAI", v: "PASS" },
  { id: "A-06", req: "Предполёт / canLaunch", v: "PASS" },
  { id: "A-07", req: "Finetune → scenarioSoon", v: "PASS" },
  { id: "A-08", req: "Пресет публикации", v: "PASS" },
  { id: "A-09", req: "Живой прогон до .keras", v: "FAIL" },
];

const DEFECTS = [
  { id: "D-13-01…04", s: "—", t: "Пресет / launch / FS name / m08 test", v: "Closed" },
  { id: "D-13-05", s: "Blocker", t: "Нет живого прогона Т-8 на данных", v: "Open" },
  {
    id: "D-13-06",
    s: "Major",
    t: "Штамп 14:16 без правок 14:50+ (UC cleanup, no Refresh)",
    v: "Open",
  },
  {
    id: "D-13-07",
    s: "Minor",
    t: "Нет KPI отброшенных меток вне выбранных calls",
    v: "Open",
  },
];

const RETEST = [
  { t: "UC-21 / UC-24 убраны из product locales", v: "PASS" },
  { t: "«Обновить» снята с мастера (осталась на конвейере)", v: "PASS" },
  { t: "hpsearch Path coerce в sidecar adapter", v: "PASS" },
  { t: "disk_readiness_state → off при нехватке места", v: "PASS" },
];

function toneFor(v: string): "success" | "warning" | "danger" | "neutral" {
  if (v === "PASS" || v === "Closed") return "success";
  if (v === "FAIL" || v === "Open") return "danger";
  return "neutral";
}

export default function T8SeniorQaAudit() {
  useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · ЭК-13 · Senior QA · Т-8 · 2026-09-22
        </Text>
        <H1>Приёмка П-8 / Т-8</H1>
        <Text tone="secondary">
          Мастер обучения (m08–m12) · code gate green · живой прогон и свежий штамп —
          открыты
        </Text>
      </Stack>

      <Callout tone="danger" title="Вердикт: Fail">
        Code gate и макеты по коду готовы (9/10). Т-8 закрывать нельзя: нет живого
        прогона до .keras (D-13-05) и штамп отстаёт от tree (D-13-06).
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="9" label="Functional /10" tone="success" />
        <Stat value="9" label="Quality /10" tone="success" />
        <Stat value="54" label="Gate tests OK" tone="success" />
        <Stat value="0" label="Live Т-8" tone="danger" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Code gate</H2>
        <Table
          headers={["#", "Suite", "Result"]}
          columnAlign={["center", "left", "center"]}
          rows={GATE.map((r) => [
            r.id,
            r.name,
            <Pill key={r.id} tone="success" size="small">
              {r.n}
            </Pill>,
          ])}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Блок A · П-8 / Т-8</H2>
        <Table
          headers={["ID", "Критерий", "Вердикт"]}
          columnAlign={["center", "left", "center"]}
          rows={BLOCK_A.map((r) => [
            r.id,
            r.req,
            <Pill key={r.id} tone={toneFor(r.v)} size="small">
              {r.v}
            </Pill>,
          ])}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Ретест после 2026-09-21</H2>
        <Table
          headers={["Проверка", "Вердикт"]}
          columnAlign={["left", "center"]}
          rows={RETEST.map((r, i) => [
            r.t,
            <Pill key={i} tone="success" size="small">
              {r.v}
            </Pill>,
          ])}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Дефекты</H2>
        <Table
          headers={["ID", "Sev", "Описание", "Статус"]}
          columnAlign={["left", "center", "left", "center"]}
          rows={DEFECTS.map((r) => [
            r.id,
            r.s,
            r.t,
            <Pill key={r.id} tone={toneFor(r.v)} size="small">
              {r.v}
            </Pill>,
          ])}
        />
      </Stack>

      <Card>
        <CardHeader>Следующий шаг</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text>
              1. Пересобрать `.app` из текущего tree + AUTONOMY GATE (закрыть D-13-06).
            </Text>
            <Text>
              2. Пройти блок D протокола: prep-only → полный прогон epochs=1..2 →
              `.keras` (закрыть D-13-05).
            </Text>
            <Text>3. UI sign-off m08–m12 на свежем штампе → обновить протокол на Pass.</Text>
          </Stack>
        </CardBody>
      </Card>

      <Text size="small" tone="secondary">
        Источник: docs/cursor-handoff/T-8-protocol.md · EK-13-T8-report.md · gate run
        2026-09-22 14:55
      </Text>
    </Stack>
  );
}

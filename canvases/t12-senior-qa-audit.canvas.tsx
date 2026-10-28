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

const P12 = [
  { id: "1", req: "Очередь: прогресс, начало, длительность", v: "PASS" },
  { id: "2", req: "Действия: отменить / убрать / retry / открыть", v: "PASS" },
  { id: "3", req: "Консоль 4 вкладки + badge ошибок", v: "PASS" },
  { id: "4", req: "Экспорт журнала", v: "PASS" },
  { id: "5", req: "Свёрнутая консоль: задача + %", v: "PASS" },
  { id: "6", req: "История между запусками (sidecar)", v: "PASS" },
];

const T12 = [
  {
    id: "1",
    req: "Cancel без «готовых» артефактов",
    v: "INHERITED",
    ev: "ЭК-0 П-14; sidecar suite blocked (no orcai)",
  },
  {
    id: "2",
    req: "Retry не трогает очередь",
    v: "PASS",
    ev: "audit jobs_retry + UI retryJob",
  },
  {
    id: "3",
    req: "4 вкладки; Command copy",
    v: "PASS",
    ev: "command_line + copyText",
  },
  { id: "4", req: "История после restart", v: "PASS", ev: "SQLite sidecar" },
  {
    id: "5",
    req: "Collapsed progress / expanded log",
    v: "PASS",
    ev: "useJobLogTail /log?since=",
  },
];

const FINDINGS = [
  { s: "Major", t: "Sidecar P-14 не перезапущен (env)" },
  { s: "Minor", t: "3× useJobsList polling в LabDock" },
  { s: "Minor", t: "Open = copy path, не Finder" },
  { s: "Minor", t: "Нет component tests LabDock/JobsPage" },
];

export default function T12SeniorQaAudit() {
  useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · ЭК-3 · Senior QA · Т-12
        </Text>
        <H1>Приёмка П-12 / Т-12</H1>
        <Text tone="secondary">
          UI extended 26/26 PASS · sidecar cancel/retry — blocked in host venv
        </Text>
      </Stack>

      <Callout tone="warning" title="Вердикт: Conditional Accept">
        Функционал 9/10 · качество 8/10. UI-scope закрыт; финальный 10/10 после
        sidecar P-14 в bundled Python.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="9" label="Functional /10" tone="warning" />
        <Stat value="8" label="Quality /10" tone="warning" />
        <Stat value="26" label="UI tests OK" tone="success" />
        <Stat value="—" label="Sidecar reg." tone="neutral" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>П-12</H2>
        <Table
          headers={["#", "Требование", "Вердикт"]}
          columnAlign={["center", "left", "center"]}
          rows={P12.map((r) => [
            r.id,
            r.req,
            <Pill key={r.id} tone="success" size="small">
              {r.v}
            </Pill>,
          ])}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Т-12</H2>
        <Table
          headers={["#", "Сценарий", "Вердикт", "Evidence"]}
          columnAlign={["center", "left", "center", "left"]}
          rows={T12.map((r) => [
            r.id,
            r.req,
            <Pill
              key={r.id}
              tone={r.v === "PASS" ? "success" : "warning"}
              size="small"
            >
              {r.v}
            </Pill>,
            r.ev ?? "—",
          ])}
        />
      </Stack>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Cancel + export (зафиксировано)</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                Cancel: JobsPage → cancelJob → sidecar cleanup (ЭК-0)
              </Text>
              <Text size="small">
                Export: blob orcai-job-*.log, verbatim jobLogText
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Findings</CardHeader>
          <CardBody>
            <Stack gap={6}>
              {FINDINGS.map((f) => (
                <Text key={f.t} size="small">
                  [{f.s}] {f.t}
                </Text>
              ))}
            </Stack>
          </CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}

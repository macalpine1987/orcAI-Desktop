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

const CRITERIA = [
  { id: "1", title: "12 handlers + engine defaults", verdict: "PASS" },
  { id: "2", title: "Queue / cancel / retry / priority / =1", verdict: "PASS" },
  { id: "3", title: "Stream log + progress; reconnect", verdict: "PASS" },
  { id: "4", title: "Exact command_line", verdict: "PASS" },
  { id: "5", title: "exit_code + engine error text", verdict: "PASS" },
  { id: "6", title: "Cancel cleanup / incomplete", verdict: "PASS" },
  { id: "7", title: "Absolute created_files only", verdict: "PASS" },
];

export default function P14SeniorQaAudit() {
  const { tokens: t } = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · ЭК-0 · Senior QA
        </Text>
        <H1>П-14 — соответствие 10/10 · 10/10</H1>
        <Text tone="secondary">
          После fix: cancel test без -o помечает model_dir incomplete.
        </Text>
      </Stack>

      <Callout tone="success" title="Вердикт: Accept">
        Функционал 10/10 · качество 10/10. Все семь критериев PASS. Minor по
        NFR-6 закрыт. ЭК-0 можно закрывать → ЭК-1 / П-19.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="10" label="Functional /10" tone="success" />
        <Stat value="10" label="Quality /10" tone="success" />
        <Stat value="7/7" label="Criteria PASS" tone="success" />
        <Stat value="68" label="Unit tests OK" tone="success" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Критерии П-14</H2>
        <Table
          headers={["#", "Требование", "Вердикт"]}
          columnAlign={["center", "left", "center"]}
          rows={CRITERIA.map((c) => [
            c.id,
            c.title,
            <Pill key={c.id} tone="success" size="small">
              {c.verdict}
            </Pill>,
          ])}
        />
      </Stack>

      <Card>
        <CardHeader>Закрытый Minor</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text size="small">
              _cleanup_test: с output_dir → marker там; без -o → marker в
              model_dir (.orcai-desktop-incomplete-test).
            </Text>
            <Text size="small">
              Тесты: test_test_without_output_dir_marks_model_dir,
              test_cancel_test_without_output_marks_model_dir.
            </Text>
            <Text size="small">Прогон: unit 68/68 · T-14 PASS.</Text>
          </Stack>
        </CardBody>
      </Card>

      <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
        <Pill tone="success" size="small">
          Accept · ЭК-0 закрыт
        </Pill>
        <Text size="small" tone="secondary">
          → ЭК-1 / П-19
        </Text>
      </Row>

      <Text size="small" style={{ color: t.text.tertiary }}>
        Re-audit 2026-08-31 · docs/cursor-handoff/EK-0-T14-report.md
      </Text>
    </Stack>
  );
}

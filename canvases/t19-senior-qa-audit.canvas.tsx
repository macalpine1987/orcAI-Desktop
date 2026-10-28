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
  {
    id: "1",
    title: "ruff 0 error; noqa с комментарием",
    verdict: "PASS",
    evidence: "All checks passed; 23× BLE001 — why",
  },
  {
    id: "2",
    title: "Bundled orcAI не изменён",
    verdict: "PASS",
    evidence: "orcai==3.0.2 site-packages; нет в sidecar/src",
  },
  {
    id: "3",
    title: "predict defaults / артефакты",
    verdict: "PASS",
    evidence: "pass-through; CLI без -th/-c; *_predicted.txt",
  },
  {
    id: "4",
    title: "UI-стресс ≥30 мин",
    verdict: "EXCLUDED",
    evidence: "Исключён заказчиком из scope Т-19",
  },
  {
    id: "5",
    title: "Cancel / NFR-6",
    verdict: "PASS",
    evidence: "15 cancel unit + Т-14.2 train/tvt",
  },
];

export default function T19SeniorQaAudit() {
  const { tokens: t } = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · ЭК-1 · Senior QA · Т-19
        </Text>
        <H1>Приёмка Т-19 (без UI-стресса)</H1>
        <Text tone="secondary">
          Scope: пункты 1, 2, 3, 5 промпта Т-19 + регрессия П-14. Пункт 4 исключён.
        </Text>
      </Stack>

      <Callout tone="success" title="Вердикт: Accept">
        Функционал 10/10 · качество 10/10. Автоматическая Т-19 в согласованном
        scope закрыта. ЭК-1 можно считать принятым → ЭК-2 / П-15.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="10" label="Functional /10" tone="success" />
        <Stat value="10" label="Quality /10" tone="success" />
        <Stat value="4/4" label="In-scope PASS" tone="success" />
        <Stat value="68" label="Unit OK" tone="success" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Критерии Т-19</H2>
        <Table
          headers={["#", "Требование", "Вердикт", "Evidence"]}
          columnAlign={["center", "left", "center", "left"]}
          rows={CRITERIA.map((c) => [
            c.id,
            c.title,
            <Pill
              key={c.id}
              tone={c.verdict === "PASS" ? "success" : "neutral"}
              size="small"
            >
              {c.verdict}
            </Pill>,
            c.evidence,
          ])}
        />
      </Stack>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Качество (NFR-19)</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">ruff включён; lint не отключён глобально</Text>
              <Text size="small">noqa только точечно с причиной</Text>
              <Text size="small">Отчёт было/стало: runner, jobs, cancel_cleanup</Text>
              <Text size="small">orcAI не рефакторили</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Стабильность (NFR-20 in-scope)</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">Cancel cleanup + order terminate→wait→sweep</Text>
              <Text size="small">Т-14 integration PASS (регрессия контракта)</Text>
              <Text size="small">Listeners/intervals: cleanup в useEffect (аудит)</Text>
              <Text size="small">UI 30 мин: вне scope</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
        <Pill tone="success" size="small">
          Accept · ЭК-1 закрыт
        </Pill>
        <Text size="small" tone="secondary">
          → ЭК-2 / П-15
        </Text>
      </Row>

      <Text size="small" style={{ color: t.text.tertiary }}>
        docs/cursor-handoff/EK-1-T19-report.md · повторный прогон 2026-08-31
      </Text>
    </Stack>
  );
}

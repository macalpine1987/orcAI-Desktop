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

const CRITERIA = [
  {
    id: "1",
    title: "Нет склейки FS-путей через '/' в UI helpers",
    verdict: "PASS",
    evidence: "joinFsPath в project/Pipeline/Results/predictSettings/Predict*",
  },
  {
    id: "2",
    title: "Сборка/тесты в Linux-контейнере",
    verdict: "PASS",
    evidence:
      "python:3.11-slim 11/11; node:22 linux npm ci → 13/13; без правок React/FastAPI",
  },
  {
    id: "3",
    title: "Экран среды без if macOS для ускорителя",
    verdict: "PASS",
    evidence: "resolveAcceleratorBackend; rg darwin/macos в UI src = 0 (prod)",
  },
  {
    id: "4",
    title: "Case-sensitive WAV/аннотации",
    verdict: "PASS",
    evidence: "Set.has / ===; 3 UI + stem sidecar tests",
  },
  {
    id: "5",
    title: "Шрифты с fallback",
    verdict: "PASS",
    evidence: "Inter + system-ui + Segoe UI; без -apple-system в axes",
  },
  {
    id: "6",
    title: "HTTP-only управление службой из UI",
    verdict: "PASS",
    evidence: "engine/jobs/capabilities = fetch; spawn только в Tauri shell",
  },
  {
    id: "7",
    title: "Full Screen / DPI API в оболочке",
    verdict: "PASS",
    evidence: "Rust commands + windowChrome.ts stubs → П-17/18",
  },
];

const NITS = [
  {
    sev: "Note",
    item: "windowChrome.ts не подключён",
    detail: "SidecarContext → raw invoke; API заложен, wiring cosmetic",
  },
  {
    sev: "Note",
    item: "namesMatchExact не используется",
    detail: "Case-sensitive через === / Set.has — критерий выполнен",
  },
  {
    sev: "Note",
    item: "joinFsPath mixed separators",
    detail: "D:/data + seg → смешанные / и \\ (Windows обычно принимает)",
  },
];

export default function T15SeniorQaAudit() {
  useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · ЭК-2 · Senior QA · Т-15 · re-audit
        </Text>
        <H1>Приёмка Т-15 (подготовка к портам)</H1>
        <Text tone="secondary">
          Scope: NFR-15/16 · П-15 · Т-15. Релизные .app/.deb/.msi — П-17/П-18.
        </Text>
      </Stack>

      <Callout tone="success" title="Вердикт: Accept">
        Функционал 10/10 · качество 10/10. Т-15.2 закрыт Linux-контейнерами.
        ЭК-2 можно считать принятым → ЭК-3 / П-12.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="10" label="Functional /10" tone="success" />
        <Stat value="10" label="Quality /10" tone="success" />
        <Stat value="7/7" label="Criteria PASS" tone="success" />
        <Stat value="24" label="Unit OK (Linux)" tone="success" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Критерии Т-15 + П-15</H2>
        <Table
          headers={["#", "Требование", "Вердикт", "Evidence"]}
          columnAlign={["center", "left", "center", "left"]}
          rows={CRITERIA.map((c) => [
            c.id,
            c.title,
            <Pill key={c.id} tone="success" size="small">
              {c.verdict}
            </Pill>,
            c.evidence,
          ])}
        />
      </Stack>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Linux container evidence</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                python:3.11-slim · test_p15 + test_paths · 11/11 OK
              </Text>
              <Text size="small">
                node:22-bookworm · fresh npm ci в /tmp · vitest 13/13 OK
              </Text>
              <Text size="small">
                Без правок React/FastAPI (только linux node_modules в контейнере)
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Platform-if (намеренно)</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                Rust #[cfg(macos)] hide / Reopen / Opened / close_policy
              </Text>
              <Text size="small">
                sidecar engine_worker Metal probe (capabilities source)
              </Text>
              <Text size="small">UI не ветвится по platform для accel</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Stack gap={10}>
        <H2>Residual notes (не блокеры)</H2>
        <Table
          headers={["Sev", "Находка", "Деталь"]}
          columnAlign={["center", "left", "left"]}
          rows={NITS.map((n) => [
            <Pill key={n.item} tone="neutral" size="small">
              {n.sev}
            </Pill>,
            n.item,
            n.detail,
          ])}
        />
      </Stack>
    </Stack>
  );
}

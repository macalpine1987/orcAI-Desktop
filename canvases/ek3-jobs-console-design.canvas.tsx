import {
  Button,
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
  Text,
  useHostTheme,
  mergeStyle,
} from "cursor/canvas";

/**
 * ЭК-3 / П-12 — документация структуры «Задачи + консоль».
 * **Эталон pixel-match:** docs/cursor-handoff/mockups/m16|m26|m27 PNG + m16-layer-spec.md
 * Этот canvas — упрощённая схема на cursor/canvas (Stack, Row, Card, useHostTheme), не экспорт макета.
 */

function ProgressBar({
  pct,
  tone,
}: {
  pct: number;
  tone: "sky" | "emerald" | "red" | "muted";
}) {
  const theme = useHostTheme();
  const fill =
    tone === "sky"
      ? theme.status.info
      : tone === "emerald"
        ? theme.status.success
        : tone === "red"
          ? theme.status.error
          : theme.text.tertiary;
  return (
    <Row gap={6} align="center" style={{ minWidth: 88 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: theme.surface.secondary,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: fill,
            borderRadius: 999,
          }}
        />
      </div>
      <Text size="xs" tone="secondary" style={{ width: 28, textAlign: "right" }}>
        {pct}%
      </Text>
    </Row>
  );
}

function FilterPill({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  const theme = useHostTheme();
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        background: active ? theme.text.primary : "transparent",
        color: active ? theme.surface.primary : theme.text.secondary,
        border: active ? "none" : `1px solid ${theme.stroke.secondary}`,
      }}
    >
      {label}
    </span>
  );
}

function DockTab({
  label,
  active,
  badge,
}: {
  label: string;
  active?: boolean;
  badge?: number;
}) {
  const theme = useHostTheme();
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        background: active ? theme.surface.secondary : "transparent",
        color: active ? theme.text.primary : theme.text.secondary,
        border: active ? `1px solid ${theme.stroke.secondary}` : "1px solid transparent",
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          style={{
            marginLeft: 6,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 999,
            background: theme.status.error,
            color: theme.text.inverse,
            fontSize: 9,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

function M16JobsPage() {
  const theme = useHostTheme();
  const rows = [
    {
      cmd: "predict",
      target: "07 Fjord Echo.wav",
      status: "ВЫПОЛНЯЕТСЯ",
      statusTone: "info" as const,
      pct: 62,
      bar: "sky" as const,
      start: "20:31:38",
      dur: "00:04:12",
      action: "Отменить",
    },
    {
      cmd: "predict",
      target: "03 Whale Dance.wav",
      status: "ОШИБКА",
      statusTone: "error" as const,
      pct: 18,
      bar: "red" as const,
      start: "20:31:38",
      dur: "00:00:06",
      action: "Повторить",
    },
    {
      cmd: "filter-predictions",
      target: "07 Fjord Echo.wav",
      status: "ГОТОВО",
      statusTone: "success" as const,
      pct: 100,
      bar: "emerald" as const,
      start: "20:28:01",
      dur: "00:00:41",
      action: "Открыть",
    },
  ];

  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <H3>Задачи</H3>
        <Text size="sm" tone="secondary">
          Очередь и история запусков orcAI с полным журналом каждой задачи.
        </Text>
      </Stack>
      <Row gap={8} wrap align="center">
        <FilterPill label="Все" active />
        <FilterPill label="Активные" />
        <FilterPill label="Ошибки" />
        <FilterPill label="История" />
        <Text size="xs" tone="secondary">
          3 задачи с ошибками
        </Text>
      </Row>
      <div
        style={{
          border: `1px solid ${theme.stroke.secondary}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr 0.8fr 1fr 0.7fr 0.7fr 0.6fr",
            gap: 8,
            padding: "8px 12px",
            background: theme.surface.secondary,
            fontSize: 10,
            fontWeight: 600,
            color: theme.text.secondary,
          }}
        >
          <span>Команда</span>
          <span>Объект</span>
          <span>Статус</span>
          <span>Прогресс</span>
          <span>Начало</span>
          <span>Длит.</span>
          <span />
        </div>
        {rows.map((r) => (
          <div
            key={r.target}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.2fr 0.8fr 1fr 0.7fr 0.7fr 0.6fr",
              gap: 8,
              padding: "10px 12px",
              borderTop: `1px solid ${theme.stroke.secondary}`,
              fontSize: 11,
              alignItems: "center",
            }}
          >
            <Text size="xs" weight="medium">
              {r.cmd}
            </Text>
            <Text size="xs" tone="secondary">
              {r.target}
            </Text>
            <Text
              size="xs"
              weight="medium"
              style={{
                color:
                  r.statusTone === "info"
                    ? theme.status.info
                    : r.statusTone === "error"
                      ? theme.status.error
                      : theme.status.success,
                letterSpacing: "0.04em",
              }}
            >
              {r.status}
            </Text>
            <ProgressBar pct={r.pct} tone={r.bar} />
            <Text size="xs" tone="secondary">
              {r.start}
            </Text>
            <Text size="xs" tone="secondary">
              {r.dur}
            </Text>
            <Text size="xs" tone="secondary" style={{ textDecoration: "underline" }}>
              {r.action}
            </Text>
          </div>
        ))}
      </div>
      <LabDockLogSplit subtitle="predict · выполняется · 62%" />
    </Stack>
  );
}

function LabDockLogSplit({ subtitle }: { subtitle?: string }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Row
        justify="space-between"
        align="center"
        style={{
          padding: "6px 10px",
          borderBottom: `1px solid ${theme.stroke.secondary}`,
          background: theme.surface.primary,
        }}
      >
        <Row gap={4} align="center">
          <DockTab label="Лог" active />
          <DockTab label="Инспектор" />
          <DockTab label="Ошибки" badge={3} />
          <DockTab label="Команда" />
          {subtitle && (
            <Text size="xs" tone="secondary" style={{ marginLeft: 8 }}>
              {subtitle}
            </Text>
          )}
        </Row>
        <Row gap={8}>
          <Text size="xs" tone="secondary">
            Копировать
          </Text>
          <Text size="xs" tone="secondary">
            Экспорт лога
          </Text>
        </Row>
      </Row>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 4px 280px", minHeight: 140 }}>
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontSize: 10,
            lineHeight: 1.5,
            fontFamily: "ui-monospace, monospace",
            color: theme.text.secondary,
            background: theme.surface.secondary,
            overflow: "auto",
          }}
        >
          {`Running orcAI: predict
Loading model orcai-isl-v1
Predicting calls on 412 snippets…`}
        </pre>
        <div style={{ background: theme.stroke.secondary }} />
        <Stack gap={6} style={{ padding: 12, background: theme.surface.secondary }}>
          <Text size="xs" weight="medium">
            Инспектор
          </Text>
          <Text size="xs" tone="secondary">
            predict · 07 Fjord Echo.wav
          </Text>
          <Text
            size="xs"
            tone="secondary"
            style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}
          >
            {`{
  "recording_path": "…/07 Fjord Echo.wav",
  "threshold": 0.5,
  "model": "orcai-isl-v1"
}`}
          </Text>
        </Stack>
      </div>
    </div>
  );
}

function M26ErrorsTab() {
  const theme = useHostTheme();
  return (
    <Stack gap={10}>
      <Row gap={8} wrap align="center">
        <FilterPill label="Ошибки" active />
        <Text size="xs" tone="secondary">
          3 задачи с ошибками
        </Text>
      </Row>
      <div
        style={{
          border: `1px solid ${theme.stroke.secondary}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Row
          justify="space-between"
          style={{
            padding: "6px 10px",
            borderBottom: `1px solid ${theme.stroke.secondary}`,
          }}
        >
          <Row gap={4}>
            <DockTab label="Лог" />
            <DockTab label="Инспектор" />
            <DockTab label="Ошибки" active badge={3} />
            <DockTab label="Команда" />
          </Row>
          <Text size="xs" tone="secondary">
            predict · ошибка
          </Text>
        </Row>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: 12,
            background: theme.surface.secondary,
            minHeight: 160,
          }}
        >
          <Stack gap={8}>
            <Text size="xs" weight="medium" tone="secondary" style={{ letterSpacing: "0.08em" }}>
              ОШИБКИ ЗАДАЧ
            </Text>
            <Stack gap={6}>
              {[
                "FileNotFoundError: channel 2",
                "ResamplingWarning: 44.1 → 48 kHz",
              ].map((msg, i) => (
                <Row key={msg} gap={8} align="start">
                  <span
                    style={{
                      marginTop: 4,
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: theme.status.error,
                      flexShrink: 0,
                    }}
                  />
                  <Stack gap={2}>
                    <Text size="xs" tone="secondary">
                      20:31:{38 + i}
                    </Text>
                    <Text size="xs">predict · 03 Whale Dance.wav</Text>
                    <Text size="xs" style={{ color: theme.status.error }}>
                      {msg}
                    </Text>
                  </Stack>
                </Row>
              ))}
            </Stack>
          </Stack>
          <Stack gap={8} style={{ borderLeft: `1px solid ${theme.stroke.secondary}`, paddingLeft: 12 }}>
            <Text size="xs" weight="medium" tone="secondary" style={{ letterSpacing: "0.08em" }}>
              ПЕРЕХОД
            </Text>
            <Text size="sm">predict · 03 Whale Dance.wav</Text>
            <Text size="xs" style={{ color: theme.status.error }}>
              predict — ошибка на этапе загрузки WAV
            </Text>
            <Row gap={8} style={{ marginTop: "auto" }}>
              <Button size="sm" variant="secondary">
                К задаче
              </Button>
              <Button size="sm" variant="secondary">
                Повторить
              </Button>
            </Row>
          </Stack>
        </div>
      </div>
    </Stack>
  );
}

function M27CommandTab() {
  const theme = useHostTheme();
  const cmd =
    "orcai predict recording_table.csv -m orcai-isl-v1 -th 0.5 -ch 1 -cdl limits.json -ow -v 2";
  return (
    <div
      style={{
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Row
        justify="space-between"
        style={{
          padding: "6px 10px",
          borderBottom: `1px solid ${theme.stroke.secondary}`,
        }}
      >
        <Row gap={4} align="center">
          <DockTab label="Лог" />
          <DockTab label="Инспектор" />
          <DockTab label="Ошибки" badge={1} />
          <DockTab label="Команда" active />
          <Text size="xs" tone="secondary" style={{ marginLeft: 8 }}>
            predict выполняется
          </Text>
        </Row>
      </Row>
      <Stack gap={10} style={{ padding: 12, background: theme.surface.secondary, minHeight: 160 }}>
        <Text size="xs" weight="medium" tone="secondary" style={{ letterSpacing: "0.08em" }}>
          ТОЧНАЯ КОМАНДА orcAI
        </Text>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${theme.stroke.secondary}`,
            background: theme.surface.primary,
            fontSize: 10,
            lineHeight: 1.5,
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {cmd}
        </pre>
        <Row justify="space-between" align="end" gap={12}>
          <Text size="xs" tone="secondary" style={{ maxWidth: 280, lineHeight: 1.5 }}>
            Скопируйте и запустите в терминале для отладки вне приложения.
          </Text>
          <Button size="sm">Копировать</Button>
        </Row>
      </Stack>
    </div>
  );
}

export default function Ek3JobsConsoleDesignCanvas() {
  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>ЭК-3 · Задачи и консоль</H1>
        <Text tone="secondary">
          Реализованный дизайн по макетам m16 / m26 / m27. Эталонные PNG:{" "}
          <Text weight="medium">docs/cursor-handoff/mockups/</Text>
        </Text>
        <Row gap={8} wrap>
          <Pill tone="neutral">JobsPage · m16</Pill>
          <Pill tone="neutral">LabDock · Ошибки · m26</Pill>
          <Pill tone="neutral">LabDock · Команда · m27</Pill>
          <Pill tone="success">Accept 10/10</Pill>
        </Row>
      </Stack>

      <Divider />

      <Grid columns={1} gap={24}>
        <Card variant="outline">
          <CardHeader title="m16 · Страница «Задачи»" subtitle="Фильтры-pill, таблица очереди, split-консоль Лог + Инспектор" />
          <CardBody>
            <M16JobsPage />
          </CardBody>
        </Card>

        <Card variant="outline">
          <CardHeader title="m26 · Вкладка «Ошибки»" subtitle="Двухколоночный layout: список + переход / повторить" />
          <CardBody>
            <M26ErrorsTab />
          </CardBody>
        </Card>

        <Card variant="outline">
          <CardHeader title="m27 · Вкладка «Команда»" subtitle="Точная строка orcAI + копирование в терминал" />
          <CardBody>
            <M27CommandTab />
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="info">
        Свёрнутая консоль (status strip): «predict · Выполняется · 62%» + chevron — см. LabDock в приложении.
      </Callout>
    </Stack>
  );
}

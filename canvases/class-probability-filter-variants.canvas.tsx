import {
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";
import type { Color } from "cursor/canvas";

/**
 * Probability floor filter for Predict Results · Classes rail.
 * Interactive: pick a variant, drag the threshold, reset to 0.
 */

type VariantId = "A" | "B" | "C" | "D";

const VARIANTS: {
  id: VariantId;
  title: string;
  blurb: string;
}[] = [
  {
    id: "A",
    title: "A · Пара к прозрачности меток",
    blurb:
      "Тот же прибор: подпись над дорожкой, LCD %, круговой сброс. На нуле LCD пишет «все», не 0%.",
  },
  {
    id: "B",
    title: "B · Хвост справа",
    blurb:
      "Подсветка только зоны «оставить»: от порога до 100. Сразу читается «режем слабые, берём сильные».",
  },
  {
    id: "C",
    title: "C · Как заголовок Классы",
    blurb:
      "Секция «Вероятность»: значение и сброс в строке заголовка, дорожка на всю ширину рейки. Экономит место.",
  },
  {
    id: "D",
    title: "D · Чип порога",
    blurb:
      "Живой чип «≥ 90». Сброс появляется только когда порог не ноль — меньше хрома в покое.",
  },
];

const CLASSES: { code: string; color: Color; probs: number[] }[] = [
  { code: "WHISTLE", color: "cyan", probs: [98, 94, 91, 72, 41] },
  { code: "CALL", color: "orange", probs: [96, 88, 61, 33] },
  { code: "CLICK", color: "green", probs: [99, 77, 54] },
  { code: "OTHER", color: "gray", probs: [22, 18] },
];

function visibleCount(probs: number[], floor: number): number {
  return probs.filter((p) => p > floor).length;
}

function ResetGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3.2 3.4A4.2 4.2 0 1 1 2.6 7.2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M3.2 1.6v2.4H5.6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThresholdSlider({
  variant,
  value,
  onChange,
}: {
  variant: VariantId;
  value: number;
  onChange: (next: number) => void;
}) {
  const theme = useHostTheme();
  const atZero = value === 0;
  const label = atZero ? "все" : `≥ ${value}`;
  const pct = `${value}%`;

  const resetBtn = (compact = false) => (
    <button
      type="button"
      title="Сбросить порог — показать все вероятности"
      disabled={atZero}
      onClick={() => onChange(0)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? 20 : 22,
        height: compact ? 20 : 22,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 999,
        background: atZero ? theme.fill.tertiary : theme.fill.secondary,
        color: atZero ? theme.text.quaternary : theme.text.secondary,
        cursor: atZero ? "default" : "pointer",
        opacity: atZero && variant === "D" ? 0 : 1,
        pointerEvents: atZero && variant === "D" ? "none" : "auto",
      }}
    >
      <ResetGlyph color={atZero ? theme.text.quaternary : theme.text.secondary} />
    </button>
  );

  const track = (
    <div style={{ position: "relative", height: 18, flex: 1, minWidth: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 7,
          height: 4,
          borderRadius: 999,
          background: theme.fill.tertiary,
          overflow: "hidden",
        }}
      >
        {variant === "B" ? (
          <div
            style={{
              position: "absolute",
              left: `${value}%`,
              right: 0,
              top: 0,
              bottom: 0,
              background: theme.accent.primary,
            }}
          />
        ) : (
          <div
            style={{
              width: `${value}%`,
              height: "100%",
              background: atZero ? theme.stroke.tertiary : theme.accent.primary,
            }}
          />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: 3,
          left: `clamp(0px, calc(${value}% - 6px), calc(100% - 12px))`,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: theme.text.primary,
          border: `1px solid ${theme.stroke.primary}`,
          pointerEvents: "none",
        }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Порог вероятности"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          margin: 0,
          opacity: 0,
          cursor: "pointer",
        }}
      />
    </div>
  );

  if (variant === "C") {
    return (
      <Stack gap={6}>
        <Row align="center" justify="space-between">
          <Text
            size="small"
            weight="semibold"
            tone="tertiary"
            style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}
          >
            Вероятность
          </Text>
          <Row gap={6} align="center">
            <Text
              size="small"
              weight="semibold"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontVariantNumeric: "tabular-nums",
                minWidth: 36,
                textAlign: "right",
              }}
            >
              {label}
            </Text>
            {resetBtn(true)}
          </Row>
        </Row>
        {track}
        <Row justify="space-between">
          <Text size="small" tone="tertiary">
            0
          </Text>
          <Text size="small" tone="tertiary">
            50
          </Text>
          <Text size="small" tone="tertiary">
            100
          </Text>
        </Row>
      </Stack>
    );
  }

  if (variant === "D") {
    return (
      <Stack gap={6}>
        <Row align="center" gap={8}>
          <Pill
            tone={atZero ? "neutral" : "info"}
            size="sm"
            active={!atZero}
            style={{ fontFamily: "ui-monospace, monospace", minWidth: 52, justifyContent: "center" }}
          >
            {atZero ? "все" : `≥ ${value}`}
          </Pill>
          {track}
          {resetBtn(true)}
        </Row>
      </Stack>
    );
  }

  // A + B: instrument frame like mark-opacity
  return (
    <Stack gap={4}>
      <Text
        size="small"
        tone="tertiary"
        style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 9 }}
      >
        {variant === "B" ? "Порог" : "Вероятность"}
      </Text>
      <Row
        align="center"
        gap={6}
        style={{
          padding: "4px 6px 4px 8px",
          border: `1px solid ${theme.stroke.secondary}`,
          background: theme.fill.tertiary,
        }}
      >
        {track}
        <Text
          size="small"
          weight="semibold"
          style={{
            fontFamily: "ui-monospace, monospace",
            fontVariantNumeric: "tabular-nums",
            minWidth: variant === "B" ? 40 : 32,
            textAlign: "right",
          }}
        >
          {variant === "B" ? label : atZero ? "все" : pct}
        </Text>
        {resetBtn()}
      </Row>
    </Stack>
  );
}

function ClassRail({
  variant,
  floor,
  onFloor,
}: {
  variant: VariantId;
  floor: number;
  onFloor: (n: number) => void;
}) {
  const theme = useHostTheme();
  const total = CLASSES.reduce((n, c) => n + visibleCount(c.probs, floor), 0);
  const all = CLASSES.reduce((n, c) => n + c.probs.length, 0);

  return (
    <div
      style={{
        border: `1px solid ${theme.stroke.secondary}`,
        background: theme.bg.elevated,
        padding: "11px 12px 12px",
        minWidth: 196,
        maxWidth: 220,
      }}
    >
      <Row align="center" justify="space-between" style={{ marginBottom: 10 }}>
        <Text
          size="small"
          weight="semibold"
          tone="tertiary"
          style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}
        >
          Классы
        </Text>
        <Text
          size="small"
          tone="tertiary"
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          {total}
          {floor > 0 ? ` / ${all}` : ""}
        </Text>
      </Row>

      <Stack gap={6} style={{ marginBottom: 12 }}>
        {CLASSES.map((row) => {
          const shown = visibleCount(row.probs, floor);
          const empty = shown === 0;
          return (
            <Row key={row.code} gap={8} align="center">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: theme.category[row.color],
                  opacity: empty ? 0.35 : 1,
                  flexShrink: 0,
                }}
              />
              <Text
                size="small"
                weight="semibold"
                style={{
                  flex: 1,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.02em",
                  opacity: empty ? 0.42 : 1,
                }}
              >
                {row.code}
              </Text>
              <Text
                size="small"
                tone="tertiary"
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}
              >
                {shown}
              </Text>
            </Row>
          );
        })}
      </Stack>

      <div
        style={{
          borderTop: `1px solid ${theme.stroke.tertiary}`,
          paddingTop: 10,
          marginBottom: 12,
        }}
      >
        <ThresholdSlider variant={variant} value={floor} onChange={onFloor} />
      </div>

      <div style={{ borderTop: `1px solid ${theme.stroke.tertiary}`, paddingTop: 10 }}>
        <Text
          size="small"
          weight="semibold"
          tone="tertiary"
          style={{
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontSize: 10,
            marginBottom: 8,
          }}
        >
          Отображение
        </Text>
        <Stack gap={6}>
          <Row align="center" justify="space-between">
            <Text size="small" tone="secondary">
              Подписи
            </Text>
            <div
              style={{
                width: 28,
                height: 16,
                borderRadius: 999,
                background: theme.text.primary,
                border: `1px solid ${theme.stroke.primary}`,
              }}
            />
          </Row>
          <Row align="center" justify="space-between">
            <Text size="small" tone="secondary">
              Аннотации
            </Text>
            <div
              style={{
                width: 28,
                height: 16,
                borderRadius: 999,
                background: theme.fill.tertiary,
                border: `1px solid ${theme.stroke.secondary}`,
              }}
            />
          </Row>
        </Stack>
      </div>
    </div>
  );
}

function SpectrogramHint({ floor }: { floor: number }) {
  const theme = useHostTheme();
  const marks = [
    { x: 8, w: 18, p: 98, color: "cyan" as Color },
    { x: 32, w: 14, p: 72, color: "cyan" as Color },
    { x: 52, w: 22, p: 91, color: "orange" as Color },
    { x: 78, w: 12, p: 41, color: "green" as Color },
    { x: 94, w: 16, p: 54, color: "green" as Color },
  ];

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${theme.stroke.secondary}`,
        background: theme.bg.editor,
        padding: 10,
      }}
    >
      <Text size="small" tone="tertiary" style={{ marginBottom: 8 }}>
        Спектрограмма · метки {floor === 0 ? "все" : `строго выше ${floor}%`}
      </Text>
      <div
        style={{
          position: "relative",
          height: 120,
          background: theme.fill.quaternary,
          overflow: "hidden",
        }}
      >
        {marks.map((m) => {
          const on = m.p > floor;
          return (
            <div
              key={`${m.x}-${m.p}`}
              style={{
                position: "absolute",
                left: `${m.x}%`,
                width: `${m.w}%`,
                top: 36,
                height: 28,
                background: theme.category[m.color],
                opacity: on ? 0.85 : 0.08,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -16,
                  left: 0,
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  color: on ? theme.text.primary : theme.text.quaternary,
                }}
              >
                {m.p}
              </span>
            </div>
          );
        })}
      </div>
      <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>
        Источник макета: вкладка Результаты · рейка Классы. Правило: floor = 0 → все; иначе mean_p
        строго больше порога (90 оставляет 91…100).
      </Text>
    </div>
  );
}

export default function ClassProbabilityFilterVariants() {
  const theme = useHostTheme();
  const [selected, setSelected] = useCanvasState<VariantId>("prob-filter-variant", "C");
  const [floor, setFloor] = useCanvasState("prob-filter-floor", 0);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 860 }}>
      <Stack gap={6}>
        <H1>Фильтр вероятности в блоке Классы</H1>
        <Text tone="secondary">
          Порог 0…100 и сброс на ноль. Ноль — все детекции; 90 — только выше 90. Ползунок
          прозрачности меток остаётся на transport; этот фильтр — в рейке, сразу после списка
          классов.
        </Text>
      </Stack>

      <Stack gap={8}>
        <Row align="center" gap={8}>
          <H2>Превью · вариант {selected}</H2>
          <Pill size="sm" tone={floor === 0 ? "neutral" : "info"} active={floor > 0}>
            {floor === 0 ? "порог 0 · все" : `порог ${floor}`}
          </Pill>
        </Row>
        <Grid columns="220px 1fr" gap={12} align="stretch">
          <ClassRail variant={selected} floor={floor} onFloor={setFloor} />
          <SpectrogramHint floor={floor} />
        </Grid>
        <Text size="small" tone="tertiary">
          {VARIANTS.find((v) => v.id === selected)?.blurb}
        </Text>
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2>Варианты</H2>
        <Stack gap={8}>
          {VARIANTS.map((v) => {
            const on = v.id === selected;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelected(v.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: `1px solid ${on ? theme.stroke.primary : theme.stroke.secondary}`,
                  background: on ? theme.fill.tertiary : theme.bg.elevated,
                  cursor: "pointer",
                  color: theme.text.primary,
                }}
              >
                <Row gap={8} align="center" style={{ marginBottom: 4 }}>
                  <Text weight="semibold">{v.title}</Text>
                  {on ? (
                    <Text size="small" tone="secondary">
                      выбран
                    </Text>
                  ) : null}
                </Row>
                <Text size="small" tone="secondary">
                  {v.blurb}
                </Text>
              </button>
            );
          })}
        </Stack>
      </Stack>

      <Text size="small" tone="tertiary">
        Рекомендация: C — рейка узкая (~11.5rem), заголовок уже такой же, как у «Классы». A —
        если важнее один язык с ползунком прозрачности на transport. B — самый ясный смысл
        «отрезать слабое». D — самый тихий в покое.
      </Text>
    </Stack>
  );
}

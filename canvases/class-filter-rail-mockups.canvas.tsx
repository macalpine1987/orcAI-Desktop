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
  type Color,
} from "cursor/canvas";

/**
 * Predict · Analysis — right rail «Классы» design variants.
 * Open beside chat; click a card to select; click a class row to mute/unmute.
 */

type VariantId = "A" | "B" | "C";

const VARIANTS: {
  id: VariantId;
  title: string;
  blurb: string;
}[] = [
  {
    id: "A",
    title: "A · Рейка с долей",
    blurb:
      "Ближе к текущему: чекбокс остаётся, под кодом — тонкая доля от максимума класса.",
  },
  {
    id: "B",
    title: "B · LED + Mute",
    blurb:
      "Как канал в микшере: цветная лампочка, кнопка M глушит слой на спектрограмме.",
  },
  {
    id: "C",
    title: "C · Чипы",
    blurb:
      "Плотнее на узкой рейке: цветная кромка, счётчик в ячейке, «Все» / «Сброс» в шапке.",
  },
];

type ClassRow = {
  code: string;
  color: Color;
  count: number;
};

const CLASSES: ClassRow[] = [
  { code: "SS", color: "blue", count: 54 },
  { code: "CC", color: "orange", count: 31 },
  { code: "WH", color: "pink", count: 22 },
  { code: "BZ", color: "green", count: 14 },
  { code: "HERDING", color: "purple", count: 0 },
];

const MAX_COUNT = Math.max(...CLASSES.map((c) => c.count), 1);

function CheckMark({ color }: { color: string }) {
  return (
    <svg width={8} height={8} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.2 5 8.7 9.5 3.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RailShell({
  children,
  selected,
  onSelect,
  title,
  blurb,
  id,
}: {
  children: Parameters<typeof Stack>[0]["children"];
  selected: boolean;
  onSelect: () => void;
  title: string;
  blurb: string;
  id: VariantId;
}) {
  const theme = useHostTheme();
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        textAlign: "left",
        padding: 12,
        borderRadius: theme.radius.lg,
        border: `1px solid ${selected ? theme.accent.primary : theme.stroke.secondary}`,
        background: theme.bg.elevated,
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      <Row gap={8} align="center">
        <Pill tone={selected ? "accent" : "neutral"} size="sm">
          {id}
        </Pill>
        <Text weight="medium">{title}</Text>
      </Row>
      <Text tone="secondary" size="small">
        {blurb}
      </Text>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
        style={{
          background: theme.fill.tertiary,
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: theme.radius.md,
          padding: "10px 11px 12px",
          minHeight: 320,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </button>
  );
}

function RailHead({ total, filtered }: { total: number; filtered: number }) {
  const theme = useHostTheme();
  return (
    <Row align="baseline" justify="space-between">
      <Text
        size="small"
        weight="medium"
        style={{
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: theme.text.tertiary,
          fontSize: 10,
        }}
      >
        Классы
      </Text>
      <Text
        size="small"
        style={{
          fontFamily: theme.typography.fontFamilyMono,
          color: theme.text.tertiary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {filtered} / {total}
      </Text>
    </Row>
  );
}

function Switch({ on }: { on: boolean }) {
  const theme = useHostTheme();
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: 28,
        height: 16,
        borderRadius: 999,
        border: `1px solid ${on ? theme.text.secondary : theme.stroke.tertiary}`,
        background: on ? theme.text.secondary : theme.fill.quaternary,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: on ? 12 : 1,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: on ? theme.text.primary : theme.fill.secondary,
        }}
      />
    </span>
  );
}

function FloorFooter() {
  const theme = useHostTheme();
  return (
    <Stack gap={8} style={{ marginTop: "auto" }}>
      <Stack
        gap={6}
        style={{ paddingTop: 10, borderTop: `1px solid ${theme.stroke.tertiary}` }}
      >
        <Row align="baseline" justify="space-between">
          <Text
            size="small"
            weight="medium"
            style={{
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: theme.text.tertiary,
              fontSize: 10,
            }}
          >
            Вероятность
          </Text>
          <Text
            size="small"
            style={{
              fontFamily: theme.typography.fontFamilyMono,
              color: theme.accent.primary,
            }}
          >
            &gt; 42
          </Text>
        </Row>
        <div
          style={{
            position: "relative",
            height: 6,
            borderRadius: 3,
            background: theme.fill.quaternary,
            border: `1px solid ${theme.stroke.tertiary}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "42%",
              borderRadius: 2,
              background: theme.fill.secondary,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "42%",
              top: "50%",
              width: 10,
              height: 10,
              margin: "-5px 0 0 -5px",
              borderRadius: "50%",
              background: theme.text.primary,
            }}
          />
        </div>
        <Row justify="space-between">
          {["0", "50", "100"].map((t) => (
            <Text
              key={t}
              size="small"
              style={{
                fontSize: 9,
                fontFamily: theme.typography.fontFamilyMono,
                color: theme.text.quaternary,
              }}
            >
              {t}
            </Text>
          ))}
        </Row>
      </Stack>

      <Stack
        gap={6}
        style={{ paddingTop: 10, borderTop: `1px solid ${theme.stroke.tertiary}` }}
      >
        <Text
          size="small"
          weight="medium"
          style={{
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: theme.text.tertiary,
            fontSize: 10,
          }}
        >
          Отображение
        </Text>
        <Row align="center" justify="space-between">
          <Text size="small" style={{ fontSize: 11, color: theme.text.secondary }}>
            Подписи
          </Text>
          <Switch on />
        </Row>
        <Row align="center" justify="space-between">
          <Text size="small" style={{ fontSize: 11, color: theme.text.secondary }}>
            Метки
          </Text>
          <Switch on />
        </Row>
      </Stack>
    </Stack>
  );
}

function colorHex(theme: ReturnType<typeof useHostTheme>, c: Color): string {
  return theme.category[c] ?? theme.accent.primary;
}

function VariantA({
  muted,
  onToggle,
}: {
  muted: Record<string, boolean>;
  onToggle: (code: string) => void;
}) {
  const theme = useHostTheme();
  const visibleTotal = CLASSES.reduce(
    (s, c) => s + (muted[c.code] || c.count === 0 ? 0 : c.count),
    0,
  );
  const allTotal = CLASSES.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <RailHead total={allTotal} filtered={visibleTotal} />
      <Stack gap={4}>
        {CLASSES.map((row) => {
          const empty = row.count === 0;
          const off = muted[row.code] || empty;
          const hex = colorHex(theme, row.color);
          return (
            <button
              key={row.code}
              type="button"
              disabled={empty}
              onClick={() => onToggle(row.code)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                padding: "4px 6px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                cursor: empty ? "default" : "pointer",
                opacity: empty ? 0.45 : 1,
                textAlign: "left",
              }}
            >
              <Row gap={7} align="center">
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    border: `1px solid ${off ? theme.stroke.primary : theme.text.primary}`,
                    background: off ? theme.fill.quaternary : theme.text.primary,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {!off ? <CheckMark color={theme.bg.elevated} /> : null}
                </span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: hex,
                    flexShrink: 0,
                  }}
                />
                <Text
                  size="small"
                  weight="medium"
                  style={{
                    flex: 1,
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: 10,
                    color: off ? theme.text.quaternary : theme.text.primary,
                  }}
                >
                  {row.code}
                </Text>
                <Text
                  size="small"
                  style={{
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: 10,
                    color: off ? theme.text.quaternary : theme.text.secondary,
                  }}
                >
                  {row.count}
                </Text>
              </Row>
              <div
                style={{
                  marginLeft: 19,
                  height: 2,
                  borderRadius: 1,
                  background: theme.fill.quaternary,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((row.count / MAX_COUNT) * 100)}%`,
                    height: "100%",
                    background: hex,
                    opacity: off ? 0.35 : 0.85,
                  }}
                />
              </div>
            </button>
          );
        })}
      </Stack>
      <FloorFooter />
    </>
  );
}

function VariantB({
  muted,
  onToggle,
}: {
  muted: Record<string, boolean>;
  onToggle: (code: string) => void;
}) {
  const theme = useHostTheme();
  const visibleTotal = CLASSES.reduce(
    (s, c) => s + (muted[c.code] || c.count === 0 ? 0 : c.count),
    0,
  );
  const allTotal = CLASSES.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <RailHead total={allTotal} filtered={visibleTotal} />
      <Row gap={6}>
        <Pill tone="accent" size="sm">
          Все
        </Pill>
        <Pill tone="neutral" size="sm">
          Только с детекциями
        </Pill>
      </Row>
      <Stack gap={0}>
        {CLASSES.map((row, i) => {
          const empty = row.count === 0;
          const off = muted[row.code] || empty;
          const hex = colorHex(theme, row.color);
          return (
            <div
              key={row.code}
              style={{
                display: "grid",
                gridTemplateColumns: "10px minmax(0, 1fr) auto auto",
                gap: 8,
                alignItems: "center",
                padding: "6px 4px",
                borderBottom:
                  i < CLASSES.length - 1
                    ? `1px solid ${theme.stroke.tertiary}`
                    : "none",
                opacity: empty ? 0.45 : 1,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: off ? theme.fill.quaternary : hex,
                  border: off
                    ? `1px solid ${theme.stroke.primary}`
                    : `1px solid ${hex}`,
                }}
              />
              <Text
                size="small"
                weight="medium"
                style={{
                  fontFamily: theme.typography.fontFamilyMono,
                  fontSize: 10,
                  color: off ? theme.text.quaternary : theme.text.primary,
                }}
              >
                {row.code}
              </Text>
              <Text
                size="small"
                style={{
                  fontFamily: theme.typography.fontFamilyMono,
                  fontSize: 10,
                  color: off ? theme.text.quaternary : theme.text.secondary,
                }}
              >
                {row.count}
              </Text>
              <button
                type="button"
                disabled={empty}
                onClick={() => onToggle(row.code)}
                style={{
                  width: 22,
                  height: 18,
                  borderRadius: 4,
                  border: `1px solid ${muted[row.code] ? theme.stroke.primary : theme.stroke.secondary}`,
                  background: muted[row.code]
                    ? theme.fill.secondary
                    : theme.fill.quaternary,
                  color: muted[row.code]
                    ? theme.text.primary
                    : theme.text.tertiary,
                  fontSize: 9,
                  fontWeight: 650,
                  letterSpacing: "0.04em",
                  cursor: empty ? "default" : "pointer",
                  padding: 0,
                }}
              >
                M
              </button>
            </div>
          );
        })}
      </Stack>
      <FloorFooter />
    </>
  );
}

function VariantC({
  muted,
  onToggle,
  onShowAll,
  onReset,
}: {
  muted: Record<string, boolean>;
  onToggle: (code: string) => void;
  onShowAll: () => void;
  onReset: () => void;
}) {
  const theme = useHostTheme();

  return (
    <>
      <Row align="baseline" justify="space-between">
        <Text
          size="small"
          weight="medium"
          style={{
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: theme.text.tertiary,
            fontSize: 10,
          }}
        >
          Классы
        </Text>
        <Row gap={8}>
          <button
            type="button"
            onClick={onShowAll}
            style={{
              border: "none",
              background: "transparent",
              color: theme.text.tertiary,
              fontSize: 10,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Все
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{
              border: "none",
              background: "transparent",
              color: theme.text.tertiary,
              fontSize: 10,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Сброс
          </button>
        </Row>
      </Row>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CLASSES.map((row) => {
          const empty = row.count === 0;
          const on = !muted[row.code] && !empty;
          const hex = colorHex(theme, row.color);
          return (
            <button
              key={row.code}
              type="button"
              disabled={empty}
              onClick={() => onToggle(row.code)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 8px 5px 6px",
                borderRadius: 8,
                border: empty
                  ? `1px dashed ${theme.stroke.secondary}`
                  : `1px solid ${on ? hex : theme.stroke.secondary}`,
                background: on ? theme.fill.secondary : theme.fill.quaternary,
                opacity: empty ? 0.4 : 1,
                cursor: empty ? "default" : "pointer",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 14,
                  borderRadius: 2,
                  background: hex,
                  opacity: on ? 1 : 0.45,
                }}
              />
              <Text
                size="small"
                weight="medium"
                style={{
                  fontFamily: theme.typography.fontFamilyMono,
                  fontSize: 10,
                  color: on ? theme.text.primary : theme.text.quaternary,
                }}
              >
                {row.code}
              </Text>
              <span
                style={{
                  minWidth: "1.4rem",
                  textAlign: "right",
                  fontSize: 10,
                  fontFamily: theme.typography.fontFamilyMono,
                  padding: "1px 4px",
                  borderRadius: 4,
                  background: theme.fill.tertiary,
                  color: on ? theme.text.primary : theme.text.secondary,
                }}
              >
                {row.count}
              </span>
            </button>
          );
        })}
      </div>
      <FloorFooter />
    </>
  );
}

export default function ClassFilterRailMockups() {
  const theme = useHostTheme();
  const [selected, setSelected] = useCanvasState<VariantId>(
    "class-filter-rail.selected",
    "A",
  );
  const [muted, setMuted] = useCanvasState<Record<string, boolean>>(
    "class-filter-rail.muted",
    { WH: true },
  );

  const toggle = (code: string) => {
    setMuted((prev) => ({ ...prev, [code]: !prev[code] }));
  };
  const showAll = () => {
    const next: Record<string, boolean> = {};
    for (const c of CLASSES) next[c.code] = false;
    setMuted(next);
  };
  const reset = () => {
    const next: Record<string, boolean> = {};
    for (const c of CLASSES) next[c.code] = c.count > 0;
    setMuted(next);
  };

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>Рейка «Классы» · Анализ</H1>
        <Text tone="secondary">
          Три макета правой панели фильтра по классам (A · доля, B · LED+Mute,
          C · чипы). Выберите карточку; внутри рейки клик по классу включает /
          глушит слой (HERDING с нулём недоступен).
        </Text>
      </Stack>

      <Row gap={8} align="center">
        <Text tone="secondary" size="small">
          Выбрано:
        </Text>
        <Pill tone="accent">{VARIANTS.find((v) => v.id === selected)?.title}</Pill>
      </Row>

      <Grid columns={3} gap={14}>
        {VARIANTS.map((v) => (
          <RailShell
            key={v.id}
            id={v.id}
            title={v.title}
            blurb={v.blurb}
            selected={selected === v.id}
            onSelect={() => setSelected(v.id)}
          >
            <Stack gap={10} style={{ flex: 1, minHeight: 0 }}>
              {v.id === "A" ? (
                <VariantA muted={muted} onToggle={toggle} />
              ) : v.id === "B" ? (
                <VariantB muted={muted} onToggle={toggle} />
              ) : (
                <VariantC
                  muted={muted}
                  onToggle={toggle}
                  onShowAll={showAll}
                  onReset={reset}
                />
              )}
            </Stack>
          </RailShell>
        ))}
      </Grid>

      <Divider />

      <Stack gap={8}>
        <H2>Сравнение</H2>
        <Grid columns={3} gap={12}>
          <Stack gap={4}>
            <Text weight="medium">A</Text>
            <Text tone="secondary" size="small">
              Минимальный риск, сразу читаемее текущего. Рекомендуется как первый
              шаг.
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text weight="medium">B</Text>
            <Text tone="secondary" size="small">
              Сильнее «студия», но M рядом с чекбоксами Анализа может путать.
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text weight="medium">C</Text>
            <Text tone="secondary" size="small">
              Лучше на узкой рейке и длинных кодах вроде HERDING.
            </Text>
          </Stack>
        </Grid>
      </Stack>

      <Text tone="tertiary" size="small">
        Вероятность и блок «Отображение» во всех вариантах остаются снизу.
        Цвета классов иллюстративные; в приложении — из карты меток проекта.
        Тема canvas: {theme.kind}.
      </Text>
    </Stack>
  );
}

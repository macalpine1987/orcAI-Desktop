import {
  Divider,
  H1,
  H2,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

/**
 * Lab dock expand/collapse control — design variants for orcAI Desktop.
 * Toggle expands/collapses to preview; click a variant card to select it.
 */

type VariantId = "A" | "B" | "C" | "D";

const VARIANTS: {
  id: VariantId;
  title: string;
  blurb: string;
}[] = [
  {
    id: "A",
    title: "A · Capsule + label",
    blurb: "Центральная капсула: подпись «Лог · Инспектор» и шеврон. Ясный affordance, Instrument-хром.",
  },
  {
    id: "B",
    title: "B · Drawer handle",
    blurb: "Узкая рукоять как у выдвижной панели: три линии + шеврон. Минимум текста, крупная зона клика.",
  },
  {
    id: "C",
    title: "C · Status strip",
    blurb: "Полоса на всю ширину: слева статус задачи, справа квадратная кнопка. Контекст без tooltip.",
  },
  {
    id: "D",
    title: "D · Twin glyphs",
    blurb: "Иконки терминала и JSON рядом с шевроном. Сразу читается «лог + инспектор».",
  },
];

function Chevron({ up, color, size = 14 }: { up: boolean; color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: up ? "rotate(0deg)" : "rotate(180deg)",
        transition: "transform 0.25s ease",
      }}
    >
      <path d="M5 7.5 9 11.5 13 7.5" />
    </svg>
  );
}

function GripLines({ color }: { color: string }) {
  return (
    <svg width={18} height={10} viewBox="0 0 18 10" fill="none" aria-hidden>
      {[2, 5, 8].map((y) => (
        <line
          key={y}
          x1="3"
          y1={y}
          x2="15"
          y2={y}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function TwinGlyphs({ color }: { color: string }) {
  return (
    <svg width={28} height={14} viewBox="0 0 28 14" fill="none" aria-hidden>
      <rect x="1" y="1.5" width="11" height="11" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M3.5 5h6M3.5 7.5h4.5M3.5 10h5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M17 3.5h8M17 10.5h8M19.5 3.5v7M22.5 3.5v7"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DockPreview({
  variant,
  expanded,
  onToggle,
}: {
  variant: VariantId;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = useHostTheme();
  const ink = theme.text.primary;
  const muted = theme.text.secondary;
  const tertiary = theme.text.tertiary;
  const border = theme.stroke.secondary;
  const face = theme.surface.primary;
  const recess = theme.surface.secondary;

  const label = expanded ? "Свернуть панель лога и инспектора" : "Развернуть панель лога и инспектора";

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: face,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: expanded ? 72 : 0,
          overflow: "hidden",
          transition: "height 0.28s ease",
          background: recess,
          borderBottom: expanded ? `1px solid ${border}` : "none",
          display: "flex",
        }}
      >
        <div
          style={{
            flex: 1,
            margin: 8,
            marginRight: 0,
            border: `1px solid ${border}`,
            background: face,
            padding: "6px 10px",
            fontSize: 11,
            color: muted,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Лог выполнения задачи
          <div style={{ marginTop: 4, color: tertiary, fontSize: 10 }}>predict · running…</div>
        </div>
        <div
          style={{
            width: 120,
            margin: 8,
            marginLeft: 6,
            border: `1px solid ${border}`,
            background: face,
            padding: "6px 10px",
            fontSize: 11,
            color: muted,
          }}
        >
          Инспектор
          <div style={{ marginTop: 4, color: tertiary, fontSize: 10 }}>{"{ }"}</div>
        </div>
      </div>

      {variant === "A" ? (
        <button
          type="button"
          title={label}
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px",
            border: "none",
            borderTop: `1px solid ${border}`,
            background: face,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              border: `1px solid ${border}`,
              background: recess,
              color: ink,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ color: muted, fontWeight: 500 }}>Лог · Инспектор</span>
            <Chevron up={expanded} color={ink} />
          </span>
        </button>
      ) : null}

      {variant === "B" ? (
        <button
          type="button"
          title={label}
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 12px",
            border: "none",
            borderTop: `1px solid ${border}`,
            background: face,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: 56,
              padding: "4px 16px 6px",
              border: `1px solid ${border}`,
              background: recess,
              color: muted,
            }}
          >
            <GripLines color={tertiary} />
            <Chevron up={expanded} color={ink} size={12} />
          </span>
        </button>
      ) : null}

      {variant === "C" ? (
        <button
          type="button"
          title={label}
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "7px 12px",
            border: "none",
            borderTop: `1px solid ${border}`,
            background: face,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: tertiary,
                marginBottom: 2,
              }}
            >
              Консоль
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: ink }}>
              {expanded ? "Лог и инспектор открыты" : "Лог и инспектор скрыты"}
            </span>
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              flexShrink: 0,
              border: `1px solid ${border}`,
              background: recess,
              color: ink,
            }}
          >
            <Chevron up={expanded} color={ink} size={13} />
          </span>
        </button>
      ) : null}

      {variant === "D" ? (
        <button
          type="button"
          title={label}
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px",
            border: "none",
            borderTop: `1px solid ${border}`,
            background: face,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 12px",
              border: `1px solid ${border}`,
              background: recess,
              color: ink,
            }}
          >
            <TwinGlyphs color={muted} />
            <span
              style={{
                width: 1,
                alignSelf: "stretch",
                background: border,
                margin: "2px 0",
              }}
            />
            <Chevron up={expanded} color={ink} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

export default function LabDockToggleVariants() {
  const theme = useHostTheme();
  const [selected, setSelected] = useCanvasState<VariantId>("dock-toggle-variant", "A");
  const [expanded, setExpanded] = useCanvasState("dock-toggle-expanded", true);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 720 }}>
      <Stack gap={6}>
        <H1>Кнопка разворота лога и инспектора</H1>
        <Text tone="secondary">
          Нижняя панель Lab Dock · варианты кнопки свернуть/развернуть. Клик по карточке —
          выбор варианта; клик по кнопке в превью — свернуть или развернуть панель.
        </Text>
      </Stack>

      <Stack gap={8}>
        <H2>Превью · вариант {selected}</H2>
        <DockPreview
          variant={selected}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
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
                  background: on ? theme.surface.secondary : theme.surface.primary,
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
        Рекомендация: A — баланс читаемости и Instrument/DAW. B — если нужен максимально
        тихий chrome. C — если важен статус без наведения. D — если подпись на двух языках
        мешает.
      </Text>
    </Stack>
  );
}

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

/** Lab Dock toggle redesign — interactive preview (v0.1.4+). */

type VariantId = "now" | "1" | "2" | "3" | "4" | "5";

const VARIANTS: { id: VariantId; title: string; blurb: string }[] = [
  {
    id: "now",
    title: "Сейчас (handle)",
    blurb: "v0.1.4: рукоять grip + шеврон.",
  },
  {
    id: "1",
    title: "1 · Capsule label",
    blurb: "Капсула «Лог · Инспектор» + шеврон.",
  },
  {
    id: "2",
    title: "2 · Notch tab",
    blurb: "Язычок по центру нижней кромки (DAW).",
  },
  {
    id: "3",
    title: "3 · Thin chevron",
    blurb: "Узкая полоса только с шевроном.",
  },
  {
    id: "4",
    title: "4 · Dual icons",
    blurb: "Иконки лога + JSON + шеврон.",
  },
  {
    id: "5",
    title: "5 · Status strip",
    blurb: "Статус слева, шеврон справа.",
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
        transition: "transform 0.22s ease",
        flexShrink: 0,
      }}
    >
      <path d="M5 7.5 9 11.5 13 7.5" />
    </svg>
  );
}

function Grip({ color }: { color: string }) {
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

function DualIcons({ color }: { color: string }) {
  return (
    <svg width={28} height={14} viewBox="0 0 28 14" fill="none" aria-hidden>
      <rect x="1" y="1.5" width="11" height="11" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path
        d="M3.5 5h6M3.5 7.5h4.5M3.5 10h5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
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

  return (
    <div style={{ border: `1px solid ${border}`, background: face, overflow: "hidden" }}>
      <div
        style={{
          height: expanded ? 88 : 0,
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
            padding: "8px 10px",
          }}
        >
          <Text size="small" weight="semibold">
            Лог выполнения задачи
          </Text>
          <Text size="small" tone="tertiary">
            predict · running…
          </Text>
        </div>
        <div
          style={{
            width: 132,
            margin: 8,
            marginLeft: 6,
            border: `1px solid ${border}`,
            background: face,
            padding: "8px 10px",
          }}
        >
          <Text size="small" weight="semibold">
            Инспектор
          </Text>
          <Text size="small" tone="tertiary">
            {"{ params }"}
          </Text>
        </div>
      </div>

      {variant === "now" ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
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
              minWidth: 64,
              padding: "5px 18px 7px",
              border: `1px solid ${border}`,
              background: recess,
            }}
          >
            <Grip color={tertiary} />
            <Chevron up={expanded} color={ink} size={12} />
          </span>
        </button>
      ) : null}

      {variant === "1" ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
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
            }}
          >
            <Text size="small" tone="secondary">
              Лог · Инспектор
            </Text>
            <Chevron up={expanded} color={ink} />
          </span>
        </button>
      ) : null}

      {variant === "2" ? (
        <div
          style={{
            position: "relative",
            borderTop: `1px solid ${border}`,
            background: face,
            height: 18,
          }}
        >
          <button
            type="button"
            onClick={onToggle}
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translate(-50%, -40%)",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "4px 20px 6px",
              border: `1px solid ${border}`,
              background: recess,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 28, height: 3, background: tertiary }} />
            <Chevron up={expanded} color={ink} size={11} />
          </button>
        </div>
      ) : null}

      {variant === "3" ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            padding: "4px 12px",
            border: "none",
            borderTop: `1px solid ${border}`,
            background: face,
            cursor: "pointer",
          }}
        >
          <Chevron up={expanded} color={ink} size={13} />
        </button>
      ) : null}

      {variant === "4" ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
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
            }}
          >
            <DualIcons color={muted} />
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

      {variant === "5" ? (
        <button
          type="button"
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
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text
              size="small"
              tone="tertiary"
              style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Консоль
            </Text>
            <Text size="small" weight="medium">
              {expanded ? "Лог и инспектор открыты" : "Лог и инспектор скрыты"}
            </Text>
          </Stack>
          <span
            style={{
              display: "inline-flex",
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${border}`,
              background: recess,
              flexShrink: 0,
            }}
          >
            <Chevron up={expanded} color={ink} size={13} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

export default function LabDockToggleRedesign() {
  const [selected, setSelected] = useCanvasState<VariantId>("dock-redesign-v2", "1");
  const [expanded, setExpanded] = useCanvasState("dock-redesign-v2-exp", true);
  const active = VARIANTS.find((v) => v.id === selected)!;

  return (
    <Stack gap={20} style={{ padding: 20 }}>
      <Stack gap={6}>
        <H1>Кнопка разворота лога и инспектора</H1>
        <Text tone="secondary">
          Выберите вариант ниже. В превью нажмите кнопку — свернуть/развернуть панель.
        </Text>
      </Stack>

      <Card>
        <CardHeader
          title={`Превью · ${active.title}`}
          trailing={<Pill active={expanded}>{expanded ? "открыто" : "свёрнуто"}</Pill>}
        />
        <CardBody>
          <Stack gap={12}>
            <DockPreview
              variant={selected}
              expanded={expanded}
              onToggle={() => setExpanded(!expanded)}
            />
            <Text size="small" tone="secondary">
              {active.blurb}
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Divider />

      <H2>Варианты</H2>
      <Grid columns={2} gap={10}>
        {VARIANTS.map((v) => {
          const on = v.id === selected;
          return (
            <Card key={v.id} variant={on ? "filled" : "default"}>
              <CardHeader
                title={v.title}
                trailing={on ? <Pill tone="info">выбран</Pill> : undefined}
              />
              <CardBody>
                <Stack gap={10}>
                  <Text size="small" tone="secondary">
                    {v.blurb}
                  </Text>
                  <Button
                    variant={on ? "primary" : "secondary"}
                    onClick={() => setSelected(v.id)}
                  >
                    {on ? "В превью" : "Выбрать"}
                  </Button>
                </Stack>
              </CardBody>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

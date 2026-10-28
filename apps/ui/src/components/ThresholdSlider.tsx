import type { CSSProperties } from "react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
const MIN = 0;
const MAX = 1;
const STEP = 0.05;

const SCALE_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

const TICK_LABEL_KEYS: Record<(typeof SCALE_TICKS)[number], string> = {
  0: "predict.thresholdTick0",
  0.25: "predict.thresholdTickLow",
  0.5: "predict.thresholdTickMid",
  0.75: "predict.thresholdTickHigh",
  1: "predict.thresholdTick1",
};

/** Horizontal inset so the value bubble stays inside the track (thumb radius + padding). */
const TRACK_INSET = "1.75rem";

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < STEP / 2;
}

function zoneHintKey(value: number): string {
  if (value < 0.35) return "predict.thresholdZoneSensitive";
  if (value > 0.65) return "predict.thresholdZoneStrict";
  return "predict.thresholdZoneBalanced";
}

function zoneShortKey(value: number): string {
  if (value < 0.35) return "predict.thresholdZoneShortSensitive";
  if (value > 0.65) return "predict.thresholdZoneShortStrict";
  return "predict.thresholdZoneShortBalanced";
}

function zoneTone(value: number): "sensitive" | "balanced" | "strict" {
  if (value < 0.35) return "sensitive";
  if (value > 0.65) return "strict";
  return "balanced";
}

const ZONE_BADGE: Record<
  ReturnType<typeof zoneTone>,
  string
> = {
  sensitive:
    "border-amber-400/40 bg-amber-500/95 text-amber-950 shadow-amber-900/25",
  balanced: "border-accent/30 bg-accent text-accent-fg shadow-accent/20",
  strict: "border-sky-400/40 bg-sky-600 text-white shadow-sky-900/25",
};

export function ThresholdSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const sliderId = useId();
  const pct = ((value - MIN) / (MAX - MIN)) * 100;
  const tone = zoneTone(value);

  const minorTicks = useMemo(
    () =>
      Array.from(
        { length: Math.round((MAX - MIN) / STEP) + 1 },
        (_, i) => MIN + i * STEP,
      ).filter(
        (tick) => !SCALE_TICKS.some((major) => approxEqual(tick, major)),
      ),
    [],
  );

  const bubbleStyle = {
    left: `clamp(${TRACK_INSET}, ${pct}%, calc(100% - ${TRACK_INSET}))`,
  } as CSSProperties;

  return (
    <div className="rounded-lg border border-border/80 bg-gradient-to-b from-muted/40 to-surface/30 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor={sliderId} className="text-sm font-medium text-foreground">
          {t("predict.threshold")}{" "}
          <span className="predict-cli-key font-mono text-[10px] font-normal text-foreground-muted">
            (-th)
          </span>
        </label>
        <span className="ml-auto text-[11px] text-foreground-muted">
          {t("predict.thresholdScaleHint")}
        </span>
      </div>

      <div className="relative px-2">
        <div
          className="pointer-events-none absolute inset-x-2 top-0 z-20 h-0"
          aria-hidden
        >
          <div
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={bubbleStyle}
          >
            <div
              className={`flex min-w-[4.75rem] flex-col items-center rounded-lg border px-2.5 py-1 shadow-md ${ZONE_BADGE[tone]}`}
            >
              <span className="font-mono text-lg font-bold leading-none tabular-nums tracking-tight">
                {value.toFixed(2)}
              </span>
              <span className="mt-0.5 text-[10px] font-medium leading-tight opacity-90">
                {t(zoneShortKey(value))}
              </span>
            </div>
            <span
              className={`-mt-px h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent ${
                tone === "sensitive"
                  ? "border-t-amber-500"
                  : tone === "strict"
                    ? "border-t-sky-600"
                    : "border-t-accent"
              }`}
            />
          </div>
        </div>

        <div className="pt-12">
          <div
            className="pointer-events-none relative h-10 rounded-md border border-border/60 bg-black/25 shadow-inner"
            aria-hidden
          >
            {minorTicks.map((tick) => (
              <span
                key={tick}
                className="absolute bottom-2 h-2 w-px -translate-x-1/2 bg-white/35"
                style={{ left: `${tick * 100}%` }}
              />
            ))}
            {SCALE_TICKS.map((tick) => {
              const near = approxEqual(tick, value);
              return (
                <span
                  key={tick}
                  className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${tick * 100}%` }}
                >
                  <span
                    className={`w-px rounded-full bg-white shadow-[0_0_1px_rgba(0,0,0,0.45)] ${
                      near
                        ? "h-7 opacity-100 ring-1 ring-white/50"
                        : tick === 0.5
                          ? "h-5 opacity-90"
                          : "h-4 opacity-75"
                    }`}
                  />
                </span>
              );
            })}
          </div>

          <input
            id={sliderId}
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="threshold-slider relative z-10 -mt-6 mb-1 block w-full"
            style={{ "--threshold-pct": `${pct}%` } as CSSProperties}
            aria-valuemin={MIN}
            aria-valuemax={MAX}
            aria-valuenow={value}
            aria-valuetext={`${value.toFixed(2)} — ${t(zoneHintKey(value))}`}
          />
        </div>

        <div
          className="mt-4 grid text-[11px] font-medium leading-snug tabular-nums text-foreground-muted"
          style={{ gridTemplateColumns: `repeat(${SCALE_TICKS.length}, 1fr)` }}
          aria-hidden
        >
          {SCALE_TICKS.map((tick) => (
            <span
              key={tick}
              className={
                tick === 0
                  ? "text-left"
                  : tick === 1
                    ? "text-right"
                    : "text-center"
              }
            >
              {t(TICK_LABEL_KEYS[tick])}
            </span>
          ))}
        </div>
      </div>

      <p
        className={`mt-3 border-t border-border/50 pt-2 text-[11px] leading-relaxed ${
          tone === "sensitive"
            ? "text-amber-800 dark:text-amber-200/90"
            : tone === "strict"
              ? "text-sky-800 dark:text-sky-200/90"
              : "text-foreground-muted"
        }`}
      >
        {t(zoneHintKey(value))}
      </p>
    </div>
  );
}

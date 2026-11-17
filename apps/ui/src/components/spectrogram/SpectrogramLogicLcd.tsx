import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  formatStudioLcdClock,
  splitPlayerClock,
} from "../../lib/spectrogramPlayer";
import { IconPause, IconPlay } from "../SpectrogramIcons";

/** Studio LCD glyph before duration: play / pause; stop clears it. */
export type LcdTransportPhase = "idle" | "playing" | "paused";

type Props = {
  studioTransport: boolean;
  playheadSec: number;
  duration: number;
  channel: number;
  lcdTransport: LcdTransportPhase;
  lcdWindowT0: number;
  lcdWindowT1: number;
};

export function SpectrogramLogicLcd({
  studioTransport,
  playheadSec,
  duration,
  channel,
  lcdTransport,
  lcdWindowT0,
  lcdWindowT1,
}: Props) {
  const { t } = useTranslation();

  /** m04: one LCD window — position / duration / channel columns. */
  if (studioTransport) {
    const panel = (
      title: string,
      value: string,
      opts?: {
        dim?: boolean;
        channel?: boolean;
        /** Only «Позиция» — play/pause overlay (does not shift the clock). */
        transport?: LcdTransportPhase;
      },
    ) => {
      const transport = opts?.transport;
      const transportLabel =
        transport === "playing"
          ? t("spectrogram.player.play")
          : transport === "paused"
            ? t("spectrogram.player.pause")
            : null;
      return (
        <div
          className={`predict-logic-lcd-panel${opts?.dim ? " is-dim" : ""}${
            opts?.channel ? " is-channel" : ""
          }`}
          aria-label={
            transportLabel ? `${title} ${transportLabel} ${value}` : `${title} ${value}`
          }
        >
          <div className="predict-logic-lcd-panel-title">{title}</div>
          <div className="predict-logic-lcd-panel-value">
            {/* Overlay on position only; clock stays centered like Duration/Channel. */}
            {transport != null ? (
              <span
                className={`predict-logic-lcd-transport${
                  transport === "playing"
                    ? " is-playing"
                    : transport === "paused"
                      ? " is-paused"
                      : " is-idle"
                }`}
                aria-hidden
              >
                {transport === "playing" ? <IconPlay size={20} /> : null}
                {transport === "paused" ? <IconPause size={20} /> : null}
              </span>
            ) : null}
            <span className="predict-logic-lcd-panel-clock">{value}</span>
          </div>
        </div>
      );
    };
    return (
      <div
        className="predict-logic-lcd predict-logic-lcd--m04"
        aria-live="polite"
        aria-label={`${t("predict.results.lcdPosition")} · ${t("predict.results.lcdDuration")} · ${t("predict.results.lcdChannel")}`}
        data-lcd-transport={lcdTransport}
      >
        {panel(t("predict.results.lcdPosition"), formatStudioLcdClock(playheadSec), {
          transport: lcdTransport,
        })}
        {panel(t("predict.results.lcdDuration"), formatStudioLcdClock(duration), {
          dim: true,
        })}
        {panel(t("predict.results.lcdChannel"), String(channel), {
          channel: true,
        })}
      </div>
    );
  }

  const pos = splitPlayerClock(playheadSec);
  const len = splitPlayerClock(duration);
  const showHours = pos.hours > 0 || len.hours > 0;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const cell = (value: string, label: string, opts?: { dim?: boolean; wide?: boolean }) => (
    <div
      className={`predict-logic-lcd-cell${opts?.wide ? " is-wide" : ""}${opts?.dim ? " is-dim" : ""}`}
    >
      <span className="predict-logic-lcd-cell-value">{value}</span>
      <span className="predict-logic-lcd-cell-label">{label}</span>
    </div>
  );
  const group = (
    title: string,
    children: ReactNode,
    opts?: { dim?: boolean; view?: boolean },
  ) => (
    <div
      className={`predict-logic-lcd-group${opts?.dim ? " is-dim" : ""}${opts?.view ? " is-view" : ""}`}
      aria-label={title}
    >
      <div className="predict-logic-lcd-group-title">{title}</div>
      <div className="predict-logic-lcd-group-cells">{children}</div>
    </div>
  );
  return (
    <div className="predict-logic-lcd" aria-live="polite">
      {group(
        t("predict.results.lcdPosition"),
        <>
          {showHours ? cell(String(pos.hours), t("predict.results.lcdHr")) : null}
          {cell(pad2(pos.minutes), t("predict.results.lcdMin"))}
          {cell(pad2(pos.seconds), t("predict.results.lcdSec"))}
          {cell(`.${pos.tenths}`, t("predict.results.lcdDs"))}
        </>,
      )}
      <div className="predict-logic-lcd-divider" aria-hidden />
      {group(
        t("predict.results.lcdDuration"),
        <>
          {showHours
            ? cell(String(len.hours), t("predict.results.lcdHr"), { dim: true })
            : null}
          {cell(pad2(len.minutes), t("predict.results.lcdMin"), { dim: true })}
          {cell(pad2(len.seconds), t("predict.results.lcdSec"), { dim: true })}
          {cell(`.${len.tenths}`, t("predict.results.lcdDs"), { dim: true })}
        </>,
        { dim: true },
      )}
      <div className="predict-logic-lcd-divider" aria-hidden />
      {group(
        t("predict.results.lcdViewLabel"),
        cell(
          `${lcdWindowT0.toFixed(0)}–${lcdWindowT1.toFixed(0)}`,
          "с",
          { dim: true, wide: true },
        ),
        { dim: true, view: true },
      )}
    </div>
  );
}

import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type Props = {
  audioElement: ReactNode;
  studioShell: ReactNode;
  logicLcd: ReactNode;
  logicRightSliders: ReactNode;
  logicZoom: ReactNode;
  transportSlot: HTMLElement;
  lcdSlot: HTMLElement | null;
  toolsSlot: HTMLElement | null;
  zoomSlot: HTMLElement | null;
  onPanelKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
};

/** Studio createPortal wiring for transport / LCD / tools / zoom slots. */
export function SpectrogramAudioStudioPortals({
  audioElement,
  studioShell,
  logicLcd,
  logicRightSliders,
  logicZoom,
  transportSlot,
  lcdSlot,
  toolsSlot,
  zoomSlot,
  onPanelKeyDown,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <div className="predict-results-transport-host" aria-hidden tabIndex={-1}>
        {audioElement}
      </div>
      {createPortal(
        <div
          role="region"
          aria-label={t("spectrogram.player.ariaLabel")}
          tabIndex={0}
          onKeyDown={onPanelKeyDown}
          className="predict-logic-transport-host outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
        >
          {studioShell}
        </div>,
        transportSlot,
      )}
      {lcdSlot
        ? createPortal(
            <div className="predict-logic-lcd-host">{logicLcd}</div>,
            lcdSlot,
          )
        : null}
      {toolsSlot ? createPortal(logicRightSliders, toolsSlot) : null}
      {zoomSlot && logicZoom && !toolsSlot
        ? createPortal(logicZoom, zoomSlot)
        : null}
    </>
  );
}

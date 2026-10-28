import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  playback: ReactNode;
  tools: ReactNode | null;
  segmentRail: ReactNode | null;
  coordinates?: ReactNode | null;
  logicPro?: boolean;
  /** Plot is rendered above the deck — playback section moves to top. */
  plotAbove?: boolean;
};

/** Unified Pro Lab panel: playback, spectrogram tools, and file segment navigator. */
export function SpectrogramLabControlDeck({
  playback,
  tools,
  segmentRail,
  coordinates,
  logicPro = false,
  plotAbove = false,
}: Props) {
  const { t } = useTranslation();

  const playbackSection = (
    <div className="analysis-lab-control-deck-section analysis-lab-control-deck-playback">
      {playback}
    </div>
  );
  const toolsSection = tools ? (
    <div className="analysis-lab-control-deck-section">{tools}</div>
  ) : null;
  const segmentSection = segmentRail ? (
    <div className="analysis-lab-control-deck-section analysis-lab-control-deck-segments">
      {segmentRail}
    </div>
  ) : null;

  return (
    <section
      className={`analysis-lab-control-deck${logicPro ? " analysis-lab-control-deck-logic" : ""}`}
      aria-label={t("spectrogram.controlDeck.ariaLabel")}
    >
      {plotAbove ? playbackSection : toolsSection}
      {plotAbove ? toolsSection : playbackSection}
      {segmentSection}
      {coordinates ? (
        <div className="analysis-lab-control-deck-section analysis-lab-control-deck-coords">
          {coordinates}
        </div>
      ) : null}
    </section>
  );
}

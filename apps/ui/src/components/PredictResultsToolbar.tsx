import type { Ref } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  /** Zoom + volume portal target. */
  toolsSlotRef: Ref<HTMLDivElement>;
  transportSlotRef: Ref<HTMLDivElement>;
  lcdSlotRef: Ref<HTMLDivElement>;
};

/**
 * Tools panel: [transport + opacity] · [LCD] · [zoom + volume].
 */
export function PredictResultsToolbar({
  toolsSlotRef,
  transportSlotRef,
  lcdSlotRef,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="predict-results-tools-panel predict-results-toolbar predict-results-toolbar-logic"
      role="toolbar"
      aria-label={t("predict.results.toolbarAria")}
      data-spectrogram-chrome=""
    >
      <div ref={transportSlotRef} className="predict-logic-transport-slot" />
      <div ref={lcdSlotRef} className="predict-results-toolbar-lcd-slot" />
      <div className="predict-results-toolbar-right">
        <div
          ref={toolsSlotRef}
          className="predict-results-toolbar-tools-slot"
        />
      </div>
    </div>
  );
}

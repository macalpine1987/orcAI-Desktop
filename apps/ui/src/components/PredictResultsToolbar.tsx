import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

type Props = {
  /** Zoom + volume portal target. */
  toolsSlotRef: Ref<HTMLDivElement>;
  transportSlotRef: Ref<HTMLDivElement>;
  lcdSlotRef: Ref<HTMLDivElement>;
  /** Host for ``PredictResultsClassesToolsPanel`` when classes mode is on. */
  classesToolsSlotRef?: Ref<HTMLDivElement>;
  /** Transport chrome replaced by the classes tools panel. */
  classesMode?: boolean;
};

/**
 * Tools panel: [transport + opacity] · [LCD] · [zoom + volume]
 * — or the Classes filter strip when ``classesMode``.
 *
 * Transport slots stay direct grid children (same as v1.0.3) so player scale
 * is not broken by a ``display: contents`` wrapper.
 */
export function PredictResultsToolbar({
  toolsSlotRef,
  transportSlotRef,
  lcdSlotRef,
  classesToolsSlotRef,
  classesMode = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "predict-results-tools-panel predict-results-toolbar predict-results-toolbar-logic",
        classesMode && "is-classes-mode",
      )}
      role="toolbar"
      aria-label={
        classesMode
          ? t("predict.results.classesToolsAria")
          : t("predict.results.toolbarAria")
      }
      data-spectrogram-chrome=""
    >
      <div
        ref={transportSlotRef}
        className={clsx(
          "predict-logic-transport-slot",
          classesMode && "is-hidden-for-classes",
        )}
        aria-hidden={classesMode || undefined}
      />
      <div
        ref={lcdSlotRef}
        className={clsx(
          "predict-results-toolbar-lcd-slot",
          classesMode && "is-hidden-for-classes",
        )}
        aria-hidden={classesMode || undefined}
      />
      <div
        className={clsx(
          "predict-results-toolbar-right",
          classesMode && "is-hidden-for-classes",
        )}
        aria-hidden={classesMode || undefined}
      >
        <div
          ref={toolsSlotRef}
          className="predict-results-toolbar-tools-slot"
        />
      </div>
      <div
        ref={classesToolsSlotRef}
        className={clsx(
          "predict-results-classes-tools-host",
          !classesMode && "is-hidden",
        )}
        aria-hidden={!classesMode || undefined}
      />
    </div>
  );
}

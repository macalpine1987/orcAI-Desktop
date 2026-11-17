import { useTranslation } from "react-i18next";
import type { ListScope } from "./detectionTableTypes";

type Props = {
  studioLayout: boolean;
  effectiveScope: ListScope;
  visibleCount: number;
  fileTotal: number;
};

export function DetectionsTableFooter({
  studioLayout,
  effectiveScope,
  visibleCount,
  fileTotal,
}: Props) {
  const { t } = useTranslation();
  return (
<footer className="analysis-detections-footer">
        {studioLayout ? (
          <span className="analysis-detections-footer-primary">
            {t("spectrogram.detections.footerFileShown", {
              count: visibleCount,
            })}
          </span>
        ) : (
          <>
            <span className="analysis-detections-footer-primary">
              {effectiveScope === "segment"
                ? t("spectrogram.detections.footerSegmentShown", {
                    count: visibleCount,
                  })
                : t("spectrogram.detections.footerFileShown", {
                    count: visibleCount,
                  })}
            </span>
            {effectiveScope === "segment" ? (
              <span className="analysis-detections-footer-secondary">
                {t("spectrogram.detections.footerFileTotal", {
                  count: fileTotal,
                })}
              </span>
            ) : null}
          </>
        )}
      </footer>
  );
}

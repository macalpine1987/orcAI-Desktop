import { useTranslation } from "react-i18next";
import { formatDurationSec, formatSampleRateHz } from "../lib/formatAudio";

type Props = {
  fileName: string;
  sampleRateHz: number | null | undefined;
  channel?: number;
  durationSec?: number;
};

/**
 * m04 file meta strip inside the spectrogram frame:
 * filename · sample rate · channel · duration.
 */
export function SpectrogramSpecHeaderBar({
  fileName,
  sampleRateHz,
  channel,
  durationSec,
}: Props) {
  const { t } = useTranslation();
  const rateLabel = formatSampleRateHz(sampleRateHz);
  const parts = [fileName, rateLabel];
  if (channel != null && channel > 0) {
    parts.push(t("spectrogram.specHeader.channel", { channel }));
  }
  if (durationSec != null && durationSec > 0) {
    parts.push(formatDurationSec(durationSec));
  }
  const title = parts.join(" · ");

  return (
    <div
      className="analysis-spectrogram-spec-header"
      role="group"
      aria-label={t("spectrogram.specHeader.aria")}
    >
      <div className="analysis-spectrogram-spec-file" title={title}>
        <span className="analysis-spectrogram-spec-file-name">{fileName}</span>
        <span className="analysis-spectrogram-spec-file-rate">
          {" "}
          · {rateLabel}
        </span>
        {channel != null && channel > 0 ? (
          <span className="analysis-spectrogram-spec-file-meta">
            {" "}
            · {t("spectrogram.specHeader.channel", { channel })}
          </span>
        ) : null}
        {durationSec != null && durationSec > 0 ? (
          <span className="analysis-spectrogram-spec-file-meta">
            {" "}
            · {formatDurationSec(durationSec)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

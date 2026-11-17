import { SpectrogramViewerChrome } from "./spectrogram/SpectrogramViewerChrome";
import {
  type SpectrogramViewerProps,
} from "./spectrogram/spectrogramViewerTypes";
import { useSpectrogramViewerModel } from "./spectrogram/useSpectrogramViewerModel";

export type { SpectrogramViewerProps } from "./spectrogram/spectrogramViewerTypes";

export function SpectrogramViewer(props: SpectrogramViewerProps) {
  const chrome = useSpectrogramViewerModel(props);
  return <SpectrogramViewerChrome {...chrome} />;
}

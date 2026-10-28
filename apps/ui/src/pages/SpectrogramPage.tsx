import { Navigate, useLocation } from "react-router-dom";
import type { PredictTabId } from "../components/PredictTabs";
import type { SpectrogramNavState } from "../lib/predictQueueUi";

/** Legacy route: spectrogram lives on the Predict page as a tab. */
export function SpectrogramPage() {
  const location = useLocation();
  const nav = (location.state ?? {}) as SpectrogramNavState & { tab?: PredictTabId };
  return (
    <Navigate
      to="/predict"
      replace
      state={{ ...nav, tab: "results" as const }}
    />
  );
}

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PredictPage } from "../pages/PredictPage";
import { ResultsPage } from "../pages/ResultsPage";
import { LabSectionActiveContext } from "./LabSectionActiveContext";
import { isPredictPath, isResultsPath } from "./labKeepAlivePaths";

/**
 * Keeps Recognition + Results mounted across sidebar navigations so Analysis
 * spectrogram / Results filters do not cold-remount (mirrors PredictTabPanel).
 */
export function LabKeepAliveHost({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const predictActive = isPredictPath(pathname);
  const resultsActive = isResultsPath(pathname);
  const showOutlet = !predictActive && !resultsActive;

  return (
    <>
      <div
        hidden={!predictActive}
        className={
          predictActive
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "hidden"
        }
        aria-hidden={!predictActive}
      >
        <LabSectionActiveContext.Provider value={predictActive}>
          <PredictPage />
        </LabSectionActiveContext.Provider>
      </div>
      <div
        hidden={!resultsActive}
        className={
          resultsActive
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "hidden"
        }
        aria-hidden={!resultsActive}
      >
        <LabSectionActiveContext.Provider value={resultsActive}>
          <ResultsPage />
        </LabSectionActiveContext.Provider>
      </div>
      {showOutlet ? children : null}
    </>
  );
}

export { isPredictPath, isResultsPath } from "./labKeepAlivePaths";

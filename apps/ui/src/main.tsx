import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import i18n from "./i18n";
import { LabJobProvider } from "./lab/LabJobContext";
import { JobsListProvider } from "./jobs/JobsListContext";
import { PredictBatchProvider } from "./predict/PredictBatchContext";
import { PreferencesProvider } from "./preferences/PreferencesContext";
import { SidecarProvider } from "./sidecar/SidecarContext";
import { SaveNoticeProvider } from "./ui/saveNotice";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <SaveNoticeProvider>
        <PreferencesProvider>
          <SidecarProvider>
            <JobsListProvider>
              <PredictBatchProvider>
                <LabJobProvider>
                  <App />
                </LabJobProvider>
              </PredictBatchProvider>
            </JobsListProvider>
          </SidecarProvider>
        </PreferencesProvider>
      </SaveNoticeProvider>
    </I18nextProvider>
  </StrictMode>,
);

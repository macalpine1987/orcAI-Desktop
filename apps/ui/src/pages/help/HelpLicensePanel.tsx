import { useTranslation } from "react-i18next";
import { LICENSE_TEXT } from "../../lib/helpLegal";

export function HelpLicensePanel() {
  const { t } = useTranslation();

  return (
    <div className="help-license-doc">
      <section className="settings-studio-card help-license-card">
        <h2 className="settings-studio-card-title">{t("help.license.docTitle")}</h2>
        <pre className="help-notice-pre help-license-pre">{LICENSE_TEXT}</pre>
      </section>
    </div>
  );
}

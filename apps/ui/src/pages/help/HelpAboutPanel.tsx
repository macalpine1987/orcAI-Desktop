import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { APP_VERSION, formatAppVersion } from "../../lib/appVersion";
import {
  CC_BY_SA_URL,
  DESKTOP_AUTHOR,
  DESKTOP_EMAIL,
  DESKTOP_EMAIL_HREF,
  DESKTOP_ORG,
  ORCAI_CFF_ABSTRACT,
  ORCAI_CFF_KEYWORDS,
  ORCAI_CFF_LICENSE,
  ORCAI_CFF_PAPER_AUTHORS,
  ORCAI_CFF_SOFTWARE_AUTHORS,
  ORCAI_CFF_TITLE,
  ORCAI_CFF_TYPE,
  ORCAI_CFF_VERSION,
  ORCAI_DOI,
  ORCAI_DOI_SHORT,
  ORCAI_ENGINE_VERSION,
  ORCAI_GITHUB,
  ORCAI_GITHUB_HOST,
  ORCAI_PAPER_JOURNAL,
  ORCAI_PAPER_PAGES,
  ORCAI_PAPER_TITLE,
  ORCAI_PAPER_VOLUME_ISSUE,
  ORCAI_PAPER_YEAR,
  orcidHref,
  type HelpCffPerson,
} from "../../lib/helpLegal";
import { HelpExternalLink } from "./HelpMarkdown";

function CffRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="help-cff-row">
      <span className="help-cff-key">{k}</span>
      <span className="help-cff-val">{children}</span>
    </div>
  );
}

function CffAuthorCard({ person, withEmail }: { person: HelpCffPerson; withEmail?: boolean }) {
  const orcidUrl = orcidHref(person.orcid);
  return (
    <div className="help-cff-author">
      <b>{person.name}</b>
      <p>{person.affiliation}</p>
      <p>
        <HelpExternalLink href={orcidUrl} className="help-link">
          {withEmail ? `orcid.org/${person.orcid}` : person.orcid}
        </HelpExternalLink>
        {withEmail && person.email ? ` · ${person.email}` : null}
      </p>
    </div>
  );
}

export function HelpAboutPanel() {
  const { t } = useTranslation();

  return (
    <div className="help-about-united">
      <div className="help-identity">
        <b>orcAI Desktop {formatAppVersion(APP_VERSION)}</b>
        <span>{t("help.about.identityLine", { version: ORCAI_ENGINE_VERSION })}</span>
      </div>

      <section className="settings-studio-card help-about-card">
        <div className="help-united-grid">
          <aside className="help-desktop-col">
            <h2 className="settings-studio-card-title">{t("help.about.desktopKicker")}</h2>
            <p className="help-cff-section">author</p>
            <div className="help-cff-author">
              <b>{DESKTOP_AUTHOR}</b>
              <p>{DESKTOP_ORG}</p>
              <p>
                <HelpExternalLink href={DESKTOP_EMAIL_HREF} className="help-link">
                  {DESKTOP_EMAIL}
                </HelpExternalLink>
              </p>
            </div>
            <div className="help-desktop-notice">
              <p className="help-notice-copy">
                {t("help.about.noticeLead")}{" "}
                <HelpExternalLink href={CC_BY_SA_URL} className="help-link">
                  CC BY-SA 4.0
                </HelpExternalLink>
                {t("help.about.noticeTail", { version: ORCAI_ENGINE_VERSION })}
              </p>
            </div>
          </aside>

          <div className="help-split-rule" aria-hidden />

          <div className="help-cff-pane">
            <div className="help-engine-head">
              <h2 className="settings-studio-card-title">{t("help.about.cffKicker")}</h2>
            </div>
            <div className="help-cff-scroll">
              <CffRow k="cff-version">{ORCAI_CFF_VERSION}</CffRow>
              <CffRow k="title">{ORCAI_CFF_TITLE}</CffRow>
              <CffRow k="type">{ORCAI_CFF_TYPE}</CffRow>
              <CffRow k="license">{ORCAI_CFF_LICENSE}</CffRow>
              <CffRow k="repository-code">
                <HelpExternalLink href={ORCAI_GITHUB} className="help-link">
                  {ORCAI_GITHUB_HOST}
                </HelpExternalLink>
              </CffRow>
              <CffRow k="identifiers">
                <HelpExternalLink href={ORCAI_DOI} className="help-link">
                  doi: {ORCAI_DOI_SHORT.replace(/^doi\.org\//, "")}
                </HelpExternalLink>
              </CffRow>
              <CffRow k="keywords">{ORCAI_CFF_KEYWORDS}</CffRow>
              <p className="help-cff-section">authors</p>
              {ORCAI_CFF_SOFTWARE_AUTHORS.map((person) => (
                <CffAuthorCard key={person.orcid} person={person} withEmail />
              ))}
              <p className="help-cff-section">abstract</p>
              <p className="help-cff-abs">{ORCAI_CFF_ABSTRACT}</p>
              <p className="help-cff-section">preferred-citation</p>
              <CffRow k="type">article</CffRow>
              <CffRow k="year">{ORCAI_PAPER_YEAR}</CffRow>
              <CffRow k="journal">{ORCAI_PAPER_JOURNAL}</CffRow>
              <CffRow k="volume / issue">{ORCAI_PAPER_VOLUME_ISSUE}</CffRow>
              <CffRow k="pages">{ORCAI_PAPER_PAGES}</CffRow>
              <CffRow k="doi">
                <HelpExternalLink href={ORCAI_DOI} className="help-link">
                  {ORCAI_DOI_SHORT.replace(/^doi\.org\//, "")}
                </HelpExternalLink>
              </CffRow>
              <CffRow k="title">{ORCAI_PAPER_TITLE}</CffRow>
              <p className="help-cff-section">preferred-citation.authors</p>
              {ORCAI_CFF_PAPER_AUTHORS.map((person) => (
                <CffAuthorCard key={`paper-${person.orcid}-${person.name}`} person={person} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

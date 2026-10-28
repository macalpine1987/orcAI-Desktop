import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  containsEndorsement,
  LICENSE_TEXT,
  NOTICE_FRAGMENT,
  ORCAI_CFF_PAPER_AUTHORS,
  ORCAI_CFF_SOFTWARE_AUTHORS,
  ORCAI_PAPER_AUTHORS,
  ORCAI_SOFTWARE_AUTHORS,
} from "./helpLegal";
import {
  HELP_TABS,
  HELP_TOPICS,
  MANUAL_CHAPTERS,
  helpHref,
  parseHelpTab,
  topicForPath,
} from "./helpManifest";
import { parseMarkdown, pickManualView } from "./helpMarkdown";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");
const repo = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(uiSrc, rel), "utf8");
}

describe("T-16 help studio gate · / m18–m22 / m38", () => {
  it("1. Help page has three tabs and no chrome Help button", () => {
    const page = read("pages/HelpPage.tsx");
    expect(page).toContain("HelpManualPanel");
    expect(page).toContain("HelpAboutPanel");
    expect(page).toContain("HelpLicensePanel");
    expect(page).not.toContain("HelpAboutOrcaiPanel");
    expect(page).not.toContain("HelpAboutDesktopPanel");
    expect(page).not.toContain("HelpThirdPartyPanel");
    expect(page).not.toContain("PageHelpButton");
    expect(page).toContain("predict-tabs-m03");
    expect(page).toContain("predict-tab");
    expect(page).toContain('aria-current={tab === id ? "page" : undefined}');
    const css = read("styles/help-studio.css");
    expect(css).toContain("--m16-chrome-border: var(--border)");
    expect(css).toMatch(
      /\.help-work-panel\.studio-panel \{[\s\S]*border: 1px solid var\(--m16-chrome-border/,
    );
    expect(HELP_TABS).toEqual(["manual", "about", "license"]);
    expect(parseHelpTab("orcai")).toBe("about");
    for (const tab of HELP_TABS) {
      expect(page).toContain(tab);
    }
  });

  it("2. About names Vadim Romanov, CC BY-SA, all paper authors, DOI, GitHub", () => {
    const about = read("pages/help/HelpAboutPanel.tsx");
    expect(about).toContain("DESKTOP_AUTHOR");
    expect(about).toContain("CC_BY_SA_URL");
    expect(about).toContain("ORCAI_CFF_PAPER_AUTHORS");
    expect(about).toContain("ORCAI_CFF_SOFTWARE_AUTHORS");
    expect(about).toContain("ORCAI_DOI");
    expect(about).toContain("ORCAI_GITHUB");
    expect(about).not.toContain("help.about.notice1");
    expect(ORCAI_PAPER_AUTHORS).toHaveLength(7);
    expect(ORCAI_PAPER_AUTHORS).toContain("Anna Selbmann");
    expect(ORCAI_PAPER_AUTHORS).toContain("Chérine D. Baumgartner");
    expect(ORCAI_SOFTWARE_AUTHORS).toHaveLength(4);
    expect(ORCAI_SOFTWARE_AUTHORS).toContain("Daniel C. Angst");
    expect(ORCAI_SOFTWARE_AUTHORS).not.toContain("Anna Selbmann");
    expect(ORCAI_CFF_PAPER_AUTHORS.map((a) => a.name)).toEqual([...ORCAI_PAPER_AUTHORS]);
    expect(ORCAI_CFF_SOFTWARE_AUTHORS.map((a) => a.name)).toEqual([...ORCAI_SOFTWARE_AUTHORS]);
  });

  it("3. No endorsement wording in Help UI or locales", () => {
    const files = [
      read("pages/help/HelpAboutPanel.tsx"),
      read("pages/help/HelpLicensePanel.tsx"),
      readFileSync(join(uiSrc, "../public/locales/ru/ru.json"), "utf8"),
      readFileSync(join(uiSrc, "../public/locales/en/en.json"), "utf8"),
      readFileSync(join(repo, "LICENSE"), "utf8"),
      readFileSync(join(repo, "NOTICE"), "utf8"),
    ];
    for (const text of files) {
      expect(containsEndorsement(text), text.slice(0, 80)).toBe(false);
    }
    expect(orcaiNoEndorsementMentionsDenial()).toBe(true);
  });

  it("4. License tab shows bundled LICENSE text; identity stays on About", () => {
    const license = read("pages/help/HelpLicensePanel.tsx");
    expect(license).toContain("LICENSE_TEXT");
    expect(license).not.toContain("BUNDLED_LEGAL_FILES");
    expect(license).not.toContain("help-check-list");
    expect(license).not.toContain("NOTICE_FRAGMENT");
    expect(license).not.toContain("DESKTOP_AUTHOR");
    expect(LICENSE_TEXT).toBe(readFileSync(join(repo, "LICENSE"), "utf8"));
    expect(NOTICE_FRAGMENT).toBe(readFileSync(join(repo, "NOTICE"), "utf8"));
  });

  it("5. LICENSE, NOTICE, THIRD_PARTY_LICENSES exist and are bundled", () => {
    for (const name of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES"]) {
      expect(existsSync(join(repo, name)), name).toBe(true);
    }
    const conf = readFileSync(join(repo, "src-tauri/tauri.conf.json"), "utf8");
    expect(conf).toContain('"../LICENSE": "LICENSE"');
    expect(conf).toContain('"../NOTICE": "NOTICE"');
    expect(conf).toContain('"../THIRD_PARTY_LICENSES": "THIRD_PARTY_LICENSES"');
    expect(conf).toContain('"../docs/manual/": "docs/manual/"');
    const lib = readFileSync(join(repo, "src-tauri/src/lib.rs"), "utf8");
    expect(lib).toContain("shell_open_url");
  });

  it("6. Manual chapters match manifest.json; chrome Help deep-links topics", () => {
    const manifest = JSON.parse(
      readFileSync(join(repo, "docs/manual/manifest.json"), "utf8"),
    ) as {
      chapters: { id: string; file: string }[];
      help_topics: Record<string, { chapter: string; anchor?: string }>;
    };
    expect(MANUAL_CHAPTERS.map((c) => c.id)).toEqual(
      manifest.chapters.map((c) => c.id),
    );
    for (const [id, topic] of Object.entries(manifest.help_topics)) {
      expect(HELP_TOPICS[id], id).toEqual(topic);
    }
    const loader = read("lib/helpManualLoad.ts");
    expect(loader).toContain("../../../../docs/manual/ru/*.md");
    expect(loader).toContain("../../../../docs/manual/en/*.md");
    const btn = read("components/PageHelpButton.tsx");
    expect(btn).toContain("helpHref");
    expect(btn).toContain("topicForPath");
    expect(btn).not.toContain("page-help-hint");
    expect(btn).not.toContain("page-help-with-hint");
    const helpCss = read("styles/help-studio.css");
    expect(helpCss).not.toContain(".page-help-hint");
    expect(helpCss).not.toContain(".page-help-with-hint");
    expect(helpHref({ topic: "scope.studio" })).toBe("/help?topic=scope.studio");
    expect(topicForPath("/predict", "results")).toBe("scope.studio");
    expect(topicForPath("/settings")).toBe("gear");
    const manual = read("pages/help/HelpManualPanel.tsx");
    expect(manual).toContain("HelpMarkdown");
    expect(manual).toContain("topicForChapterId");
    expect(manual).toContain("TRAIN_TOC_ANCHORS");
    expect(manual).toContain("help.manual.train.");
    expect(manual).not.toContain("showLanding");
    expect(manual).not.toContain("help-landing-card");
    const trainRu = readFileSync(
      join(repo, "docs/manual/ru/04-train.md"),
      "utf8",
    );
    for (const anchor of ["pipeline", "wizard", "monitor", "hpsearch", "finetune"]) {
      expect(trainRu, anchor).toContain(`{#${anchor}}`);
    }
    expect(trainRu).toContain("kernel_size");
    expect(trainRu).toContain("n_batch");
    const trainEn = readFileSync(
      join(repo, "docs/manual/en/04-train.md"),
      "utf8",
    );
    expect(trainEn).toContain("{#wizard}");
    expect(trainEn).toContain("Restore defaults");
  });

  it("7. Settings has no About tab; Help About is the legal home", () => {
    const page = read("pages/SettingsPage.tsx");
    expect(page).not.toContain("SettingsAboutPanel");
    expect(page).not.toContain('id: "about"');
    expect(page).toContain("SettingsRuntimePanel");
    expect(page).toContain("SettingsInterfacePanel");
    expect(existsSync(join(uiSrc, "pages/settings/SettingsAboutPanel.tsx"))).toBe(
      false,
    );
    expect(read("pages/HelpPage.tsx")).toContain("HelpAboutPanel");
  });

  it("8. Markdown section pick for m38 results studio", () => {
    const src = readFileSync(
      join(repo, "docs/manual/ru/03-predict.md"),
      "utf8",
    );
    const view = pickManualView(src, "results");
    expect(view.title).toMatch(/Анализ/);
    expect(view.source).toContain("display_kind=orcai");
    const blocks = parseMarkdown(src);
    expect(blocks.some((b) => b.type === "h1")).toBe(true);
  });

  it("9. Mockups m18–m22 and m38 are in the handoff folder", () => {
    const mockups = join(repo, "docs/cursor-handoff/mockups");
    for (const name of [
      "m18-help-about.png",
      "m19-help-manual-toc.png",
      "m20-help-orcai.png",
      "m21-help-license.png",
      "m22-help-third-party.png",
      "m38-help-manual-chapter.png",
    ]) {
      expect(existsSync(join(mockups, name)), name).toBe(true);
    }
  });
});

function orcaiNoEndorsementMentionsDenial(): boolean {
  const ru = JSON.parse(
    readFileSync(join(uiSrc, "../public/locales/ru/ru.json"), "utf8"),
  ) as { help: { about: { noticeTail: string } } };
  return ru.help.about.noticeTail.includes("не означает их одобрения");
}

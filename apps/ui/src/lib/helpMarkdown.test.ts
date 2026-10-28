import { describe, expect, it } from "vitest";
import { containsEndorsement } from "./helpLegal";
import { parseMarkdown, pickManualView, slugifyHeading } from "./helpMarkdown";
import { helpHref, parseHelpTab, topicForPath } from "./helpManifest";

describe("helpMarkdown", () => {
  it("parses headings, lists, tables and {#anchors}", () => {
    const src = `# Title\n\n## Results (studio) {#results}\n\nHello **world** and \`code\`.\n\n- a\n- b\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`;
    const blocks = parseMarkdown(src);
    expect(blocks[0]).toMatchObject({ type: "h1", text: "Title" });
    expect(blocks[1]).toMatchObject({ type: "h2", id: "results" });
    expect(blocks.some((b) => b.type === "ul")).toBe(true);
    expect(blocks.some((b) => b.type === "table")).toBe(true);
  });

  it("picks an anchored section", () => {
    const src = "# Predictions\n\nIntro\n\n## parameters\n\nParams body.\n\n## results\n\nStudio body.\n";
    const view = pickManualView(src, "results");
    expect(view.title).toBe("results");
    expect(view.source).toContain("Studio body");
    expect(view.source).not.toContain("Params body");
  });

  it("slugify keeps ASCII ids", () => {
    expect(slugifyHeading("results")).toBe("results");
  });
});

describe("helpManifest hrefs", () => {
  it("builds help URLs and path topics", () => {
    expect(helpHref({})).toBe("/help");
    expect(helpHref({ tab: "about" })).toBe("/help?tab=about");
    expect(parseHelpTab("license")).toBe("license");
    expect(parseHelpTab("orcai")).toBe("about");
    expect(parseHelpTab("third-party")).toBe("manual");
    expect(topicForPath("/predict", "filter")).toBe("scope.filter");
    expect(topicForPath("/")).toBe("home");
  });
});

describe("helpLegal endorsement detector", () => {
  it("flags endorsement claims and allows denial sentences", () => {
    expect(containsEndorsement("одобрено ETH")).toBe(true);
    expect(containsEndorsement("endorsed by the authors")).toBe(true);
    expect(
      containsEndorsement("Упоминание авторов не означает их одобрения Desktop."),
    ).toBe(false);
  });
});

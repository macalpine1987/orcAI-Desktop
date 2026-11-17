import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function locale(lang: "ru" | "en"): {
  settings: { dataHealthBanner: string; dataHealthBannerHint: string };
} {
  return JSON.parse(
    readFileSync(join(repo, "apps/ui/public/locales", lang, `${lang}.json`), "utf8"),
  );
}

describe("Show tips hint names the header chip", () => {
  it("describes tips in the app header", () => {
    const ru = locale("ru").settings;
    const en = locale("en").settings;
    expect(ru.dataHealthBanner).toBe("Отображать советы");
    expect(ru.dataHealthBannerHint).toContain("в шапке");
    expect(ru.dataHealthBannerHint).not.toContain("страниц");
    expect(ru.dataHealthBannerHint).toContain("n_batch × batch_size");
    expect(ru.dataHealthBannerHint).toContain("На кнопки не влияют");

    expect(en.dataHealthBanner).toBe("Show tips");
    expect(en.dataHealthBannerHint).toContain("in the app header");
    expect(en.dataHealthBannerHint).toContain("n_batch × batch_size");
    expect(en.dataHealthBannerHint).toContain("Does not block actions.");
  });

  it("mounts tip feeders and HeaderNoticeSlot in the shell", () => {
    const shell = readFileSync(
      join(repo, "apps/ui/src/layout/AppShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("HeaderNoticeSlot");
    expect(shell).toContain("ProjectDataHealthBanner");
    expect(shell).toContain("PipelineSnippetsShortageBanner");
    const notice = readFileSync(
      join(repo, "apps/ui/src/ui/saveNotice.tsx"),
      "utf8",
    );
    expect(notice).toContain("setHeaderTip");
    expect(notice).toContain("HeaderNoticeChip");
    const css = readFileSync(
      join(repo, "apps/ui/src/styles/header-notice.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.mat-shell-header-notice\s*\{[^}]*position:\s*absolute/s,
    );
    expect(css).not.toMatch(
      /\.mat-shell-header-notice\s*\{[^}]*flex:\s*0\s+0\s+auto/s,
    );
  });
});

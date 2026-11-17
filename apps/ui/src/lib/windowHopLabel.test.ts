import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function locale(lang: "ru" | "en"): {
  pipeline: { param: { nfft: string } };
  wizard: { overlap: string; overlapHint: string };
} {
  return JSON.parse(readFileSync(join(repo, "apps/ui/public/locales", lang, `${lang}.json`), "utf8"));
}

describe("n_overlap is labeled as the window hop", () => {
  it("names the hop in the wizard and on the training board", () => {
    const ru = locale("ru");
    const en = locale("en");
    expect(ru.wizard.overlap).toBe("Шаг окна");
    expect(ru.wizard.overlapHint).toContain("n_overlap");
    expect(ru.wizard.overlapHint).not.toContain("половина");
    expect(ru.pipeline.param.nfft).toBe("nfft / шаг");
    expect(en.wizard.overlap).toBe("Window hop");
    expect(en.wizard.overlapHint).toContain("n_overlap");
    expect(en.wizard.overlapHint).not.toContain("half");
    expect(en.pipeline.param.nfft).toBe("nfft / hop");
  });

  it("uses the hop/step wording in the training chapter", () => {
    const ru = readFileSync(join(repo, "docs/manual/ru/04-train.md"), "utf8");
    const en = readFileSync(join(repo, "docs/manual/en/04-train.md"), "utf8");
    expect(ru).toContain("| Шаг окна (`n_overlap`) | 256 |");
    expect(ru).toContain("Может превышать размер окна");
    expect(ru).not.toContain("Перекрытие окон");
    // EN manual uses “Window step” (aligned with RU «Шаг окна»); UI keeps “Window hop”.
    expect(en).toContain("| Window step (`n_overlap`) | 256 |");
    expect(en).toContain("larger than the window size");
    expect(en).not.toContain("Window overlap");
  });
});

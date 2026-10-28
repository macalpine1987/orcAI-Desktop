import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function manual(lang: "ru" | "en", file: string): string {
  return readFileSync(join(repo, "docs/manual", lang, file), "utf8");
}

describe("manual copy for duration limits, presets, and empty snippets", () => {
  it("explains the default duration row without rewriting the filter steps", () => {
    const ru = manual("ru", "03-predict.md");
    const en = manual("en", "03-predict.md");
    expect(ru).toContain("4. Нажмите **Применить фильтр**.");
    expect(ru.indexOf("первая строка — **default**")).toBeGreaterThan(
      ru.indexOf("4. Нажмите **Применить фильтр**."),
    );
    expect(ru.indexOf("Исходный файл `*_predicted.txt` не меняется.")).toBeGreaterThan(
      ru.indexOf("первая строка — **default**"),
    );
    expect(ru).toContain(
      "Классы, для которых пример ничего не задаёт, проходят по строке **default**.",
    );
    expect(en).toContain("4. Click **Apply filter**.");
    expect(en.indexOf("The first row of the duration limits table is **default**.")).toBeGreaterThan(
      en.indexOf("4. Click **Apply filter**."),
    );
    expect(en.indexOf("The original `*_predicted.txt` file is not changed.")).toBeGreaterThan(
      en.indexOf("The first row of the duration limits table is **default**."),
    );
    expect(en).toContain(
      "Classes the example does not set follow the **default** row.",
    );
  });

  it("describes an empty label suffix and how Save treats a shared preset", () => {
    const ru = manual("ru", "03-predict.md");
    const en = manual("en", "03-predict.md");
    expect(ru).toContain(
      "Пустое поле суффикс не добавляет. Столбец **Тип** на вкладке **Анализ** его не показывает",
    );
    expect(ru).toContain(
      "**Сохранить** обновляет выбранный пресет и не привязывает общий пресет к открытому проекту.",
    );
    expect(en).toContain("An empty field adds no suffix.");
    expect(en).toContain(
      "**Save** updates the selected preset and does not bind a shared preset to the open project.",
    );
  });

  it("names the project duration file and the default-row override", () => {
    const ruGlossary = manual("ru", "09-glossary.md");
    const enGlossary = manual("en", "09-glossary.md");
    expect(ruGlossary).toContain("`*_call_duration_limits.json`");
    expect(enGlossary).toContain("`*_call_duration_limits.json`");
    expect(ruGlossary).not.toContain("default_call_duration_limits.json");
    expect(enGlossary).not.toContain("default_call_duration_limits.json");
    expect(ruGlossary).not.toContain("`call_duration_limits.json`");
    expect(enGlossary).not.toContain("`call_duration_limits.json`");

    expect(manual("ru", "10-troubleshooting.md")).toContain(
      "Своя строка класса с теми же пределами перекрывает **default**.",
    );
    expect(manual("en", "10-troubleshooting.md")).toContain(
      "A class row with the same limits overrides **default**.",
    );
  });

  it("keeps the unfiltered-test checkbox sentence and replaces the two paragraphs after it", () => {
    const ru = manual("ru", "04-train.md");
    const en = manual("en", "04-train.md");
    expect(ru).toContain(
      "Какую долю сниппетов без метки отбросить. В записях их обычно гораздо больше, чем звуков; без этой настройки обучение идёт в основном по ним",
    );
    expect(ru).toContain(
      "На этом шаге есть флажок **Нефильтрованный тест (-tu)**.",
    );
    expect(ru).toContain(
      "В полевой записи таких фрагментов гораздо больше, чем звуков.",
    );
    expect(ru).toContain("вместе с пустыми фрагментами.");
    expect(ru).not.toContain("с естественной долей тишины");

    expect(en).toContain(
      "Recordings usually contain far more of them than sounds; without this setting training runs mainly on them",
    );
    expect(en).toContain(
      "This step has an **Unfiltered test (-tu)** checkbox.",
    );
    expect(en).toContain(
      "A field recording contains far more of these fragments than sounds.",
    );
    expect(en).toContain("empty fragments included.");
    expect(en).not.toContain("with their natural share of silence");
  });
});

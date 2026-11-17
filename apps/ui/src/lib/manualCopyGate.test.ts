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
    expect(ru.indexOf("Первая строка таблицы — **default**.")).toBeGreaterThan(
      ru.indexOf("4. Нажмите **Применить фильтр**."),
    );
    expect(ru.indexOf("Исходный файл `*_predicted.txt` не изменяется.")).toBeGreaterThan(
      ru.indexOf("4. Нажмите **Применить фильтр**."),
    );
    expect(ru).toContain(
      "Классы, для которых в примере значения не заданы, обрабатываются по строке **default**.",
    );
    expect(en).toContain("4. Click **Apply filter**.");
    expect(en.indexOf("The first row of the table is **default**.")).toBeGreaterThan(
      en.indexOf("4. Click **Apply filter**."),
    );
    expect(en.indexOf("The original `*_predicted.txt` file is not changed.")).toBeGreaterThan(
      en.indexOf("4. Click **Apply filter**."),
    );
    expect(en).toContain(
      "Classes for which the example defines no values are handled by the **default** row.",
    );
    expect(ru).toContain("нажмите **Пример**");
    expect(ru).not.toContain("Пример orcai-v1");
    expect(en).toContain("click **Example**");
    expect(en).not.toContain("orcAI-v1 example");
    expect(manual("ru", "10-troubleshooting.md")).toContain("**Пример** подставляет");
    expect(manual("en", "10-troubleshooting.md")).toContain(
      "The **Example** button fills",
    );
  });

  it("describes an empty label suffix and how Save treats a shared preset", () => {
    const ru = manual("ru", "03-predict.md");
    const en = manual("en", "03-predict.md");
    expect(ru).toContain(
      "Если поле суффикса пустое, суффикс не добавляется. Столбец **Тип** на вкладке **Анализ** суффикс не показывает",
    );
    expect(ru).toContain(
      "**Сохранить** обновляет выбранный пресет. Общий пресет при этом не привязывается к открытому проекту",
    );
    expect(en).toContain("If the suffix field is empty, no suffix is added.");
    expect(en).toContain(
      "**Save** updates the selected preset. It does not link a shared preset to the open project.",
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

    const ruTrouble = manual("ru", "10-troubleshooting.md");
    const enTrouble = manual("en", "10-troubleshooting.md");
    expect(ruTrouble).toContain(
      "Строка с именем класса имеет приоритет над строкой **default**, даже если пределы совпадают.",
    );
    expect(enTrouble).toContain(
      "A row named after a class takes priority over the **default** row, even if the limits are the same.",
    );
  });

  it("documents sequential hpsearch and hidden -pl in the Desktop UI", () => {
    const ru = manual("ru", "04-train.md");
    const en = manual("en", "04-train.md");
    expect(ru).toContain("Поиск выполняется последовательно");
    expect(ru).toContain("`-pl`");
    expect(ru).toContain("скрыт");
    expect(ru).toContain("в интерфейсе Desktop");
    expect(ru).toContain("на шаге 5 мастера");
    expect(ru).toContain("**Подобрать гиперпараметры**");
    expect(ru).not.toContain("включается отдельно, в мастере и на шаге конвейера");
    expect(en).toContain("The search runs sequentially by default");
    expect(en).toContain("`-pl`");
    expect(en).toContain("hidden in the Desktop UI");
    expect(en).toContain("on wizard step 5");
    expect(en).toContain("**Tune hyperparameters**");
    expect(en).not.toContain(
      "turned on separately, in the wizard and in the pipeline step",
    );
  });

  it("keeps the unfiltered-test checkbox sentence and empty-snippet framing", () => {
    const ru = manual("ru", "04-train.md");
    const en = manual("en", "04-train.md");
    expect(ru).toContain(
      "В записях пустых фрагментов намного больше, чем звуков; без отбрасывания обучение шло бы преимущественно на них",
    );
    expect(ru).toContain(
      "На шаге 5 доступен флажок **Нефильтрованный тест (-tu)**.",
    );
    expect(ru).toContain(
      "В полевой записи пустых фрагментов значительно больше, чем звуков.",
    );
    expect(ru).toContain("вместе с пустыми.");
    expect(ru).not.toContain("с естественной долей тишины");

    expect(en).toContain(
      "Recordings contain far more empty stretches than sounds; without discarding, training would focus mostly on them",
    );
    expect(en).toContain(
      "Step 5 has an **Unfiltered test (-tu)** checkbox.",
    );
    expect(en).toContain(
      "In a field recording there are far more empty stretches than sounds.",
    );
    expect(en).toContain("empty ones included.");
    expect(en).not.toContain("with their natural share of silence");
  });
});

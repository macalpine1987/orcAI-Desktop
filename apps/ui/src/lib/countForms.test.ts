import { beforeAll, describe, expect, it } from "vitest";
import i18n, { i18nReady } from "../i18n";

beforeAll(async () => {
  await i18nReady;
});

function phrase(lng: "ru" | "en", key: string, count: number): string {
  return i18n.t(key, { lng, count });
}

describe("Russian steps and tips use 1 / 2–4 / 5+ forms", () => {
  it("agrees the annotation step and the train step with the count", () => {
    expect(phrase("ru", "projects.studio.nextStep.annotate", 1)).toBe(
      "Добавить аннотации для 1 записи",
    );
    expect(phrase("ru", "projects.studio.nextStep.annotate", 2)).toBe(
      "Добавить аннотации для 2 записей",
    );
    expect(phrase("ru", "projects.studio.nextStep.annotate", 5)).toBe(
      "Добавить аннотации для 5 записей",
    );
    expect(phrase("ru", "projects.studio.nextStep.annotate", 21)).toBe(
      "Добавить аннотации для 21 записи",
    );

    expect(phrase("ru", "projects.studio.nextStep.train", 1)).toBe(
      "Обучить модель на 1 аннотации",
    );
    expect(phrase("ru", "projects.studio.nextStep.train", 3)).toBe(
      "Обучить модель на 3 аннотациях",
    );
    expect(phrase("ru", "projects.studio.nextStep.train", 5)).toBe(
      "Обучить модель на 5 аннотациях",
    );
  });

  it("agrees the remaining next steps with the count", () => {
    expect(phrase("ru", "projects.studio.nextStep.predict", 1)).toContain("1 запись");
    expect(phrase("ru", "projects.studio.nextStep.predict", 2)).toContain("2 записи");
    expect(phrase("ru", "projects.studio.nextStep.predict", 5)).toContain("5 записей");

    expect(phrase("ru", "projects.studio.nextStep.create_tvt", 1)).toContain("1 аннотации");
    expect(phrase("ru", "projects.studio.nextStep.create_tvt", 4)).toContain("4 аннотаций");
    expect(phrase("ru", "projects.studio.nextStep.create_tvt", 11)).toContain("11 аннотаций");

    expect(phrase("ru", "projects.studio.nextStep.filter", 1)).toBe(
      "Отфильтровать оставшийся 1 результат",
    );
    expect(phrase("ru", "projects.studio.nextStep.filter", 2)).toBe(
      "Отфильтровать оставшиеся 2 результата",
    );
    expect(phrase("ru", "projects.studio.nextStep.filter", 5)).toBe(
      "Отфильтровать оставшиеся 5 результатов",
    );
    expect(phrase("ru", "projects.studio.nextStep.sync_table", 1)).toBe(
      "Обновить таблицу для 1 WAV",
    );
  });

  it("agrees the project tips with the count", () => {
    expect(phrase("ru", "shellHealth.missingWav", 1)).toBe(
      "В таблице 1 запись без файла WAV. Поправьте путь или удалите строку.",
    );
    expect(phrase("ru", "shellHealth.missingWav", 2)).toContain("2 записи без файла WAV");
    expect(phrase("ru", "shellHealth.missingWav", 5)).toContain("5 записей без файла WAV");

    expect(phrase("ru", "shellHealth.unpairedAnn", 1)).toContain("1 аннотация без WAV");
    expect(phrase("ru", "shellHealth.unpairedAnn", 2)).toContain("2 аннотации без WAV");
    expect(phrase("ru", "shellHealth.unpairedAnn", 5)).toContain("5 аннотаций без WAV");

    expect(phrase("ru", "shellHealth.annGap", 1)).toBe(
      "1 запись с WAV без аннотаций. Для обучения нужна парная разметка.",
    );
    expect(phrase("ru", "shellHealth.annGap", 3)).toContain("3 записи с WAV без аннотаций");
    expect(phrase("ru", "shellHealth.annGap", 5)).toContain("5 записей с WAV без аннотаций");
    expect(phrase("ru", "shellHealth.annGap", 5)).toContain("нужна парная разметка");

    expect(phrase("ru", "shellHealth.tableStale", 0)).toBe(
      "Таблица записей устарела или отсутствует. Обновите её в «Проектах».",
    );
  });
});

describe("English steps and tips use a singular for one", () => {
  it("uses the singular noun in next steps", () => {
    expect(phrase("en", "projects.studio.nextStep.annotate", 1)).toBe(
      "Add annotations for 1 recording",
    );
    expect(phrase("en", "projects.studio.nextStep.annotate", 2)).toBe(
      "Add annotations for 2 recordings",
    );
    expect(phrase("en", "projects.studio.nextStep.train", 1)).toBe(
      "Train the model on 1 annotation",
    );
    expect(phrase("en", "projects.studio.nextStep.train", 5)).toBe(
      "Train the model on 5 annotations",
    );
    expect(phrase("en", "projects.studio.nextStep.predict", 1)).toContain("1 recording");
    expect(phrase("en", "projects.studio.nextStep.predict", 2)).toContain("2 recordings");
    expect(phrase("en", "projects.studio.nextStep.create_tvt", 1)).toContain("1 annotation");
    expect(phrase("en", "projects.studio.nextStep.create_tvt", 2)).toContain("2 annotations");
    expect(phrase("en", "projects.studio.nextStep.filter", 1)).toBe(
      "Filter the remaining 1 result",
    );
    expect(phrase("en", "projects.studio.nextStep.filter", 2)).toBe(
      "Filter the remaining 2 results",
    );
  });

  it("uses the singular noun in project tips", () => {
    expect(phrase("en", "shellHealth.missingWav", 1)).toBe(
      "1 table row has no WAV file. Fix the path or delete the row.",
    );
    expect(phrase("en", "shellHealth.missingWav", 2)).toBe(
      "2 table rows have no WAV file. Fix the paths or delete the rows.",
    );
    expect(phrase("en", "shellHealth.unpairedAnn", 1)).toContain("1 annotation has no WAV");
    expect(phrase("en", "shellHealth.unpairedAnn", 2)).toContain("2 annotations have no WAV");
    expect(phrase("en", "shellHealth.annGap", 1)).toBe(
      "1 WAV recording has no annotations. Training needs a paired label file.",
    );
    expect(phrase("en", "shellHealth.annGap", 2)).toBe(
      "2 WAV recordings have no annotations. Training needs paired label files.",
    );
  });
});

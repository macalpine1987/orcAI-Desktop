import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type Locale = {
  home: { subtitle: string; readinessHint: string };
  settings: { subtitle: string };
  help: Record<string, string>;
  monitor: { subtitle: string };
  pages: {
    projects: { description: string };
    predict: { description: string; analysisGuide: string };
    pipeline: { description: string };
    models: { description: string };
    results: { description: string };
    jobs: { description: string };
    help: { description: string };
  };
  projects: {
    studio: {
      subtitle: Record<string, string>;
      wizard: {
        subtitle: string;
        recognitionHint: string;
        trainingHint: string;
        fullHint: string;
      };
      focus: { hint: string };
      empty: { labHint: string; fullHint: string };
    };
  };
};

function load(lang: "ru" | "en"): Locale {
  return JSON.parse(
    readFileSync(join(uiRoot, "public/locales", lang, `${lang}.json`), "utf8"),
  ) as Locale;
}

describe("section subtitles", () => {
  const ru = load("ru");
  const en = load("en");

  it("header lines match the section they introduce", () => {
    expect(ru.home.subtitle).toBe(
      "Запуск среды, текущий проект и последние задачи.",
    );
    expect(en.home.subtitle).toBe(
      "Start the runtime, the current project, and recent jobs.",
    );

    expect(ru.projects.studio.subtitle).toEqual({
      none: "Создайте проект или откройте готовую папку.",
      empty: "Проект создан. Добавьте записи.",
      field: "Распознавание без разметки записей.",
      lab: "Обучение по записям и аннотациям.",
      full: "Распознавание и обучение в этом проекте.",
      wizard: "Имя, папка и задача нового проекта.",
    });
    expect(en.projects.studio.subtitle).toEqual({
      none: "Create a project or open an existing folder.",
      empty: "Project created. Add recordings.",
      field: "Predictions without labeled recordings.",
      lab: "Training from recordings and annotations.",
      full: "Predictions and training in this project.",
      wizard: "Name, folder, and task for a new project.",
    });
    expect(ru.projects.studio.wizard.subtitle).toBe(
      "Задача меняет подсказки, не команды.",
    );
    expect(en.projects.studio.wizard.subtitle).toBe(
      "The task changes hints, not commands.",
    );
    expect(ru.pages.projects.description).toBe(
      "Папка проекта, таблица записей и файлы проекта.",
    );
    expect(en.pages.projects.description).toBe(
      "Project folder, recording table, and project files.",
    );

    const predictRu =
      "Очередь записей, спектрограмма с обнаружениями и фильтр длительности.";
    const predictEn =
      "Recording queue, spectrogram with detections, and a duration filter.";
    expect(ru.pages.predict.description).toBe(predictRu);
    expect(ru.pages.predict.analysisGuide).toBe(predictRu);
    expect(en.pages.predict.description).toBe(predictEn);
    expect(en.pages.predict.analysisGuide).toBe(predictEn);

    expect(ru.pages.models.description).toBe(
      "Встроенные и обученные модели, метрики теста и совместимость.",
    );
    expect(en.pages.models.description).toBe(
      "Built-in and trained models, test metrics, and compatibility.",
    );
    expect(ru.pages.jobs.description).toBe("Очередь и история задач.");
    expect(en.pages.jobs.description).toBe("Job queue and history.");
    expect(ru.settings.subtitle).toBe("Среда, данные и интерфейс.");
    expect(en.settings.subtitle).toBe("Runtime, data, and interface.");
  });

  it("help header follows the open tab", () => {
    expect(ru.help.subtitleManual).toBe("Руководство по разделам программы.");
    expect(en.help.subtitleManual).toBe("Guide to the program sections.");
    expect(ru.help.subtitleAbout).toBe("Версия программы и встроенный orcAI.");
    expect(en.help.subtitleAbout).toBe("Program version and the bundled orcAI.");
    expect(ru.help.subtitleLicense).toBe("Текст лицензии CC BY-SA 4.0.");
    expect(en.help.subtitleLicense).toBe("CC BY-SA 4.0 license text.");
    expect(ru.pages.help.description).toBe(ru.help.subtitleManual);
    expect(en.pages.help.description).toBe(en.help.subtitleManual);
    expect(ru.help).not.toHaveProperty("subtitleLegal");
    expect(en.help).not.toHaveProperty("subtitleLegal");

    const page = readFileSync(join(uiRoot, "src/pages/HelpPage.tsx"), "utf8");
    expect(page).toContain('if (tab === "manual") return t("help.subtitleManual");');
    expect(page).toContain('if (tab === "about") return t("help.subtitleAbout");');
    expect(page).toContain('return t("help.subtitleLicense");');
    expect(page).not.toContain("help.subtitleLegal");
  });

  it("in-screen hints stay on the same controls", () => {
    expect(ru.projects.studio.wizard.recognitionHint).toBe(
      "Распознавание записей встроенными или обученными моделями.",
    );
    expect(en.projects.studio.wizard.recognitionHint).toBe(
      "Predict recordings with built-in or trained models.",
    );
    expect(ru.projects.studio.wizard.trainingHint).toBe(
      "Подготовка размеченных записей и обучение модели.",
    );
    expect(en.projects.studio.wizard.trainingHint).toBe(
      "Prepare labeled recordings and train a model.",
    );
    expect(ru.projects.studio.wizard.fullHint).toBe(
      "Распознавание и обучение в этом проекте.",
    );
    expect(en.projects.studio.wizard.fullHint).toBe(
      "Predictions and training in this project.",
    );
    expect(ru.projects.studio.focus.hint).toBe(
      "Задача меняет подсказки, не команды.",
    );
    expect(en.projects.studio.focus.hint).toBe(
      "The task changes hints, not commands.",
    );
    expect(ru.projects.studio.empty.labHint).toBe(
      "Распознавание тоже можно запустить.",
    );
    expect(en.projects.studio.empty.labHint).toBe("Predictions can be run too.");
    expect(ru.home.readinessHint).toBe("Состояние файлов проекта.");
    expect(en.home.readinessHint).toBe("State of the project files.");
    expect(ru.monitor.subtitle).toBe(
      "Метрики по эпохам, чекпоинт и остановка.",
    );
    expect(en.monitor.subtitle).toBe(
      "Per-epoch metrics, checkpoint, and stop.",
    );
    expect(ru.projects.studio.empty.fullHint).toBe(
      "Распознавание и обучение доступны в одном каталоге; подсказки следуют за артефактами.",
    );
    expect(en.projects.studio.empty.fullHint).toBe(
      "Predictions and training share one folder; hints follow the artifacts.",
    );
  });

  it("leaves training and results section lines unchanged", () => {
    expect(ru.pages.pipeline.description).toBe(
      "Конвейер orcAI: подготовка данных, обучение и проверка модели.",
    );
    expect(en.pages.pipeline.description).toBe(
      "orcAI pipeline: data prep, model training, and evaluation.",
    );
    expect(ru.pages.results.description).toBe(
      "Сводка детекций по проекту, сверка с аннотациями и экспорт.",
    );
    expect(en.pages.results.description).toBe(
      "Project detection summary, annotation check, and export.",
    );
  });
});

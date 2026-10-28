/** User-facing help for pipeline board reason codes (blocked / stale / job_failed). */

export type PipelineReasonId =
  | "missing_recording_table"
  | "no_recordings"
  | "no_annotations"
  | "missing_spectrograms"
  | "missing_label_arrays"
  | "missing_snippet_table"
  | "missing_tvt_tables"
  | "missing_tvt_data"
  | "missing_checkpoint"
  | "job_failed"
  | "params_changed"
  | "params_changed_spectrogram"
  | "params_changed_snippets"
  | "upstream_changed";

export type PipelineReasonCopy = {
  title: string;
  body: string;
  stepsLabel: string;
  steps: string[];
};

const COPY: Record<"ru" | "en", Record<PipelineReasonId, PipelineReasonCopy>> = {
  ru: {
    missing_recording_table: {
      title: "Нет таблицы записей",
      body: "Конвейер обучения начинается с recording_table.csv. Без неё спектрограммы и метки создать нельзя.",
      stepsLabel: "Что сделать:",
      steps: [
        "Откройте «Проекты» и добавьте WAV, затем обновите таблицу записей.",
        "Убедитесь, что файл recording_table.csv лежит в каталоге проекта.",
        "Вернитесь на конвейер и обновите доску.",
      ],
    },
    no_recordings: {
      title: "В таблице нет записей",
      body: "recording_table.csv есть, но в ней нет строк с записями.",
      stepsLabel: "Что сделать:",
      steps: [
        "Добавьте WAV в проект и снова обновите таблицу записей.",
        "Проверьте, что пути в CSV указывают на существующие файлы.",
        "Обновите доску конвейера.",
      ],
    },
    no_annotations: {
      title: "Нет аннотаций",
      body: "Для массивов меток нужны файлы аннотаций, привязанные в таблице записей.",
      stepsLabel: "Что сделать:",
      steps: [
        "Добавьте аннотации в проект (вкладка «Аннотации») — пути проставятся в таблице.",
        "При необходимости обновите таблицу записей.",
        "Затем запустите шаг «Массивы меток».",
      ],
    },
    missing_spectrograms: {
      title: "Нужны спектрограммы",
      body: "Следующий шаг ждёт артефакты create-spectrograms.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите шаг «Спектрограммы» и дождитесь статуса «готово».",
        "Если шаг «устарел» — перезапустите его после смены параметров.",
        "Затем продолжите конвейер.",
      ],
    },
    missing_label_arrays: {
      title: "Нужны массивы меток",
      body: "Таблица сниппетов строится по спектрограммам и label-массивам.",
      stepsLabel: "Что сделать:",
      steps: [
        "Сначала завершите спектрограммы, затем «Массивы меток».",
        "Проверьте аннотации и колонки классов в таблице записей.",
        "После успеха запустите таблицу сниппетов.",
      ],
    },
    missing_snippet_table: {
      title: "Нужна таблица сниппетов",
      body: "TVT-таблицы семплируются из all_snippets.csv.gz.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите «Таблица сниппетов» (create-snippet-table).",
        "Убедитесь, что спектрограммы и метки уже готовы.",
        "Затем создайте TVT-таблицы.",
      ],
    },
    missing_tvt_tables: {
      title: "Нужны TVT-таблицы",
      body: "Датасеты TFRecord собираются из train/val/test snippet tables.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите «TVT-таблицы» (create-tvt-snippet-tables).",
        "При ошибке нехватки сниппетов уменьшите n_batch_* или batch_size.",
        "Затем запустите create-tvt-data.",
      ],
    },
    missing_tvt_data: {
      title: "Нужны TVT-датасеты",
      body: "Обучение и hpsearch читают data_*.tfrecord из каталога TVT.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите «TVT-датасеты» (create-tvt-data) до конца.",
        "Не прерывайте запись GZIP-шардов — иначе train упадёт с ошибкой inflate.",
        "После успеха запускайте обучение.",
      ],
    },
    missing_checkpoint: {
      title: "Нужен обученный чекпоинт",
      body: "Тест модели требует успешно завершённый шаг train с весами на диске.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите «Обучение» и дождитесь статуса «готово».",
        "Проверьте, что в папке модели есть model_weights / Keras-файл.",
        "Затем запустите «Тестирование».",
      ],
    },
    job_failed: {
      title: "Последний запуск шага завершился ошибкой",
      body: "На диске есть след неудачной задачи. Откройте текст ошибки выше (если есть) или лог в «Задачи».",
      stepsLabel: "Что сделать:",
      steps: [
        "Прочитайте баннер ошибки или лог задачи.",
        "Исправьте причину и снова нажмите «Запуск» на этом шаге.",
        "При повреждённом TVT сначала пересоздайте create-tvt-data.",
      ],
    },
    params_changed: {
      title: "Изменились параметры проекта",
      body: "Артефакт шага собран со старыми параметрами и помечен как устаревший.",
      stepsLabel: "Что сделать:",
      steps: [
        "Перезапустите этот шаг (и при необходимости следующие).",
        "Либо верните параметры к прежним значениям, если пересчёт не нужен.",
        "Обновите доску после завершения.",
      ],
    },
    params_changed_spectrogram: {
      title: "Изменились параметры спектрограммы",
      body: "nfft / окно / hop и т.п. не совпадают с тем, чем собирали спектрограммы.",
      stepsLabel: "Что сделать:",
      steps: [
        "Пересоздайте спектрограммы (и обычно метки → сниппеты → TVT).",
        "Либо верните параметры спектрограммы к прежним.",
        "Не запускайте train на устаревших спектрограммах.",
      ],
    },
    params_changed_snippets: {
      title: "Изменились параметры сниппетов",
      body: "Длительность / фильтры / fraction_removal изменились относительно собранных сниппетов.",
      stepsLabel: "Что сделать:",
      steps: [
        "Пересоздайте таблицу сниппетов и TVT-шаги.",
        "Проверьте n_batch_* после фильтрации.",
        "Затем снова обучение.",
      ],
    },
    upstream_changed: {
      title: "Изменился предыдущий шаг",
      body: "Входные артефакты новее выхода этого шага — результат устарел.",
      stepsLabel: "Что сделать:",
      steps: [
        "Перезапустите этот шаг.",
        "Пройдите по цепочке вниз, пока статусы снова не станут «готово».",
        "Обновите доску, если статусы не подтянулись сами.",
      ],
    },
  },
  en: {
    missing_recording_table: {
      title: "Recording table missing",
      body: "Training starts from recording_table.csv. Without it, spectrograms and labels cannot be built.",
      stepsLabel: "What to do:",
      steps: [
        "Open Projects, add WAVs, then refresh the recording table.",
        "Confirm recording_table.csv is in the project folder.",
        "Return to the pipeline and refresh the board.",
      ],
    },
    no_recordings: {
      title: "No rows in the recording table",
      body: "recording_table.csv exists but contains no recording rows.",
      stepsLabel: "What to do:",
      steps: [
        "Add WAVs to the project and refresh the recording table.",
        "Check that CSV paths point to existing files.",
        "Refresh the pipeline board.",
      ],
    },
    no_annotations: {
      title: "No annotations",
      body: "Label arrays need annotation files linked in the recording table.",
      stepsLabel: "What to do:",
      steps: [
        "Add annotations in the project (Annotations tab) — paths fill in the table.",
        "Refresh the recording table if needed.",
        "Then run the Label arrays step.",
      ],
    },
    missing_spectrograms: {
      title: "Spectrograms required",
      body: "The next step waits for create-spectrograms artifacts.",
      stepsLabel: "What to do:",
      steps: [
        "Run the Spectrograms step and wait until it is done.",
        "If the step is stale, re-run it after parameter changes.",
        "Then continue the pipeline.",
      ],
    },
    missing_label_arrays: {
      title: "Label arrays required",
      body: "The snippet table is built from spectrograms and label arrays.",
      stepsLabel: "What to do:",
      steps: [
        "Finish spectrograms, then Label arrays.",
        "Check annotations and class columns in the recording table.",
        "After success, run the snippet table step.",
      ],
    },
    missing_snippet_table: {
      title: "Snippet table required",
      body: "TVT tables are sampled from all_snippets.csv.gz.",
      stepsLabel: "What to do:",
      steps: [
        "Run Snippet table (create-snippet-table).",
        "Ensure spectrograms and labels are already done.",
        "Then create TVT tables.",
      ],
    },
    missing_tvt_tables: {
      title: "TVT tables required",
      body: "TFRecord datasets are built from train/val/test snippet tables.",
      stepsLabel: "What to do:",
      steps: [
        "Run TVT tables (create-tvt-snippet-tables).",
        "If snippets are short, lower n_batch_* or batch_size.",
        "Then run create-tvt-data.",
      ],
    },
    missing_tvt_data: {
      title: "TVT datasets required",
      body: "Training and hpsearch read data_*.tfrecord from the TVT folder.",
      stepsLabel: "What to do:",
      steps: [
        "Run TVT datasets (create-tvt-data) to completion.",
        "Do not interrupt GZIP shard writes — otherwise train fails with inflate errors.",
        "After success, start training.",
      ],
    },
    missing_checkpoint: {
      title: "Trained checkpoint required",
      body: "Model testing needs a finished train step with weights on disk.",
      stepsLabel: "What to do:",
      steps: [
        "Run Training and wait until it is done.",
        "Confirm the model folder contains weights / a Keras file.",
        "Then run Testing.",
      ],
    },
    job_failed: {
      title: "Last run of this step failed",
      body: "A failed job left this step in error. Use the error banner above (if any) or the Jobs log.",
      stepsLabel: "What to do:",
      steps: [
        "Read the error banner or the job log.",
        "Fix the cause and press Run on this step again.",
        "If TVT is damaged, recreate create-tvt-data first.",
      ],
    },
    params_changed: {
      title: "Project parameters changed",
      body: "This step’s artifact was built with older parameters and is marked stale.",
      stepsLabel: "What to do:",
      steps: [
        "Re-run this step (and later ones if needed).",
        "Or restore previous parameter values if a rebuild is not wanted.",
        "Refresh the board after it finishes.",
      ],
    },
    params_changed_spectrogram: {
      title: "Spectrogram parameters changed",
      body: "nfft / window / hop no longer match how spectrograms were built.",
      stepsLabel: "What to do:",
      steps: [
        "Rebuild spectrograms (and usually labels → snippets → TVT).",
        "Or restore the previous spectrogram parameters.",
        "Do not train on stale spectrograms.",
      ],
    },
    params_changed_snippets: {
      title: "Snippet parameters changed",
      body: "Duration / filters / fraction_removal changed relative to the built snippets.",
      stepsLabel: "What to do:",
      steps: [
        "Rebuild the snippet table and TVT steps.",
        "Re-check n_batch_* after filtering.",
        "Then train again.",
      ],
    },
    upstream_changed: {
      title: "Previous step changed",
      body: "Upstream artifacts are newer than this step’s output — the result is stale.",
      stepsLabel: "What to do:",
      steps: [
        "Re-run this step.",
        "Continue down the chain until statuses are done again.",
        "Refresh the board if statuses do not catch up.",
      ],
    },
  },
};

export function isPipelineReasonId(value: string | null | undefined): value is PipelineReasonId {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(COPY.en, value);
}

export function pipelineReasonCopy(
  reason: PipelineReasonId,
  lang: "ru" | "en",
): PipelineReasonCopy {
  return COPY[lang][reason] ?? COPY.en.job_failed;
}

/**
 * Which pipeline step's Run button to highlight in manual mode
 * (instead of a long remediation banner). ``null`` = no board action
 * (e.g. fix data in Projects first).
 */
export function hintStepForPipelineReason(
  reason: PipelineReasonId,
  stepId: string,
): string | null {
  switch (reason) {
    case "missing_spectrograms":
      return "create-spectrograms";
    case "missing_label_arrays":
      return "create-label-arrays";
    case "missing_snippet_table":
      return "create-snippet-table";
    case "missing_tvt_tables":
      return "create-tvt-snippet-tables";
    case "missing_tvt_data":
      return "create-tvt-data";
    case "missing_checkpoint":
      return "train";
    case "missing_recording_table":
    case "no_recordings":
    case "no_annotations":
      return null;
    case "job_failed":
    case "params_changed":
    case "params_changed_spectrogram":
    case "params_changed_snippets":
    case "upstream_changed":
      return stepId;
    default:
      return stepId;
  }
}

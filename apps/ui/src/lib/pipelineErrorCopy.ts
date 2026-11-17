/** RU/EN copy tables for pipeline / train error kinds. */

import type { PipelineErrorCopy, PipelineErrorKind } from "./pipelineErrorExplain";

const COPY: Record<"ru" | "en", Record<PipelineErrorKind, Omit<PipelineErrorCopy, "kind">>> = {
  ru: {
    tvt_gzip_corrupt: {
      tone: "warn",
      title: "Повреждён датасет обучения (TVT / GZIP)",
      body: "TensorFlow не смог прочитать сжатые файлы data_*.tfrecord. Обычно так бывает после прерванного create-tvt-data или если compression_type в параметрах не совпадает с файлами на диске. Смена числа эпох тут ни при чём.",
      stepsLabel: "Что сделать:",
      steps: [
        "В конвейере перезапустите шаг «Создать TVT-данные» (create-tvt-data) до конца.",
        "Проверьте compression_type: то же значение, что при создании датасета (обычно GZIP).",
        "После успешного TVT снова запустите обучение (можно с новым числом эпох).",
      ],
    },
    cancelled: {
      tone: "warn",
      title: "Шаг остановлен пользователем",
      body: "Задача отменена до завершения. Частичные файлы могли остаться на диске и помечены как незавершённые — следующий запуск того же шага может вести себя нестабильно.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите этот шаг снова и дождитесь статуса «готово».",
        "Если ошибка повторится на train/test — сначала пересоздайте create-tvt-data.",
        "Лог отмены смотрите в разделе «Задачи».",
      ],
    },
    oom: {
      tone: "error",
      title: "Не хватило памяти",
      body: "Процесс исчерпал оперативную или GPU-память во время тяжёлого шага (TVT, обучение, поиск гиперпараметров).",
      stepsLabel: "Что сделать:",
      steps: [
        "Уменьшите batch_size и/или n_batch_train / n_batch_val в параметрах.",
        "На Главной переключите среду на CPU или закройте другие тяжёлые приложения.",
        "Перезапустите шаг; при повторном OOM — сократите длительность сниппетов или объём датасета.",
      ],
    },
    disk_full: {
      tone: "error",
      title: "На диске закончилось место",
      body: "Шаг не смог записать спектрограммы, TVT или чекпоинт: свободного места недостаточно.",
      stepsLabel: "Что сделать:",
      steps: [
        "Освободите место на томе проекта (удалите старые датасеты/модели или перенесите проект).",
        "Проверьте оценку диска в блоке готовности конвейера.",
        "Повторите шаг после появления запаса свободного места.",
      ],
    },
    snippets_shortage: {
      tone: "error",
      title: "Слишком мало сниппетов для запрошенных батчей",
      body: "Параметры n_batch_* × batch_size требуют больше сниппетов, чем есть в таблице после фильтрации orcAI.",
      stepsLabel: "Что сделать:",
      steps: [
        "Уменьшите n_batch_train / n_batch_val / n_batch_test или batch_size.",
        "Пересоздайте «TVT-таблицы сниппетов» (create-tvt-snippet-tables).",
        "При необходимости ослабьте fraction_removal / фильтры в параметрах и снова соберите таблицу сниппетов.",
      ],
    },
    call_weights: {
      tone: "error",
      title: "Веса классов не совпадают с метками",
      body: "Файл call weights и список calls в orcai_parameter расходятся (имена или порядок).",
      stepsLabel: "Что сделать:",
      steps: [
        "Откройте параметры проекта и сверьте список calls с файлом весов.",
        "Приведите порядок ключей весов к тому же порядку, что в orcai_parameter.",
        "Сохраните параметры и снова запустите обучение.",
      ],
    },
    missing_spectrogram: {
      tone: "error",
      title: "Нет спектрограмм для этого шага",
      body: "Движок не нашёл times.json (или спектрограмму) для записи. Обычно предыдущий шаг create-spectrograms не завершён или путь к данным другой.",
      stepsLabel: "Что сделать:",
      steps: [
        "Запустите «Создать спектрограммы» и дождитесь статуса «готово».",
        "Проверьте, что recording_table указывает на те же WAV, что в проекте.",
        "Затем повторите текущий шаг (метки / сниппеты).",
      ],
    },
    empty_spectrogram_selection: {
      tone: "error",
      title: "Нет записей для спектрограмм",
      body: "Все строки таблицы отфильтрованы: нет парных аннотаций и/или нет возможных классов. По умолчанию create-spectrograms не включает такие записи (как CLI без -en / -enp).",
      stepsLabel: "Что сделать:",
      steps: [
        "Добавьте парные .txt аннотации к WAV или обновите таблицу записей.",
        "Либо передайте в задачу include_not_annotated (-en) и/или include_no_possible_annotations (-enp).",
        "Повторите шаг «Создать спектрограммы» после исправления набора.",
      ],
    },
    missing_labels: {
      tone: "error",
      title: "Нет массивов меток",
      body: "Для части записей отсутствуют label-файлы (zarr/json). Сниппеты или TVT не могут собраться без create-label-arrays.",
      stepsLabel: "Что сделать:",
      steps: [
        "Убедитесь, что у записей есть аннотации и заполнена таблица записей.",
        "Запустите «Создать массивы меток» (create-label-arrays).",
        "После успеха снова запустите шаг, на котором была ошибка.",
      ],
    },
    already_exists: {
      tone: "warn",
      title: "Артефакт уже существует",
      body: "orcAI отказался перезаписать выходной файл или папку без флага overwrite.",
      stepsLabel: "Что сделать:",
      steps: [
        "В параметрах шага включите overwrite (перезапись) и запустите снова.",
        "Либо удалите старую папку артефакта через меню шага / Проводник.",
        "Для merge таблицы записей используйте обновление таблицы, а не слепое создание поверх.",
      ],
    },
    engine_sys_exit: {
      tone: "error",
      title: "Движок orcAI прервал шаг (sys.exit)",
      body: "Валидация внутри orcAI вызвала выход процесса. Часто это «выход уже существует» или некорректные пути — полный текст в логе задачи.",
      stepsLabel: "Что сделать:",
      steps: [
        "Откройте задачу в «Задачи» и прочитайте строки перед Error.",
        "Проверьте, что выходной путь свободен или включён overwrite.",
        "Исправьте параметр и повторите шаг.",
      ],
    },
    model_missing: {
      tone: "error",
      title: "Не найден чекпоинт модели",
      body: "Шаг test (или загрузка модели) не нашёл model_weights.h5 / Keras-файл в каталоге модели.",
      stepsLabel: "Что сделать:",
      steps: [
        "Убедитесь, что обучение завершилось со статусом «готово».",
        "Откройте папку моделей шага train и проверьте наличие чекпоинта.",
        "При необходимости заново запустите train, затем test.",
      ],
    },
    architecture: {
      tone: "error",
      title: "Несовместимая архитектура модели",
      body: "Параметры архитектуры (или hpsearch) не совпадают с ожидаемой моделью orcAI.",
      stepsLabel: "Что сделать:",
      steps: [
        "В параметрах проверьте поле architecture и блок model.",
        "Для hpsearch убедитесь, что выбран тот же тип модели (LSTM units и т.п.).",
        "Сохраните согласованные параметры и повторите шаг.",
      ],
    },
    cannot_mask_na: {
      tone: "error",
      title: "В таблице записей пустые маски классов",
      body: "В recording_table.csv колонки классов содержат пустые/NA значения. orcAI не может построить маски меток.",
      stepsLabel: "Что сделать:",
      steps: [
        "В Проектах обновите таблицу записей (или откройте CSV и заполните колонки классов True/False).",
        "Для строк с аннотацией все нужные классы должны быть True или явно False — не пусто.",
        "Снова запустите create-label-arrays.",
      ],
    },
    permission: {
      tone: "error",
      title: "Нет доступа к файлам проекта",
      body: "ОС отказала в чтении или записи по пути проекта (права, блокировка, внешний диск).",
      stepsLabel: "Что сделать:",
      steps: [
        "Проверьте права на папку проекта и что диск подключён.",
        "Закройте программы, которые держат те же файлы открытыми.",
        "Повторите шаг; при работе с сети/USB скопируйте проект локально.",
      ],
    },
    not_found: {
      tone: "error",
      title: "Файл или путь не найден",
      body: "Шаг ссылается на WAV, CSV, параметры или артефакт, которого нет по указанному пути.",
      stepsLabel: "Что сделать:",
      steps: [
        "Проверьте пути в параметрах и что предыдущие шаги конвейера в статусе «готово».",
        "Если файлы переносили — обновите таблицу записей и параметры.",
        "Повторите шаг после восстановления путей.",
      ],
    },
    shape_mismatch: {
      tone: "error",
      title: "Несовпадение формы спектрограммы",
      body: "Размерность спектрограммы не совпадает с ожидаемой моделью / n_filters. Часто после смены nfft или параметров спектрограммы без пересборки данных.",
      stepsLabel: "Что сделать:",
      steps: [
        "Верните параметры спектрограммы к тем, с которыми собирали датасет, либо пересоберите спектрограммы.",
        "Пометьте устаревшие шаги и прогоните цепочку заново до TVT.",
        "Затем снова train / test.",
      ],
    },
    generic: {
      tone: "error",
      title: "Шаг конвейера завершился с ошибкой",
      body: "Движок вернул ошибку, для которой нет отдельной подсказки. Ниже — технический текст; типичный порядок действий тот же.",
      stepsLabel: "Что сделать:",
      steps: [
        "Откройте задачу в разделе «Задачи» и просмотрите лог вокруг строки Error.",
        "Исправьте причину (параметры, данные, диск) и снова нажмите «Запуск» на этом шаге.",
        "Если падал train после отмены TVT — пересоздайте create-tvt-data, затем обучение.",
      ],
    },
  },
  en: {
    tvt_gzip_corrupt: {
      tone: "warn",
      title: "Training dataset is damaged (TVT / GZIP)",
      body: "TensorFlow could not read compressed data_*.tfrecord shards. This usually follows an interrupted create-tvt-data step, or a compression_type mismatch with files on disk. Changing the epoch count does not cause this.",
      stepsLabel: "What to do:",
      steps: [
        "On the pipeline board, re-run “Create TVT data” (create-tvt-data) to completion.",
        "In parameters, check compression_type matches how the dataset was written (usually GZIP).",
        "After TVT succeeds, start training again (you may change epochs).",
      ],
    },
    cancelled: {
      tone: "warn",
      title: "Step stopped by the user",
      body: "The job was cancelled before it finished. Partial files may remain and be marked incomplete — re-running the same step can be unstable until you complete a clean run.",
      stepsLabel: "What to do:",
      steps: [
        "Run this step again and wait until status is done.",
        "If train/test keeps failing afterwards, recreate create-tvt-data first.",
        "Check the cancel log under Jobs.",
      ],
    },
    oom: {
      tone: "error",
      title: "Out of memory",
      body: "The process ran out of RAM or GPU memory during a heavy step (TVT, training, or hyperparameter search).",
      stepsLabel: "What to do:",
      steps: [
        "Lower batch_size and/or n_batch_train / n_batch_val in parameters.",
        "On Home, switch the runtime to CPU or close other heavy apps.",
        "Re-run the step; if OOM persists, reduce snippet length or dataset size.",
      ],
    },
    disk_full: {
      tone: "error",
      title: "Disk is full",
      body: "The step could not write spectrograms, TVT shards, or a checkpoint because free space ran out.",
      stepsLabel: "What to do:",
      steps: [
        "Free space on the project volume (remove old datasets/models or move the project).",
        "Check the pipeline readiness disk estimate.",
        "Re-run the step once there is enough free space.",
      ],
    },
    snippets_shortage: {
      tone: "error",
      title: "Not enough snippets for the requested batches",
      body: "n_batch_* × batch_size asks for more snippets than remain after orcAI filtering.",
      stepsLabel: "What to do:",
      steps: [
        "Reduce n_batch_train / n_batch_val / n_batch_test or batch_size.",
        "Re-run “TVT snippet tables” (create-tvt-snippet-tables).",
        "If needed, relax fraction_removal / filters, then rebuild the snippet table.",
      ],
    },
    call_weights: {
      tone: "error",
      title: "Call weights do not match labels",
      body: "The call-weights file and the calls list in orcai_parameter disagree (names or order).",
      stepsLabel: "What to do:",
      steps: [
        "Open project parameters and compare calls with the weights file.",
        "Make weight keys follow the same order as in orcai_parameter.",
        "Save parameters and start training again.",
      ],
    },
    missing_spectrogram: {
      tone: "error",
      title: "Spectrograms missing for this step",
      body: "The engine could not find times.json (or a spectrogram) for a recording. Usually create-spectrograms did not finish, or data paths differ.",
      stepsLabel: "What to do:",
      steps: [
        "Run “Create spectrograms” and wait until it is done.",
        "Confirm recording_table points at the same WAVs as the project.",
        "Then re-run the current step (labels / snippets).",
      ],
    },
    empty_spectrogram_selection: {
      tone: "error",
      title: "No recordings left for spectrograms",
      body: "Every table row was filtered out: missing paired annotations and/or no possible classes. By default create-spectrograms skips those rows (same as CLI without -en / -enp).",
      stepsLabel: "What to do:",
      steps: [
        "Add paired .txt annotations for the WAVs, or refresh the recording table.",
        "Or pass include_not_annotated (-en) and/or include_no_possible_annotations (-enp) on the job.",
        "Re-run “Create spectrograms” after fixing the set.",
      ],
    },
    missing_labels: {
      tone: "error",
      title: "Label arrays missing",
      body: "Some recordings lack label files (zarr/json). Snippets or TVT cannot be built without create-label-arrays.",
      stepsLabel: "What to do:",
      steps: [
        "Ensure recordings have annotations and the recording table is filled.",
        "Run “Create label arrays” (create-label-arrays).",
        "After success, re-run the step that failed.",
      ],
    },
    already_exists: {
      tone: "warn",
      title: "Output already exists",
      body: "orcAI refused to overwrite an existing file or folder without overwrite enabled.",
      stepsLabel: "What to do:",
      steps: [
        "Enable overwrite for the step parameters and run again.",
        "Or delete the old artifact folder via the step menu / Finder.",
        "For recording-table merges, use table update instead of blind recreate.",
      ],
    },
    engine_sys_exit: {
      tone: "error",
      title: "orcAI engine aborted the step (sys.exit)",
      body: "Validation inside orcAI exited the process. Often the output already exists or a path is invalid — see the full job log.",
      stepsLabel: "What to do:",
      steps: [
        "Open the job under Jobs and read the lines before Error.",
        "Ensure the output path is free or overwrite is enabled.",
        "Fix the parameter and re-run the step.",
      ],
    },
    model_missing: {
      tone: "error",
      title: "Model checkpoint not found",
      body: "The test step (or model load) could not find model_weights.h5 / a Keras file in the model directory.",
      stepsLabel: "What to do:",
      steps: [
        "Confirm training finished with status done.",
        "Open the train step’s model folder and check for a checkpoint.",
        "If needed, re-run train, then test.",
      ],
    },
    architecture: {
      tone: "error",
      title: "Incompatible model architecture",
      body: "Architecture (or hpsearch) parameters do not match the model orcAI expects.",
      stepsLabel: "What to do:",
      steps: [
        "In parameters, check architecture and the model block.",
        "For hpsearch, use the same model type (LSTM units, etc.).",
        "Save consistent parameters and re-run the step.",
      ],
    },
    cannot_mask_na: {
      tone: "error",
      title: "Empty class masks in the recording table",
      body: "recording_table.csv has blank/NA values in class columns. orcAI cannot build label masks.",
      stepsLabel: "What to do:",
      steps: [
        "In Projects, refresh the recording table (or edit the CSV: class columns True/False).",
        "Rows with annotations must not leave class cells empty.",
        "Re-run create-label-arrays.",
      ],
    },
    permission: {
      tone: "error",
      title: "Permission denied on project files",
      body: "The OS refused to read or write a project path (permissions, lock, or external disk).",
      stepsLabel: "What to do:",
      steps: [
        "Check folder permissions and that the volume is mounted.",
        "Close apps that keep the same files open.",
        "Re-run the step; for network/USB disks, copy the project locally.",
      ],
    },
    not_found: {
      tone: "error",
      title: "File or path not found",
      body: "The step references a WAV, CSV, parameter file, or artifact that is missing at the given path.",
      stepsLabel: "What to do:",
      steps: [
        "Check parameter paths and that earlier pipeline steps are done.",
        "If files moved, refresh the recording table and parameters.",
        "Re-run the step after paths are restored.",
      ],
    },
    shape_mismatch: {
      tone: "error",
      title: "Spectrogram shape mismatch",
      body: "Spectrogram dimensions do not match the model / n_filters. Often follows changing nfft or spectrogram params without rebuilding data.",
      stepsLabel: "What to do:",
      steps: [
        "Restore spectrogram parameters used for the dataset, or rebuild spectrograms.",
        "Mark stale steps and re-run the chain through TVT.",
        "Then run train / test again.",
      ],
    },
    generic: {
      tone: "error",
      title: "Pipeline step failed",
      body: "The engine returned an error without a dedicated hint. The technical text is below; the usual recovery order still applies.",
      stepsLabel: "What to do:",
      steps: [
        "Open the job under Jobs and inspect the log around the Error line.",
        "Fix the cause (parameters, data, disk) and press Run on this step again.",
        "If train failed after a cancelled TVT, recreate create-tvt-data, then train.",
      ],
    },
  },
};


export function pipelineErrorCopy(
  kind: PipelineErrorKind,
  lang: "ru" | "en",
): PipelineErrorCopy {
  const block = COPY[lang][kind] ?? COPY.en.generic;
  return { kind, ...block };
}

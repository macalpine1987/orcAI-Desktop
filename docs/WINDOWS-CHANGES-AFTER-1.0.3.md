# Перенос правок macOS после 1.0.3

Инструкция для Cursor на Windows. Перенести поведение рабочей копии macOS, которая собрана как **1.0.4**, поверх опубликованного коммита **1.0.3**. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Источник на GitHub: https://github.com/macalpine1987/orcAI-Desktop  
База, от которой считаются эти правки: `cadbcc4f548e1d2928e17dddc9fb687b8f62c90a` (`Align the filter studio with the tab buttons and mark version 1.0.3.`).

Сами правки в git ещё не закоммичены. Смотреть рабочую копию macOS, а не `git show cadbcc4`. Не делать `git checkout` всего дерева.

Собранное приложение с этим поведением: `/tmp/orcAI Desktop.app`, версия в штампе 1.0.4, orcAI 3.0.4. На Windows номер версии не копировать.

Этот файл не входит в справку приложения. Его не класть в `docs/manual/` и не добавлять в `tauri.conf.json`. Тексты руководства, перечисленные ниже, переносить: они показываются в приложении.

Уже описано отдельно и сюда не входит:

- палитра спектрограммы и колбэк `on_test_batch_end` — `docs/WINDOWS-SPECTROGRAM-COLORMAPS.md` (macOS 1.0.2);
- отступы вкладки «Фильтрация» относительно кнопок «Параметры» и «Результаты» — `docs/WINDOWS-FILTER-ALIGNMENT.md` (macOS 1.0.3);
- **полный инвентарь façade-сплитов / perf / session** (audit #3–#13) — `docs/WINDOWS-CODE-OPTIMIZATION-INVENTORY.md` (пакет zip для Windows);
- точные тексты шапочного «сохранено» (factory reset / цель / параметры) — `docs/WINDOWS-SAVE-NOTICE-COPY.md` (кратко дублируется в §68).

§1–§17 — первая волна после 1.0.3. §18–§28 — аудит-этапы 1–10 (верность CLI, руководство, масштаб, память лога, гейт аннотаций, флаги `-n_uts`/`-pl`/`-dc`/`-rdf`/`-ep`) плюс потолок `ConfirmDialog` и `NUMBA_CACHE_DIR` для тестов. §29–§34 — отдельное окно монитора обучения, иконка B-Scope, советы в шапке, `excluded_calls` / unfiltered, вторая зачистка мёртвого кода, тексты руководства монитора. §35–§36 — рейка плана мастера на Главной (`active_plan`) и Vite-превью `/__preview/home-plan-rail`. §37 — панель классов вместо tools на Анализе. §38–§40 — доводка окна монитора. §41–§51 — полировка Анализа / спектрограммы (классы UI, resize, оверлеи, выравнивание с «Результаты», Home KPI, Hand idle). §52–§56 — сегменты / капсула файла / LCD. §57 + §60 — abort тайла, LRU/prefetch/warm соседей. §58 — советы без ИИ-штампов. §59 — ранняя редактура руководства; **актуальный RU/EN — §61** (revised + клавиши оболочки под macOS и Windows). §62–§66 — закрытие residual 1.0.4 (façades / ошибки / keep-alive / Predict session / LCD play-pause у «Позиция»). §67–§72 — полировка 2026-11-17: Help без рамки, тексты «сохранено», прогресс Lab dock, CSV-latches, капсула цели проекта, фикс редиректа keep-alive Predict при смене focus (см. также `WINDOWS-SAVE-NOTICE-COPY.md`). §73–§74 — сброс `-ow` при смене проекта; память красного playhead спектрограммы по `activeProjectId` (новый проект — с начала). §75–§76 — Hand-pan без mid-drag STFT; визуал indeterminate в Lab dock (статичные 30 %, без бегунка). §77–§80 — дожим `-ow` после пресета при смене проекта; вкладка «Анализ» только после predict + жёлтый пульс (без автоперехода); итог прогона в шапке; примечание в руководстве про полосы классов. §81 — кнопка «Зациклить»: music-style repeat (две stadium-стрелки); сброс — круг (CircularReset). §82 — тёмные Lab-прокрутки C/D; **обязательны прямые comma-селекторы** для `::-webkit-scrollbar` (не `:is(...)` — иначе полосы не видны в WKWebView и могут пропасть в WebView2). §83 — Фильтрация: кнопка «Применить фильтр» не уезжает влево при «Выполняется…».

## Не делать

- Не ставить версию Desktop в `1.0.4` и не менять номер в `package.json`, `apps/ui/package.json`, `src-tauri/Cargo.toml` / `Cargo.lock` / `tauri.conf.json`, README ради версии. На macOS эти файлы сдвинуты в основном из-за номера сборки. Исключение: для иконки окна монитора (§30) в `Cargo.toml` у `tauri` нужна feature `image-png` **без** смены номера пакета; в `tauri.conf.json` — только строки `resources` для PNG монитора, не bump `version`.
- Не копировать `scripts/build-macos-release.sh` и остальные скрипты сборки macOS.
- Не переносить мост WKWebView: `src-tauri/src/ui_http.rs`, команду `sidecar_http_exchange` в `src-tauri/src/lib.rs`, право `sidecar_http_exchange` в `src-tauri/permissions/allow-sidecar-control.toml`, очистку пула в `src-tauri/src/sidecar.rs`, `apps/ui/src/api/sidecarFetch.ts` и вызов `installSidecarFetchProxy()` в `apps/ui/src/main.tsx`. Это обход бага macOS WKWebView. На Windows WebView2 ходит в sidecar обычным `fetch`.
- Не переносить `macos_reveal_open_args` из `src-tauri/src/lib.rs`. На Windows «показать в папке» уже своё.
- Не форкать orcAI. Ключ JSON остаётся `n_overlap`.
- Не вводить `navAllowedForProjectKind` и `isRouteAllowedForProjectKind`. Разделы без проекта остаются видимыми.
- Не прятать полосу советов и не возвращать старые имена «Предупреждения о данных» / «Data health warnings». Имя настройки — **Отображать советы** / **Show tips**.
- Не менять подписи монитора **Loss** и **LR**.
- Не поднимать число потоков спектрограммы и не держать все разделы смонтированными.
- Не искать аннотацию по имени WAV, если в таблице есть `rel_annotation_path`.
- Не оставлять монитор обучения модалкой поверх Lab: на macOS модалка снята (§29).
- Не удалять `job_cancel.register` / `register_job_cancel` — живой путь отмены. Не трогать `record_prediction` и таблицу `predictions` (пишет runner). Не удалять `SpectrogramPage`, `fetchJobsQueue`, `PredictAnalysisSpectrogramPane` без отдельного запроса.

## 1. Задачи только активного проекта

Страница **Задачи** и блок недавних задач на **Главной** показывают задачи проекта, у которого есть и `activeProjectId`, и `projectDir`. Проекта нет — список пустой, запрос не уходит. Смена проекта очищает предыдущий список и выбор в нижней консоли.

«Очистить» удаляет историю только этого проекта и снимает его выполняющиеся задачи. Чужие проекты остаются. Задача без `params.project_dir` не попадает ни в один проект.

Сервер: `list_all_jobs(project_dir=...)` после чтения всей базы приложения и базы проекта оставляет строки с тем же нормализованным каталогом. При фильтре предварительный `limit` не применяется, иначе новые задачи другого проекта вытеснят нужные. Без `project_dir` список по-прежнему глобальный (для старта). `clear_jobs_history(project_dir)` уже фильтровал.

На Windows в сравнении путей привести `\` к `/` и снять хвостовые слэши. Регистр не менять: сервер сравнивает `Path.resolve()`.

Файлы:

- `apps/sidecar/src/orcai_desktop_sidecar/store.py`
- `apps/ui/src/jobs/JobsListContext.tsx`
- `apps/ui/src/hooks/useJobsList.ts`
- `apps/ui/src/pages/JobsPage.tsx`
- `apps/ui/src/lab/LabJobContext.tsx`
- `apps/ui/src/pages/home/HomeRecentJobs.tsx`
- `apps/ui/src/lib/jobProjectScope.ts`
- `apps/ui/public/locales/ru/ru.json`, `apps/ui/public/locales/en/en.json`
- `docs/manual/ru/07-tasks.md`, `docs/manual/en/07-tasks.md`
- тесты: `apps/sidecar/tests/test_jobs.py`, `apps/ui/src/jobs/JobsListContext.test.tsx`, `apps/ui/src/lib/jobProjectScope.test.ts`, `apps/ui/src/lib/sectionSubtitlesGate.test.ts`, `apps/ui/src/lib/p12JobsGate.test.ts`, `apps/ui/src/pages/home/HomeRecentJobs.test.tsx`

На Главной ссылка «все задачи» включается только когда движок готов и проект активен. Тест без проекта ждёт `.jobs-action-link--disabled`.

## 2. Разделы без активного проекта не нажимаются

Активный проект — это `activeProjectId` и `projectDir` вместе. Нет ни созданного, ни выбранного проекта — одно и то же.

Видимы, но не нажимаются: **Распознавание**, **Обучение**, **Модели**, **Результаты**, **Задачи**. Доступны: **Главная**, **Проекты**, **Настройки**, **Справка**. Маршрут `/spectrogram` этим правилом не закрывается.

Подсказка пункта меню: сначала «среда не запущена», затем «нужен проект» (`app.navRequiresProject`), затем прежний замок фокуса. Фокус «Распознавание» по-прежнему не пускает в Обучение, фокус «Обучение» не пускает в Распознавание. Палитра команд эти пять пунктов без проекта скрывает.

Файлы:

- `apps/ui/src/layout/navigation.ts`
- `apps/ui/src/components/RuntimeRouteGuard.tsx`
- `apps/ui/src/components/CommandPalette.tsx`
- `apps/ui/src/layout/AppShell.tsx`
- `apps/ui/src/pages/home/HomeQuickActions.tsx`
- `docs/manual/ru/01-home.md`, `docs/manual/ru/02-projects.md` и те же файлы `en`
- тест: `apps/ui/src/layout/navigation.test.ts`

## 3. Понятная ошибка чужого формата в шапке

Кнопка и перетаскивание в **Проектах** (записи и аннотации) и кнопка добавления в очереди распознавания сообщают о не-WAV и не-txt. Раньше лишние файлы пропадали молча. Верные файлы из той же порции по-прежнему импортируются.

Текст — полоса на всю ширину внутри `<header>` оболочки, под строкой марки. Держится, пока её не закроют («Скрыть») или пока не сменится маршрут. Полоса страницы `ps-hint-bar` тоже остаётся.

Сообщение подставляет настоящее имя файла, не пример вроде `song.mp3`. `*_predicted.txt` и `*_filtered.txt` получают отдельную фразу «сначала переименуйте». Содержимое `.txt` не проверяется. Английский текст sidecar про разрядность PCM не переписывать.

Файлы:

- `apps/ui/src/lib/importFormatNotice.ts`
- `apps/ui/src/lib/wavDrop.ts`
- `apps/ui/src/components/projects/useWavDropZone.ts`
- `apps/ui/src/components/projects/useAnnotationDropZone.ts`
- `apps/ui/src/pages/ProjectsPage.tsx`
- `apps/ui/src/hooks/usePredictQueue.ts`
- `apps/ui/src/ui/saveNotice.tsx`
- `apps/ui/src/layout/AppShell.tsx`
- `apps/ui/src/styles/instrument.css` (`.mat-shell-header-error`)
- локали `audioImport.wavOnlyOne`, `wavOnlyMany`, `txtOnlyOne`, `txtOnlyMany`
- тесты: `apps/ui/src/lib/importFormatNotice.test.ts` и затронутые тесты проектов

Ключ `projects.wizard.unsupportedFiles` по-прежнему не используется. Не подключать его вместо новых фраз.

## 4. Лампа «Записи без аннотаций»

На доске обучения пустой проект (нет WAV) не жёлтый: лампа `off`. У каждого WAV есть парный ручной `.txt` по имени — лампа зелёная, подпись остаётся «0 будут пропущены» / «{{count}} will be skipped». Пропуск есть — жёлтая лампа и положительное число. `*_predicted.txt` и `*_filtered.txt` не считаются аннотацией. Текст подписи не менять.

```python
def unlabeled_recordings_lamp(wav_count: int, paired_count: int) -> str:
    if wav_count <= 0:
        return "off"
    if paired_count == wav_count:
        return "ok"
    return "warn"
```

Файл: `apps/sidecar/src/orcai_desktop_sidecar/train_pipeline.py`. Тест: `apps/sidecar/tests/test_train_pipeline.py`.

Рядом на доске лампа таблицы записей: `recordings_table_lamp` и подпись через `apps/ui/src/lib/pipelineTableLamp.ts` (`tableStale`, `tableMissing`, `tableSub`, `tableEmpty`). Тест: `apps/ui/src/lib/pipelineTableLamp.test.ts`.

## 5. Шаг окна `n_overlap`

В мастере, на доске обучения, в строке спектрограммы дообучения и в `docs/manual/{ru,en}/04-train.md` это шаг окна (hop), не перекрытие. Ключ JSON остаётся `n_overlap`.

Сохранение параметров и сторож задачи принимают шаг больше нуля, в том числе шаг больше `nfft`. Отказ `n_overlap >= nfft` убрать. Целое больше нуля остаётся.

Сторож `apps/sidecar/src/orcai_desktop_sidecar/parameter_guard.py` до запуска orcAI отклоняет параметры, на которых движок падает:

- спектрограмма: `sampling_rate > 0`, `nfft > 0`, hop `n_overlap > 0`, `freq_range` от 0 и верх не выше Найквиста, квантили в (0, 1) и low < high;
- сниппеты: доля удаления и окно, внутри которого сниппет должен начинаться в train/val/test;
- обучение: связанные проверки `reject_train_parameter`.

Отсутствующий файл параметров orcAI открывает сам. Битый JSON останавливает задачу здесь. Файлы и команду в журнале сторож не переписывает.

Вызовы стоят в `apps/sidecar/src/orcai_desktop_sidecar/adapters/training.py` (`_reject_orcai_parameter`) перед шагами спектрограммы, сниппетов и обучения. Проверка сохранения — `project_studio.py`.

Тесты: `apps/sidecar/tests/test_parameter_guard.py`, `apps/sidecar/tests/test_project_studio.py`, `apps/ui/src/lib/windowHopLabel.test.ts`, `apps/ui/src/trainWizard/finetune.test.ts`.

## 6. Таблица аннотаций для label arrays

`annotation_table_skipping_missing_txt` в `adapters/training.py`. Если `-bda` спрятал бы отсутствующий `.txt` или у строки свой каталог, во временный CSV пишется копия таблицы. Исходный CSV проекта не меняется. Строка ищется по `rel_annotation_path`, не по имени WAV. Если каждый файл аннотации лежит в общем каталоге, возвращается `None` и остаётся исходная таблица с `-bda`.

Тест: `apps/sidecar/tests/test_label_array_annotation_base.py`.

## 7. Число сниппетов на шаге мастера

Строка шага 3 считает `available` по выборкам train/val/test: измеренный остаток после фильтра пустых, иначе оценку, которую хранит orcAI. Поле `total` по-прежнему включает пустые сниппеты, которые снимает `fraction_removal`. Тело запроса калькулятора и шага одно: `snippetCalculatorBody`.

Файлы: `apps/ui/src/trainWizard/snippetCalc.ts`, `apps/ui/src/trainWizard/TrainWizardSnippetCalcModal.tsx`, `apps/ui/src/trainWizard/TrainWizard.tsx`. Тест: `apps/ui/src/trainWizard/snippetCalc.test.ts`.

## 8. Формы числа в советах

Русские 1 / 2–4 / 5+ и английское единственное число для следующих шагов и советов о данных. Смысл фраз не менять. Ключи: `shellHealth.missingWav`, `unpairedAnn`, `annGap` и `projects.studio.nextStep.predict|train|create_tvt|annotate|filter`. У английских `_few` и `_many` тот же текст, что у `_other`, иначе сверка наборов ключей RU/EN падает. `sync_table` и `shellHealth.tableStale` без суффиксов.

Тест: `apps/ui/src/lib/countForms.test.ts`.

Подсказка настройки `settings.dataHealthBannerHint`: советы над содержимым раздела, не «в шапке» и не «в начале страницы». Полосу не переносить. Порядок в `AppShell.tsx`: шапка, затем внутри страницы баннер сброшенного проекта, баннер перезапуска, советы о данных, нехватка сниппетов. Тест: `apps/ui/src/lib/tipsHint.test.ts`.

## 9. Гистограмма фильтрации

Вкладка **Распознавание → Фильтрация**. Длительность — `stop − start` уже в секундах. Файл предсказаний пишется после перевода шагов в секунды, фильтр orcAI и предпросмотр вызывают `_check_duration` с `delta_t = 1`. Исходный `*_predicted.txt` не переписывается.

Предпросмотр отдаёт все длительности файла. Обрезку `durations[:4000]` убрать: иначе 95-й перцентиль и хвосты считаются не по всем сигналам.

Ось строится по 95-му перцентилю длительностей выбранного класса, не по пределам. Перцентиль — nearest-rank: конечные значения ≥ 0, индекс `ceil(p * n) - 1`. Шкала — наименьшее из `2, 4, 8, 12, 16, 20, 30`, которое не меньше этого числа. Пол 2 с, потолок 30 с. Пустые данные — 2 с. Пределы только красят колонки.

Ширина колонки — первая из `0.05, 0.1, 0.25, 0.5, 1, 2, 5`, которая даёт от 16 до 40 колонок. Пары: 2 с → 0.05×40, 4 с → 0.1×40, 8 с → 0.25×32, 12 с → 0.5×24, 16 с → 0.5×32, 20 с → 0.5×40, 30 с → 1×30. Под гистограммой эту ширину не подписывать: ни «Колонка 0.25 с», ни «Column 0.25 s». Её уже дают нижняя шкала и наведение на полоску. В легенде остаются только **Останется** / **Отсеется** (Kept / Dropped) с цветными квадратами. Свойства `columnLabel` у гистограммы нет. Ключ локали `histColumn` оставить, чтобы набор ключей RU/EN не разъехался, но в разметку его не выводить. Тест гистограммы проверяет, что текста «Колонка» / «Column» на экране нет.

Колонка полуоткрыта слева: значение ровно на внутренней границе попадает в колонку справа. Значение, равное концу шкалы, остаётся в последней колонке. Длиннее шкалы — два столбца: `(span, span×1.5]` и `(span×1.5, ∞)`. Пустой столбец скрыт. Ровно `span×1.5` остаётся в первом. Подпись второго — «{{from}} с и дольше».

Высота колонки — её число, делённое на максимум среди колонок и обоих хвостов. Слева шкала: верх — этот максимум, середина — `round(максимум / 2)`, низ — 0. При максимуме 0 одна риска 0, при 1 — риски 1 и 0.

Риски рисуются внутри тёмного поля, по краю колонок, не под рамкой. Горизонтальные слева на высоте числа. Вертикальные снизу на 0, 25, 50, 75 и 100 % шкалы. От каждой риски через колонки идёт линия, как сетка спектрограммы на тёмной палитре: `rgb(255 255 255 / 0.16)`, на весь стол и на всю ширину. Линия не перехватывает выделение. Короткая риска остаётся поверх неё. На шкалах 2…20 с эти доли попадают на края колонок. На шкале 30 с четвертные риски стоят на 7,5 и 22,5 с, посередине секундной колонки. Это известное место, отдельно не «чинить», если не просят.

Колонки без зазора (`gap: 0`), без скругления. Цвет отсечения `#a8845c`. Наведение на колонку: число и интервал, затем судьба, если число больше нуля.

Жест выделения не даёт оси перестроиться под курсором: родитель держит `pinnedSpan`, пока кнопка мыши нажата. Тонкое выделение остаётся закрытым интервалом шириной в одну колонку. «Без максимума» только если протяжка дошла до правого края (`HIST_OPEN_MAX_FRACTION = 0.98`). Шаг привязки равен ширине колонки. Вызовы без шага оставляют старую сетку 0.01 / 0.05 / 0.1 с.

Пока не нажато «Применить ко всем файлам», считается открытая запись. «Останется N из M детекций» в подвале — все классы этого предпросмотра, не сумма зелёного на гистограмме одного класса. Строка `default` пустая, если ноль классов или несколько делят это правило.

Файлы:

- `apps/ui/src/lib/callDurationLimits.ts`
- `apps/ui/src/components/PredictFilterHistogram.tsx`
- `apps/ui/src/components/PredictFilterStudio.tsx`
- `apps/sidecar/src/orcai_desktop_sidecar/adapters/filter_preview.py` — полный список `durations`
- `apps/ui/src/styles/predict-filter.css`
- локали `predict.filterStudio`: `histTailRange`, `histCount`, `histColumn`, `histLegendKeep`, `histLegendDrop`, `histBin`, `histFateKeep`, `histFateDrop`, `histFateMixed`. Старые `histScale` и `histTail` оставить: их требует сверка.
- тесты: `apps/ui/src/lib/callDurationLimits.test.ts`, `apps/ui/src/components/PredictFilterHistogram.test.tsx`, `apps/ui/src/lib/ek8PredictFilterGate.test.ts`

Предпросмотр sidecar (`filter_preview.py`) по-прежнему только читает файлы. Менять orcAI не нужно.

Переключатели **Применить ко всем файлам проекта** и **Перезаписать существующие _filtered.txt** остаются внутри рамки предпросмотра на узкой колонке, в том числе когда выбран класс `default`. У кнопки браузер держит текст в одну строку (`white-space: nowrap`), и длинная подпись вылезает из рамки. Снять это: `white-space: normal`, `min-width: 0`, `max-width: 100%`, выравнивание подписи по верху. Подпись (`.predict-filter-m05-switch-label`) переносится, `overflow-wrap: anywhere`.

Рамке предпросмотра нельзя ставить `overflow-x: clip`: вторая ось тоже становится обрезкой, и под переключателями срезается строка «Исходный файл не изменяется…». Сетка `.predict-filter-m05-grid` — `flex: 0 0 auto` и `min-height: min-content`. Колонка `.predict-filter-m05-right` и рамки `.predict-filter-m05-limits`, `.predict-filter-m05-side` — `overflow: visible` и `min-height: min-content`. Лишняя высота уходит в прокрутку страницы фильтра, не внутрь рамки. Это проверяет `ek8PredictFilterGate.test.ts`.

В режиме `default`, когда несколько классов делят это правило, под гистограммой остаётся только фраза «У этих классов нет своего предела…». Кнопки с именами классов под ней не рисовать (класса `.predict-filter-m05-shared-btn` нет). Класс по-прежнему выбирается в таблице слева.

Поле **Источник** под гистограммой — список файлов предсказаний. В пункте и в закрытой строке стоит полное имя файла (`basename`), с начала. Не резать его до 34 знаков и не оставлять хвост вида `..._predicted.txt`. `predictedDisplayName` в `PredictFilterStudio.tsx` возвращает только `basename`. Если имя длиннее поля, закрытый `<select>` сокращает конец: `text-align: left`, `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`. Подсказка `title` у списка — то же полное имя. Тест: длинное имя в `option` совпадает с именем файла и начинается с его начала (`PredictFilterStudio.test.tsx`).

## 10. Кнопка «Пример»

Было «Пример orcai-v1» / «orcAI-v1 example», класс `predict-filter-m05-tool is-quiet` (текст без рамки). Стало **Пример** / **Example**, класс `predict-filter-m05-tool is-outline`, как у **Сбросить**. Место прежнее: правый край строки кнопок, `margin-left: auto` на `.predict-filter-m05-example`.

При наведении и при фокусе — подсказка внутри `.predict-filter-m05-example`:

- RU: «Пример пределов длительности из публикации. Верхняя граница не задаётся.»
- EN: «Duration-limit example from the publication. Upper bounds stay open.»
- ссылка `https://doi.org/10.1111/mms.70083`, видимый текст `doi.org/10.1111/mms.70083`.

Ссылка открывается через `openExternalUrl` из `apps/ui/src/platform/openUrl.ts`, не голым переходом WebView. Щелчок по ссылке не подставляет пределы. Щелчок по кнопке по-прежнему подставляет `ORCAI_V1_PUBLICATION_LIMITS`, если классы файла — семь классов публикации. Иначе показывается `publicationNeedsBuiltin` уже со словом «Пример» / «example», без «orcai-v1» в имени кнопки.

Те же имена в `docs/manual/{ru,en}/03-predict.md` и `10-troubleshooting.md`.

Тесты: `PredictFilterStudio.test.tsx`, `ek8PredictFilterGate.test.ts`, `manualCopyGate.test.ts`.

## 11. Память вида спектрограммы

Анализ запоминает в `localStorage` (`orcai-spectrogram-view`, не больше 40 записей) начало окна, ширину, плейхед и выбранную детекцию. Громкость — отдельный ключ `orcai-spectrogram-volume`. Битые данные читаются как пустые. Это не настройка проекта и не тост сохранения.

**Актуально §74:** ключ записи — `activeProjectId + WAV path` (`spectrogramViewStorageKey`), без fallback на «голый» путь. Иначе новый проект с теми же файлами / keep-alive наследует чужой mid-file playhead.

Файлы: `apps/ui/src/lib/spectrogramViewMemory.ts`, `apps/ui/src/components/SpectrogramViewer.tsx` / `useSpectrogramFocusSelection.ts`. Тест: `apps/ui/src/lib/spectrogramViewMemory.test.ts`.

Кнопки транспорта анализа: `IconHand` и `IconCircularReset` размера 22. Сам знак сброса в `SpectrogramIcons.tsx` увеличен группой `translate(12 12) scale(1.5) translate(-12.66 -10.13)`, толщина обводки `1.45`. В CSS `.predict-results-stage .predict-results-tools-panel .predict-logic-studio-view-tools .predict-logic-transport-btn svg` — `1.4rem`. Подпись ползунка непрозрачности центрируется по дорожке, а не по всей рамке: у процента колонка шире значка. Тест `apps/ui/src/lib/studioAlign.test.ts` фиксирует размер 22 и `1.4rem`. Не уменьшать.

Кнопка **Справка** в шапках Главной, Проектов, Распознавания, Результатов, Моделей и мастера сдвинута так, чтобы стоять в 10 px от правого верхнего угла своей панели. Заголовки не двигать. Правило в `apps/ui/src/styles/studio.css`.

## 12. Канал записи до распознавания

Перед `predict` sidecar вызывает `reject_predict_channels` из `parameter_guard.py`. Канал меньше 1 или больше числа каналов WAV останавливает задачу до запуска orcAI. Один WAV берёт канал задачи. CSV берёт `channel` строки, пустая ячейка — канал задачи. Отсутствующий файл sidecar не отвергает: его сообщит orcAI. Текст ошибки английский: `Channel N is not in <имя> (K channel|channels)`.

Вызов стоит в `adapters/predict.py` сразу после `set_progress(job_id, 0.0)` и до `predict(**kwargs)`. Фейковый `0.05` / `0.02` не ставить — indeterminate до реальных тиков (§69).

## 13. Доска обучения: лампа таблицы, сбой шага, кэш

Лампа таблицы записей (`recordings_table_lamp`): зелёная только если таблица актуальна и в ней есть строки. Устаревшая таблица или отсутствующая при наличии WAV — жёлтая. Пустой проект — выключена, не «актуальна». Подпись через `pipelineTableDetailKey`: `tableStale`, `tableMissing`, `tableSub`, `tableEmpty`. Поле `readiness.recordings.sync` — `missing` | `stale` | `current`. Старый sidecar без поля оставляет прежнюю подпись по состоянию лампы.

Упавший шаг остаётся доступен для повтора. Шаги после него, кроме уже идущих и стоящих в очереди, не запускаются: `can_run` ложь, `run_block` = `upstream_failed`. После `hpsearch` следующие шаги не держатся. Подсказка кнопки — `pipeline.reason.upstream_failed`, она важнее обычной подсказки запуска.

Снимок доски живёт 4 секунды (`get_project_pipeline(..., fresh=False)`). `?fresh=true` и любое сохранение, запуск и возврат на доску запрашивают заново. Неудачное обновление оставляет предыдущий снимок. Интерфейс показывает последний снимок проекта сразу и не ставит «загрузка», если он уже есть.

Панель шагов: `overflow: hidden` и `scrollbar-gutter: stable`, как у тела параметров. Ширину полосы прокрутки через `offsetWidth - clientWidth` не измерять: накладная полоса даёт 0, и кнопка «Обновить» от этого не двигается.

Грубая оценка сниппетов `estimateSnippets` из `trainWizard/defaults.ts` удалена. Число на шаге мастера берётся только из раздела 7.

## 14. Счётчики проекта и следующие шаги

Четыре числа на Главной считают файлы на диске. Строки таблицы записей — не число WAV. Записи: `wav_count`. Аннотации: парные `.txt` по имени WAV в числителе, число WAV в знаменателе. Распознавание: то же знаменатель, если WAV есть. Отрицательное и нечисловое читается как 0. Старая сводка без `paired_files` оставляет пару annotated/total из таблицы.

Карточка аннотаций в Проектах (`readinessCardState`) зелёная, когда парных `.txt` больше нуля, и «нужно», когда WAV есть, а парных нет. Строка таблицы с чужим именем файла карточку не зелёнит. Поле `paired_files` отсутствует — остаётся состояние sidecar.

Список «Можно» на Главной (`_compute_next_actions`) не снимает распознавание после первого файла: пока есть WAV без предсказания, шаг `predict` остаётся, а если предсказание уже есть — рядом появляется `filter`. Неразмеченные WAV держат шаг `annotate`, даже если часть файлов уже размечена. Проекты этот список не читают: свои шаги строит `nextStepsFromSummary`. Там зазор аннотаций — WAV минус парные по имени. Шаги мастера требуют такой парный `.txt`.

Фокус «Обучение» уводит **открытую** страницу Распознавания на Главную (`predictNavInactiveForWorkspace` + `isPredictPath` — §72). Keep-alive Predict на чужом маршруте редирект не делает. Вид проекта по-прежнему пункты меню не прячет.

Файлы: `project_registry.py`, `apps/ui/src/lib/projectSummaryFormat.ts`, `apps/ui/src/lib/projectsStudio.ts`, `apps/ui/src/components/projects/ProjectReadinessPanel.tsx`, `apps/ui/src/pages/PredictPage.tsx`. Тесты: `projectSummaryFormat.test.ts`, `projectsStudio.test.ts`, `apps/sidecar/tests/test_projects.py`.

## 15. Не мигать уже показанным

Пока раздел открыт повторно, не прятать то, что уже загружено.

- Сводка проекта: один запрос на проект, ответ живёт 4 секунды. Повтор в этом окне берёт память. Явное обновление и «проект не найден» идут заново; при 404 слот стирается и активный проект снимается. Сервер на `GET /v1/projects/{id}/summary` держит тот же срок, `?fresh=true` его обходит.
- Результаты: `GET /v1/results/summary` тоже 4 секунды на пару каталог+источник. Страница хранит последний ответ и при смене источника не очищает таблицу до прихода нового, если снимок этой пары уже есть.
- Модели: список на каталог проекта 4 секунды. Страница сразу показывает сохранённый список. Импорт обновляет с `fresh`.
- Очередь распознавания: «загрузка» только пока списка ещё нет. Повторный обход диска уже показанную очередь не прячет (`shouldShowQueueLoading` и `rememberedQueueForProject`).

Кэши разделов — в памяти процесса. Это не настройка и не тост.

Файлы: `apps/sidecar/src/orcai_desktop_sidecar/main.py`, `apps/ui/src/hooks/useProjectSummary.ts`, `apps/ui/src/api/projects.ts`, `apps/ui/src/api/results.ts`, `apps/ui/src/pages/ResultsPage.tsx`, `apps/ui/src/api/models.ts`, `apps/ui/src/pages/ModelsPage.tsx`, `apps/ui/src/lib/predictQueueUi.ts`, `apps/ui/src/components/PredictParamsRunStudio.tsx`. Тесты: `useProjectSummary.test.ts`, `modelsCache.test.ts`, `predictQueueUi.test.ts`.

## 16. Прокрутка строки детекции

`scrollElementIntoScroller` и `revealElementInScrollers` живут в `apps/ui/src/lib/spectrogramDetections.ts`, отдельного модуля нет. Выбор метки на спектрограмме вызывает `revealElementInScrollers` из `SpectrogramDetectionsTable.tsx`.

Сначала строка выбранного типа центрируется в собственном скролле таблицы. Положение строки и высота липкой шапки — `offsetTop` и `offsetHeight`, не `getBoundingClientRect` и не деление на CSS zoom: при масштабе интерфейса прямоугольник и `scrollTop` в разных пикселях, и строка промахивается. Затем каждый внешний предок с вертикальной прокруткой (`overflow-y: auto | scroll | overlay` и `scrollHeight` больше `clientHeight`) сдвигается на минимум, чтобы строка попала в его видимую рамку. Здесь уже прямоугольники экрана, отступ 8 px. Студия Анализа (`.predict-results-studio`) — такой предок: таблица часто ниже сгиба, и одной внутренней прокрутки не видно. Если строка уже видна, внешний скролл не двигается. Окно и `documentElement` не трогать. `scrollIntoView` не вызывать. Полосу прокрутки через `offsetWidth - clientWidth` не измерять и высоты от `vh` не задавать.

Щелчок по метке на спектрограмме: если под курсором другая метка другого класса, выбирается она. Если перекрывающая метка того же класса, остаётся рамка, по которой пришёл щелчок, а не более короткая внутри неё. Код: `SpectrogramOverlay.tsx`, `hit.label !== seg.label`. Тест: `SpectrogramOverlay.test.tsx`.

Рядом те же детекции: `SpectrogramOverlay.tsx`, `SpectrogramDetectionsTable.tsx`. Тесты: `scrollElementIntoScroller.test.tsx` (строка ниже сгиба студии сдвигает её; уже видимая строка не сдвигает), `SpectrogramOverlay.test.tsx`.

В тестах интерфейса заглушены и `localStorage`, и `sessionStorage`. Оба очищаются перед каждым тестом.

## 17. Нажатие кнопки

У большинства кнопок не было видимого отклика: тень менялась только у `.mat-btn` и `.ps-btn`, и это почти не читалось. На Windows то же правило, в `apps/ui/src/styles/instrument.css`, вне `@layer`.

Пока кнопка удерживается (`button:active:not(:disabled)`), она опускается на 1 px и чуть уменьшается. Анимация `button-press`, 80 ms, `ease-out`, `forwards`:

- `translate: 0 1px`
- `scale: 0.985`

Свойства `translate` и `scale`, не `transform`. Кнопка, которая уже масштабируется или центрируется своим `transform`, это движение сохраняет. Поле спектрограммы с `role="button"` не трогать: это не `<button>`.

Если в системе выключена анимация (`prefers-reduced-motion: reduce`), анимации нет, остаётся только `translate: 0 1px`.

Кнопки параметров `.pp-btn` при нажатии ещё утапливают тень: `box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.45)` в `predict-params.css`.

Тест: `apps/ui/src/lib/buttonPress.test.ts`.

## Аудит-этапы 1–10 (верность CLI, руководство, масштаб, память)

Ниже — вторая волна правок после §1–§17. На macOS это этапы аудита **1 → 10** (находки 1–24 и П1–П3). Переносить целиком. Тексты руководства брать **после этапа 10** (в этапе 5 флаги `-n_uts` / `-pl` / `-ep` ещё описывались как отсутствующие; после этапа 10 в manual уже есть UI).

### 18. Таблица записей vs CLI (`fill_call_possibility`)

После `create-recording-table` Desktop по умолчанию сортирует CSV и заполняет колонки возможного присутствия классов (`_fill_call_possibility_columns`). Чистый `orcai create-recording-table` этого не делает.

Параметр задачи `fill_call_possibility` (default `True`). `False` — CLI-подобные ячейки NA, без Desktop-заполнения. Параметр **не** попадает в строку команды (`cli_command` снимает его).

Файлы: `apps/sidecar/.../adapters/helpers_cmd.py`, `cli_command.py`, `main.py` (CreateRecordingTableParams). Тесты: `tests/test_helpers_cmd.py`, `tests/test_p14_full_coverage.py`.

### 19. create-label-arrays / `-ce` без тихого identity

Убран тихий map `{класс: класс}` из `orcai_parameter.calls`.

- нет `-ce` и нет fallback → в orcAI уходит `None`, как у CLI без `-ce`;
- есть `call_equivalences_fallback` (мастер шлёт из `plan.ts`) → только этот словарь;
- путь `-ce` битый, fallback есть → fallback + запись в лог;
- путь битый, fallback нет → путь не подменяем, падает как у CLI;
- `call_equivalences_fallback` **не** попадает в CLI-строку.

Файлы: `adapters/training.py`, `cli_command.py`. Тест: `tests/test_label_array_annotation_base.py`. Happy path мастера с `call_equivalences.json` не ломать.

### 20. Спектрограммы / `-en` `-enp`

При нуле подходящих записей `create-spectrograms` больше не «успех с 0 файлами». Preflight зеркалит фильтры orcAI: без `-en` / `-enp` job падает с `No recordings left…` и подсказкой по флагам. Явные `include_not_annotated` / `include_no_possible_annotations` доходят до движка и в CLI-строку; default как у CLI — `False`, молча не включать. На доске ошибка — `empty_spectrogram_selection` (RU/EN в `pipelineErrorExplain`).

Отдельных UI-переключателей `-en`/`-enp` нет. Файлы: `adapters/training.py`, `pipelineErrorExplain.ts`. Тест: `tests/test_spectrogram_en_flags.py`.

### 21. Предпросмотр фильтра = orcAI `filter_predictions`

Preview вызывает тот же `filter_predictions` с `delta_t = 1`, что и Apply, **без** записи `*_filtered.txt`. Счётчики keep/drop совпадают с движком и с `filter_predictions_file` на fixture. Chrome Фильтрации и исходный `*_predicted.txt` не трогать.

Файл: `adapters/filter_preview.py`. Тесты: `tests/test_filter_preview.py`, `ek8PredictFilterGate.test.ts`.

### 22. Руководство ru/en (после этапов 5 и 10)

Базовый набор (UI флагов этапа 10) остаётся. **Актуальный RU — §61** (принятый revised); ранний проход §59 не копировать поверх §61. EN: меню **Jobs**, **Training Pipeline**, **Help & About**; Predictions без *recognise* / *recognition*; полный EN-текст — когда пришлют файл (см. §61).

Сохранять: фильтрация → `*_predicted_filtered.txt`; класс / тип / синоним; **Отображать советы**; `-n_uts` / `-pl` / `-dc`/`-rdf`/`-ep` в UI; автосинк `-dc 1` без `-rdf`/`-ep`. `manifest.json` — если на macOS не менялся, не трогать.

Тест: `manualCopyGate.test.ts`. Код приложения из этого пункта не менять сверх перечисленных файлов.

### 23. Строки UI: Тип, модель, футер фильтра `-v`

- Фильтр: подсказка default → «щелчок по строке таблицы» / click a class row (`histDefaultShared`).
- Анализ: колонка **Тип** без «ИИ» / «AI».
- Модалка: **Настройки модели** / Model settings; **Вид модели** / Model kind (не путать с Типом сигнала).
- Футер фильтра всегда показывает `-v` из Settings (как `createJob`).

Файлы: локали, `filterCliLine.ts`. Тесты: `filterCliLine.test.ts`, `ek8PredictFilterGate.test.ts`. Layout не трогать.

### 24. Масштаб Фильтрации (100/125)

Сетка и футер Apply завязаны на `@container studio-filter`, не на `@media` окна — корректно при CSS zoom 100/125%. Скролл только в теле; Apply закреплён; на оболочке фильтра `overflow: hidden` (без двойной прокрутки из `analysis-lab`). Герои на `vh` не переводить. Пресеты масштаба только 100/125.

Файлы: `predict-filter.css`, `analysis-lab.css` (оболочка). Тесты: `layoutScaleGate.test.ts`, `ek8PredictFilterGate.test.ts`.

### 25. Память лога задач и мёртвый код

**Лог задач:** хвост **8000** строк в sidecar (`JOB_LOG_MAX_LINES`, `log_base` + trim) и в UI (`jobLogTail` / SSE / merge). Абсолютные индексы растут через `log_base`; в памяти только хвост.

В `useJobLogTail`: курсор `sinceRef` для poll/SSE сдвигается до `setLines`, но окно `log_base` для `patchJobFromStream` и срез poll считаются по **pre-advance** курсору — иначе seed-строка затирается. Это обязательно перенести вместе с ring-buffer.

**OS locale:** удалены `detectSystemLocale*` / `platform/systemLocale.ts`. Первый запуск и factory reset по-прежнему `en`.

**shellMetaFrames:** убран неиспользуемый `pathname`; `shellMetaFramesVisible()` без аргументов (кадры всегда).

**П1/П2:** LRU тайлов 64 и SSE+poll **не** «оптимизировать вслепую» — на macOS не трогали.

Файлы: `jobs.py`, `main.py` (events), `jobLogTail.ts`, `jobEventStream.ts`, `useJobLogTail.ts`, `shellMetaFrames.ts`; удалить `systemLocale.ts` если есть. Тесты: `test_job_log_tail.py`, `jobLogTail.test.ts`, `jobEventStream.test.ts`, `useJobLogTail.test.tsx`, `shellMetaFrames.test.ts`.

### 26. Гейт пустого проекта / без аннотаций

`pipelineBlockedWithoutAnnotations` совпадает с Проектами: мастер и доска закрыты, пока нет **ни одной** парной `.txt` (0 WAV, WAV без txt, `null` summary/board). С ≥1 парой — открыты. Тексты `00` / `04` без исключения «на доске при нуле WAV кнопка ещё жива».

Файлы: `trainPipeline.ts`, `TrainWizard.tsx`, `PipelinePage.tsx` (если использует тот же гейт), manuals `00`/`04`. Тест: `trainPipeline.annotations.test.ts`.

### 27. Опциональные флаги CLI в UI

Только флаги, которые orcAI реально принимает:

| Флаг | Где |
|------|-----|
| `-n_uts` | Мастер: рядом с нефильтрованным тестом; пусто = default orcAI; в `create-tvt-snippet-tables` |
| `-pl` | Мастер (opt-in) и чекбокс шага hpsearch на доске; default выкл. |
| `-dc` / `-rdf` / `-ep` | Диалог «Обновить таблицу»; автосинк — `-dc 1` без `-rdf`/`-ep` |

Draft: `nUnfilteredTestSnippets`, `hpsearchParallel` в `trainWizard/types.ts` / `defaults.ts` / `plan.ts`. Конвейер: `PipelinePage` + `.pp-step-opt`. Sync: `sync_table_job_params`, `RefreshTableDialog`, `runProjectRecordingTableSync`. Локали + manuals `02`/`04`.

Тесты: `ek13QaPlan.test.ts`, `test_projects.py` (extras sync), CLI-строки в `cli_command` / p14.

**Диалог после этапа 10:** `ConfirmDialog` — потолок `max-h-[min(32rem,calc(100vh-3rem))]` и скролл тела (блок advanced выше). Перенести вместе с Refresh dialog.

### 28. Прогон sidecar-тестов: `NUMBA_CACHE_DIR`

В `scripts/run-sidecar-tests.sh` (если скрипт есть на Windows-ветке — аналог): не ставить `NUMBA_DISABLE_JIT=1` (ломает librosa). Если `NUMBA_CACHE_DIR` пуст — задать writable каталог (`%TEMP%\orcai-desktop-numba-cache` / `$TMPDIR/...`) и `mkdir`. Иначе в ограниченной FS numba падает с «no locator available» на librosa. На поведение `.exe` не влияет.

## Третья волна: монитор-окно, советы, зачистка

Ниже — правки после §18–§28. Переносить целиком вместе с файлами из рабочей копии macOS.

### 29. Монитор обучения — отдельное окно Tauri

Кнопка **Монитор** на доске конвейера больше не открывает модалку. Она создаёт/фокусирует дочернее окно label `train-monitor` (тот же `.exe` / процесс, не второй sidecar).

Поведение:

- URL маршрута `/train-monitor` **вне** `AppShell` (без сайдбара Lab).
- Главное окно можно свернуть/скрыть; монитор остаётся. Закрытие монитора (X) **уничтожает только это окно**, обучение не останавливает. Полный выход приложения гасит runtime как раньше.
- Размер открытия и минимум **1120×720** (выше CSS-порога `max-width: 1100px`, иначе KPI/mid складываются и появляются полосы прокрутки окна). Ниже этого размера окно не сжимается; при повторном фокусе старое меньшее окно поднимается до пола. Позиция/размер в `localStorage` ключ `orcai-desktop.train-monitor-window` (кламп к минимуму).
- Deep-link `?view=monitor` на Pipeline открывает окно и сбрасывает query на board.
- **Справка** в мониторе открывает `/help?topic=train.monitor` в окне `main` (`emitTo` + `useShellNavigateListener`), не внутри `train-monitor`.
- Данные: тот же `GET /v1/projects/{id}/train-monitor` + poll; `projectId` из workspace / `?project=`.

Критично для sidecar:

- Окно монитора монтирует тот же `SidecarProvider`. На старте Lab «сиротский» sidecar останавливается. **Дочернее окно не должно вызывать `sidecar_stop`.** В `SidecarContext`: если `!isMainShellWindow()` — `syncSidecarPortFromHost`, `userStartedRuntimeRef = true`, фазы running, `refresh`; autostart и hide/stop close-policy только у `main`.
- macOS hide-on-close в Rust — только `window.label() == "main"`. На Windows hide-on-close обычно нет, но проверку label всё равно держать, если политика общая. JS `onCloseRequested` со stop runtime — только main.

Файлы:

- `apps/ui/src/platform/shellWindow.ts` (новый)
- `apps/ui/src/platform/trainMonitorWindow.ts` (новый)
- `apps/ui/src/trainMonitor/TrainMonitor.tsx` — окно, не portal-модалка
- `apps/ui/src/App.tsx` — `<Route path="train-monitor" …>` до `AppShell`
- `apps/ui/src/pages/PipelinePage.tsx` — `openOrFocusTrainMonitorWindow`, без `<TrainMonitor open=…>`
- `apps/ui/src/sidecar/SidecarContext.tsx` — attach / close только main
- `apps/ui/src/styles/train-monitor.css` — `.tm-window` / `.tm-window-frame` вместо модалки
- `src-tauri/src/lib.rs` — hide только `main` (macOS)
- `src-tauri/capabilities/default.json` — окна `main` + `train-monitor`; права create/focus/destroy/set-icon/size/position и `core:webview:allow-create-webview-window`

Тесты: `apps/ui/src/lib/ek14TrainMonitorGate.test.ts`, `layoutScaleGate.test.ts` (без size-containment на frame).

Руководство: `docs/manual/ru/04-train.md` и `docs/manual/en/04-train.md`, раздел **Монитор обучения** / **Training monitor** (`{#monitor}`) — отдельное окно, свернуть/скрыть Lab, закрытие монитора ≠ стоп обучения. На Windows в тексте ориентироваться на свернуть / Alt+F4 / выход из приложения вместо ⌘W / ⌘Q (формулировки macOS в исходнике можно адаптировать локально, смысл тот же).

На Windows: WebView2 + `WebviewWindow` из `@tauri-apps/api/webviewWindow`. Сворачивание — штатная кнопка ОС. В панели задач может появиться отдельная плитка окна — это ожидаемо.

### 30. Иконка окна монитора (B-Scope)

Утверждённый макет: `docs/mockups/orcai-train-monitor-icon-B-scope-v2.png` (scope слева сверху, крупнее). Master после `prepare-app-icon-master` (углы прозрачные):

- `apps/ui/public/train-monitor-icon.png` — отдача из Vite / `frontendDist`
- `src-tauri/icons/train-monitor.png` и `train-monitor-128.png`
- `assets/train-monitor-icon.png` (эталон в дереве)

При create/focus окна: `setIcon` из байтов `/train-monitor-icon.png`, иначе путь `resourceDir/icons/train-monitor.png`.

Обязательно:

- `tauri = { version = "2", features = ["image-png"] }` (номер пакета не бампать);
- permission `core:window:allow-set-icon`;
- в `tauri.conf.json` → `bundle.resources`: оба PNG монитора.

На Windows иконка видна у окна / в панели задач чаще, чем отдельный значок Dock на macOS. Не подменять ею иконку всего `.exe`.

### 31. Советы / ошибки в шапке (`HeaderNotice`)

Полоса на всю ширину внутри `<header>` оболочки сменилась компактным chip справа в шапке: info / tip / error. Стили `header-notice.css`, компонент `HeaderNoticeChip`. Слот `HeaderNoticeSlot` в `AppShell`. Смысл настройки **Отображать советы** не менять; подсказка — советы в шапке приложения (см. manuals `08-settings`).

Файлы: `apps/ui/src/components/HeaderNoticeChip.tsx`, `apps/ui/src/ui/saveNotice.tsx`, `apps/ui/src/styles/header-notice.css`, `AppShell.tsx`, mockups `docs/mockups/orcai-header-notice-*.png` (ориентир). Тесты: `tipsHint.test.ts`, `ek4HomeGate.test.ts`, `saveNotice.test.tsx` если есть.

### 32. `excluded_calls` и Valid в параметрах

Валидация параметров отдаёт `excluded_calls` (классы, снятые из default `calls`). UI: треугольник / список через `parameterExcludedCalls.ts` (`splitParameterExcludedCalls`), не сырые строки `"… excluded from calls"` как единственный источник. Поле API `excluded_calls?` в `projects.ts`.

Файлы: sidecar validation в `project_studio` / parameters, `apps/ui/src/lib/parameterExcludedCalls.ts`, `ProjectParametersTab.tsx`. Тесты: `parameterExcludedCalls.test.ts`, `ek5ProjectsGate.test.ts`, `ProjectStudioExtras.test.tsx`.

### 33. Unfiltered в следующих шагах / сводке

`predicted` в сводке — число **уникальных WAV-stem**, у которых есть предсказание (не «файлов на диске»). Отдельно `unfiltered`: предсказания, которым ещё нужен `filter-predictions` (учёт mtime / устаревших `*_filtered` после повторного predict). Home `next_actions` и Projects `nextSteps` используют `unfiltered` для шага filter; полный цикл **не** требует filter для «готово».

Файлы: `project_registry.py` (`unfiltered` в summary / next_actions), `projectsStudio.ts`, локали `countForms` / nextStep. Тесты: `projectsStudio.test.ts`, `test_projects.py`, `countForms.test.ts`.

### 34. Вторая зачистка мёртвого кода

Удалить только то, что подтверждено неиспользуемым (как на macOS). Список:

**UI:** `PredictAdvancedSettingsFields.tsx`, `ThresholdSlider.tsx` (canvas с локальным ThresholdSlider не трогать), `fetchPredictionResults` + типы `PredictionResultItem` / `PredictionsListResponse` в `api/results.ts`; i18n ключи `header.layout|lab|layoutLabHint`, `settings.layout|layoutHint`, `common.mode|layout` (RU+EN). Ранее уже сняты Analysis Package / Profile orphans — не возвращать.

**Sidecar:** `set_auto_sync_recording_table` (запись auto_sync остаётся через `update_project`); `sync_keep_awake` (оставить `hold_keep_awake` / `release_keep_awake`); `engine_status` / `gpu_info` (оставить `engine_runtime_info` и поля `_gpu_*`); endpoint `GET /v1/results/predictions` и helpers `list_predictions` / `scan_label_files`. **Не** удалять `register` в `job_cancel` (импорт `register as register_job_cancel` в `jobs.py`).

Гейты ЭК после зачистки обновить под окно монитора, не под portal.

## Четвёртая волна: план мастера на Главной + панель классов

Ниже — правки после §29–§34. Переносить вместе с файлами из рабочей копии macOS.

### 35. Home · рейка плана мастера (`active_plan`)

На карточке **Текущий проект** (Главная) во время активного плана мастера обучения вместо четырёх KPI LCD показывается вертикальная рейка шагов того же `active_plan`, что и на доске конвейера. Ручные одиночные запуски шагов с Pipeline на Home **не** дублируются.

Поведение UI:

- Пара верхних карточек (Среда / Текущий проект) по высоте как раньше: `height: 100%` + `align-items: stretch` (**без** фиксированных 22.5rem). При `active_plan` ряд с `align-items: start` — рейка **не** растягивает «Среду»; в списке видно ~3 шага (`max-height: calc(3 * 1.4rem + 2 * 0.22rem + 0.35rem)`), остальные со скроллом.
- Пока есть `wizardPlanSteps.length > 0`: KPI скрыты, рейка на их месте. Заголовок «Мастер · выполняется / остановлен», ссылка **Конвейер →**, строки CLI-id (`create-tvt-data`, `train`, …) с пульсирующим LED у `running` и статусом (без progress-bar), футер `plan · done/total · без hpsearch` / `… · hpsearch`.
- Кнопка **Монитор** — в правом верхнем углу карточки (`position: absolute`), стиль как вкладка Pipeline (`predict-tab` + `RuntimeReadyLamp`). Включается по `isTrainMonitorEntryEnabled` / пульсирует по `isTrainMonitorLive` (шаг `train` running). Открывает то же дочернее окно `train-monitor` (§29), передаёт `projectId`.
- Синхронный пульс: карточка выставляет CSS `--home-wizard-pulse-delay` от `Date.now() % 1200`; LED running-шага и лампа Monitor используют одну анимацию `home-wizard-sync-pulse`. Отдельный LED у заголовка «Мастер · …» **нет**.
- `hpsearch` в рейке только если план его включил (`includes_hpsearch` / команда в `commands`).

Данные (боевой Home):

1. Хук `useHomeWizardPlan(activeProjectId)` при `online` sidecar вызывает `GET /v1/projects/{id}/pipeline` (`fetchProjectPipeline`).
2. Маппер `homeWizardPlanFromBoard` возвращает `null`, если нет `active_plan.plan_id` (ручной pipeline → KPI как раньше).
3. Иначе берёт `commands` плана (фильтр по `TRAIN_PIPELINE_STEP_IDS`) или fallback без optional `hpsearch`, статусы/progress — из `board.steps`.
4. Поллинг: **8 с** в простое, **2 с** пока `queued` или `running` у `active_plan` > 0. Ошибка запроса не сбрасывает последний board.

`HomePage` передаёт в `HomeProjectCard`: `projectId`, `wizardPlanSteps`, `wizardPlanFoot`.

Файлы (новые):

- `apps/ui/src/pages/home/HomeWizardPlanRail.tsx`
- `apps/ui/src/lib/homeWizardPlan.ts`
- `apps/ui/src/lib/homeWizardPlan.test.ts`
- `apps/ui/src/hooks/useHomeWizardPlan.ts`
- `apps/ui/src/lib/trainMonitorAvailability.ts` (+ `trainMonitorAvailability.test.ts`, если ещё нет на ветке)
- макеты-ориентиры: `docs/mockups/orcai-home-pipeline-B-plan-rail.png`, `orcai-home-pipeline-B-plan-rail-live.html`, `orcai-home-full-with-plan-rail-live.html` (в приложение не класть)

Файлы (правка):

- `apps/ui/src/pages/HomePage.tsx` — `useHomeWizardPlan` + props карточки
- `apps/ui/src/pages/home/HomeProjectCard.tsx` — рейка / KPI / Monitor / pulse
- `apps/ui/src/pages/home/HomeProjectCard.test.tsx`
- `apps/ui/src/styles/home.css` — парные карточки `height: 100%` (не 22.5rem); при плане `align-items: start` + скролл списка на ~3 шага; Monitor absolute, sync-pulse
- `apps/ui/public/locales/{ru,en}/*.json` — ключи `home.wizardPlan*`
- `apps/ui/src/lib/ek4HomeGate.test.ts` — гейт: `useHomeWizardPlan`, `wizardPlanSteps`, `HomeWizardPlanRail`, `home-project-monitor-btn`
- API уже содержит `PipelineActivePlan` / `active_plan` в `apps/ui/src/api/projects.ts` — не дублировать тип; убедиться, что поля `commands?` и `includes_hpsearch?` есть

Не делать:

- Не показывать на Home всю доску из 8 шагов без `active_plan`.
- Не ставить кнопку Monitor в ряд с именем проекта / в футер.
- Не оставлять KPI рядом с рейкой.
- Не тянуть отдельный sidecar endpoint — только существующий `/pipeline`.

### 36. Dev-превью рейки (`/__preview/home-plan-rail`)

Маршрут Vite Lab **без** runtime-guard: `isRuntimeFreePath("/__preview/home-plan-rail")`. Рендерит те же `HomeProjectCard` + `HomeWizardPlanRail` с демо-шагами и переключателем idle / running. В сайдбар **не** добавлять. `AppShell` для этого path включает home-studio chrome (как `/`).

Файлы:

- `apps/ui/src/pages/home/HomePlanRailPreviewPage.tsx` (новый)
- `apps/ui/src/App.tsx` — `<Route path="__preview/home-plan-rail" …>`
- `apps/ui/src/lib/appAccess.ts` + `appAccess.test.ts`
- `apps/ui/src/layout/AppShell.tsx` — `homeStudio` включает preview path
- стили баннера превью в `home.css` (`.home-plan-rail-preview-*`)

На Windows превью нужно только для сверки UI в `npm run ui:dev`; в релизе `.exe` маршрут может остаться (как на macOS) — он не в меню.

### 37. Анализ · панель классов вместо tools

На вкладке **Анализ** при включённой спектрограмме кнопка **Классы** на рейке сегментов подменяет верхнюю панель плеера (transport / LCD / zoom) горизонтальной панелью фильтра: чипы классов сразу слева (без заголовка «Классы» и общего счётчика; сетка до 6 колонок, остальное на следующую строку; два ряда в высоту chrome без скролла; вертикальный скролл только с 3-й строки, когда 2-я уже заполнена; рамки чипов `border-radius: 0.55rem`), вероятность, отображение Подписи/Метки, сброс. Внешняя рамка панели — те же padding / `min-height` / `--prs-ctrl`, что у плеера (без ужатия `3.85rem`).

Размер тайла спектрограммы берётся из layout-px (деление `getBoundingClientRect` на CSS `zoom`), с debounce/quantize ResizeObserver: иначе при UI 125% и усадке flex-лейаута первый STFT обрывался и запрашивался заново крупнее — спектр «долго грузился». Правая рейка **Классы** у спектра **не показывается** — фильтр только через эту кнопку (модалка без спектрограммы). Кнопка становится **Плеер** (без оранжевой подсветки; цветная иконка play в круге — `IconPlayerReturn`, макет `docs/mockups/orcai-player-play-circle-icon-mockup.jpg`) и возвращает transport.

Кнопка **Классы** стоит сразу после палитры спектрограммы (не у счётчика сегмента); иконка цветная (`IconClassesColored`). Слоты плеера снова прямые дети grid панели (как v1.0.3) — без `display: contents`, иначе WebKit ломает масштаб transport. Спектр в `is-single-plot` с chrome-рамкой и узкой правой рейкой-терминатором (0.4rem), без боковой панели классов. LCD Анализ: позиция / длина / канал — одно окно `.predict-logic-lcd--m04` (не три отдельные пластины).

Файлы: `PredictResultsClassesToolsPanel.tsx` (новый), `PredictResultsToolbar.tsx`, `PredictResultsTabPanel.tsx`, `SpectrogramViewer.tsx`, `SpectrogramFileSegmentRail.tsx`, `PredictAnalysisSpectrogramPane.tsx`, `PredictSpectrogramPanel.tsx`, `SpectrogramIcons.tsx` (`IconPlayerReturn`, `IconClassesColored`), `analysis-lab.css`, локали `predict.results.classesTools*` / `playerTools*`. Макет: `docs/mockups/analysis-classes-tools-panel-live.html`.

### 38. Монитор · без вспышки «Sidecar URL is not bound»

Дочернее окно `train-monitor` при старте очищает `runtimeBase`, потом заново цепляется к порту Lab (`SidecarContext`). Первый `GET …/train-monitor` раньше шёл до bind и показывал `PipelineErrorAlert` с текстом *Sidecar URL is not bound yet…*, а через ~1 с poll уже успевал. Теперь загрузка и poll ждут `sidecarPhase === "running"` и `hasRuntimeSidecarBase()`; эта же строка в `catch` не поднимается в алерт.

Файл: `apps/ui/src/trainMonitor/TrainMonitor.tsx`. Гейт: `ek14TrainMonitorGate.test.ts`.

### 39. Заголовок окна монитора — всегда `orcAI - train`

OS-title окна не меняется по языку, фазе («идёт» / running) или имени модели/проекта. Константа `TRAIN_MONITOR_WINDOW_TITLE` в `trainMonitorWindow.ts`; `TrainMonitor` больше не вызывает `setTitle`.

### 40. Монитор · без крестика в шапке

Внутри окна нет `ModalCloseButton` — закрытие штатным chrome ОС (macOS traffic light / Windows ✕). Escape и `closeTrainMonitorWindow` остаются для web/deep-link.

### 41. Анализ · Классы / Плеер отдельно от палитры

Кнопки **Классы** / **Плеер** и выбор палитры спектрограммы — **две независимые рамки** на рейке сегментов (не общая «сегментированная» капсула как Исходные/Фильтр). Палитра слева (`.analysis-segment-rail-studio-cmap`), режим Классы/Плеер справа в своей рамке (`.analysis-segment-rail-studio-mode`). Между ними зазор; у палитры справа от имени — маленький треугольник вниз (`.analysis-segment-rail-studio-cmap-caret`), меню открывается вниз.

Файлы: `SpectrogramFileSegmentRail.tsx` (+test), `analysis-lab.css`.

### 42. Панель классов · без полос количества, белые квадраты

В горизонтальной панели классов (§37) **нет** полос/баров «доли» количества детекций у чипов. Чекбокс: снятый класс **с** детекциями — белый квадрат без галочки; класс **без** детекций — тёмный квадрат. Подписи **Вероятность** / **Отображение** в `--prs-tools-pad-top` через общий absolute-блок (одинаковые `top: … + 0.34rem`, `font-size: 9px`, `height: 0.7rem`); не `margin-top` на колонке. У `.prob` / `.display` — `align-self: flex-start` (общий верх → «Вероятность» и «Отображение» на одной линии), `padding-top: 0.48rem` + `gap: 0.2rem` — шкала вероятности и тумблеры Подписи/Метки опущены вместе. LCD у Вероятности тем же кеглем/высотой строки, что заголовок. Thumb ≈ switch. Ряд `align-items: stretch`, chips-wrap `height: 100%` — viewport чипов на всю высоту chrome (~2 ряда); скролл только с 3-го ряда. Высота chrome = плееру: `--prs-tools-chrome-h`.

Файлы: `PredictResultsClassesToolsPanel.tsx`, `PredictResultsClassSidebar.tsx` (+tests), `analysis-lab.css`, гейт `ek7PredictResultsGate.test.ts`.

### 43. Анализ · таблица детекций растёт, спектрограмма с потолком

Спектрограмма в студии: `flex: 0 0 auto`, высота `min(32rem, 48cqh)` (раньше 52cqh — оставляло только ~2 строки таблицы на стартовом окне). Таблица детекций: `flex: 1 1 auto`, `min-height` на ≥3 строки (`--studio-det-row`), `max-height: none` — забирает остаток колонки на fullscreen, не давит спектрограмму. Гейты: `layoutScaleGate.test.ts`, `ek7PredictResultsGate.test.ts` — строки `48cqh` / `28cqh`.

Файлы: `analysis-lab.css`, гейты выше.

### 44. Спектрограмма · быстрый maximize / resize тайла

Потолок растра STFT по высоте: `SPECTROGRAM_TILE_MAX_HEIGHT_PX = 320` (+ шаг квантования высоты тайла). CSS растягивает bitmap; maximize не ждёт высокий re-encode. Ширина по-прежнему с `SPECTROGRAM_TILE_MAX_WIDTH_PX = 2048`. ResizeObserver → layout-px (`spectrogramPlotLayoutSize` / UI zoom) + debounce ~220 ms + quantize ширины/высоты plot — без abort-шторма. Пока новый тайл грузится, старый кадр остаётся на экране (без чёрных вспышек).

Файлы: `spectrogramView.ts` (+test), `SpectrogramViewer.tsx`, `ek7PredictResultsGate.test.ts`.

### 45. Спектрограмма · без белых полей при смене разрешения

В studio canvas и ось частоты получают `fillContainer`: CSS `height: 100%` / `align-self: stretch`, пока ResizeObserver/debounce догоняет размер. Цепочка `.analysis-spectrogram-canvas` / `stage` / `media` / `[data-spectrogram-plot]` — `height: 100%`. Фон не светится пустыми полосами при растягивании окна / UI scale.

Файлы: `SpectrogramColormapCanvas.tsx` (+test), `SpectrogramFrequencyAxis.tsx`, `SpectrogramViewer.tsx`, `analysis-lab.css`.

### 46. Вертикальные зазоры chrome Анализа

`--prs-chrome-stack-gap: 0.4rem` — segment↔plot и plot↔table (одинаково; спектрограмма не «прилипает» к сегментам). `--prs-tools-segment-gap: 0.4rem` у `.predict-results-segment-panel` (`margin-top`) — тот же шаг. Без нижнего margin у сегмента. Нижний padding сцены `0.4rem`. В `is-table-hero` сегмент без лишнего bottom margin; таблица с `stack-gap` сверху.

Файл: `analysis-lab.css`.

### 47. Оверлеи классов · живой CSS-бокс

`SpectrogramOverlay` больше не залипает на квантованном `layoutSize` (размер STFT). Всегда ResizeObserver по host (+ parent); `layoutSize` — только first-paint / jsdom hint. Хелпер `spectrogramOverlayBoxSize(measured, layoutHint)` в `spectrogramView.ts`: live box важнее stale hint (иначе при `fillContainer` полосы классов толстеют из‑за cap 32px в `labelBandLayout`). Атрибуты `data-overlay-layout-w/h` для тестов.

Файлы: `SpectrogramOverlay.tsx` (+test), `spectrogramView.ts` (+test).

### 48. Playhead seek во время воспроизведения

Перетаскивание playhead / клик по спектрограмме обновляет `audio.currentTime` и во время play (не блокировать seek веткой `if (playing) return`). Тест в `SpectrogramAudioPlayer.test.tsx`.

Файлы: `SpectrogramAudioPlayer.tsx`, `SpectrogramAudioPlayer.test.tsx`, при необходимости `SpectrogramViewer.tsx`.

### 49. Анализ · выравнивание с кнопкой «Результаты»

Правый край плеера/классов, спектрограммы и таблицы на одной линии с кнопкой **Результаты** (как Фильтрация в `WINDOWS-FILTER-ALIGNMENT.md`). У `.predict-results-stage`:  
`padding: 0 var(--pp-params-scroll-pad-end, 8px) 0.4rem 0`.  
Левый край совпадает с вкладками (лишнего left pad нет). У `.predict-results-studio` — `scrollbar-gutter: auto` (не `stable`: иначе plot уезжал левее кнопки). Кнопка по-прежнему с `margin-right: var(--pp-params-scroll-pad-end, 8px)` в `predict-params.css` — не менять.

Файлы: `analysis-lab.css`, тест `studioAlign.test.ts` («aligns Analysis chrome with the Results button»).

У `.predict-results-stage` фон **transparent** (не `#1a1a1a` — иначе вокруг плеера / сегмента / спектра / таблицы читалась вторая серая «рамка» внутри studio-panel). У спектрограммы в студии один rim: без `inset 0 0 0 1px`. Таблица детекций — тот же `--prs-chrome-border` / radius, что у chrome.

### 50. Главная · округлее KPI «Текущий проект»

Рамки LCD **Записи** / **Аннотации** / **Распознано** / **Модель**: `border-radius: 0.75rem` у `.home-project-metric` (было 8px).

Файл: `apps/ui/src/styles/home.css`.

### 51. Hand idle · не белый

Кнопка «Рука» в ненажатом состоянии без заливки `#f2f2f2` и без `drop-shadow`; обводка глифа `strokeWidth: 1.45` как у сброса. Зафиксировано в `studioAlign.test.ts`.

Файлы: `SpectrogramIcons.tsx`, `SpectrogramAudioPlayer.tsx`, `analysis-lab.css`, `studioAlign.test.ts`.

### 52. Анализ · сегменты — залитые треугольники (вариант A)

Кнопки prev/next **сегмента** больше не используют контурные `IconChevronLeft` / `IconChevronRight`. Новые глифы `IconSegmentPrev` / `IconSegmentNext` — один залитый треугольник (`fill: currentColor`, `stroke: none`), как на макете option A.

Места: рейка `SpectrogramFileSegmentRail` (`.analysis-segment-rail-studio-nav` — **одна** капсула `border-radius: 0.75rem`, кнопки встык с `border-left`, без `gap: 0.5rem`) и сегментный транспорт в `SpectrogramToolbar`. Prev/next **файла** на вкладке Фильтрации (`PredictFilterTrackToolbar`) по-прежнему контурные шевроны — не трогать.

Макет: `docs/mockups/segment-nav-filled-triangles-mockup.png`.

Файлы: `SpectrogramIcons.tsx`, `SpectrogramFileSegmentRail.tsx`, `SpectrogramToolbar.tsx`, тесты `SpectrogramFileSegmentRail.test.tsx`.

### 53. Анализ · имя файла + prev/next записи + ▼ в одной капсуле

На рейке Анализа убраны отдельный блок `.analysis-segment-rail-studio-filenav` и кнопка `.analysis-segment-rail-studio-filemenu` (`IconAudioFiles`). Вместо них одна рамка `.analysis-segment-rail-studio-fileframe` в стиле «Исходные/Фильтр» (`border #3a3a3c`, `border-radius: 0.75rem`, фон `#1c1d1e`):

`[ ◀ ][ 〰 имя.wav ▼ ][ ▶ ]`

- ◀ / ▶ — `IconSegmentPrev` / `IconSegmentNext` (предыдущая / следующая запись), классы `.analysis-segment-rail-studio-fileframe-nav`
- середина — кнопка `.analysis-segment-rail-studio-fileframe-main`: волна + имя + ▼ `IconSegmentDown` (залитый треугольник того же дизайна, что `IconSegmentPrev` / `IconSegmentNext`, класс `.fileframe-caret`); клик = `onFileMenuToggle`. Палитра спектрограммы по-прежнему с CSS `.cmap-caret`
- открытое состояние: `is-open` / `aria-expanded`, подсветка как у нажатого label (зелёный LCD)
- список записей — **выпадающий** `.analysis-segment-rail-studio-filemenu-list` под рамкой (как `.analysis-segment-rail-studio-cmap-menu`), не модалка `PredictResultsFilePickerModal`. Закрытие: выбор строки, клик снаружи, Escape (`onFileMenuClose`). В `PredictResultsTabPanel` модалку для Анализа **не** монтировать. На Фильтрации `PredictResultsFilePickerModal` пока оставить

Рамка `.fileframe-wrap` — **фиксированная** `flex: 0 0 18rem` / `width: 18rem` (имя только ellipsis, не сужает и не растягивает капсулу). ▶ всегда сразу перед частотой; `Исходные/Фильтр` — `margin-left: auto` у `.labels`. Обёртка `position: relative` (у капсулы `overflow: hidden` для скругления).

Список под рамкой: у `.analysis-segment-rail-studio-file` / `-head` / rail — `overflow: visible` (иначе клип в полосе 40px); у `.predict-results-segment-panel` — `position: relative; z-index: 5`, чтобы меню рисовалось поверх спектрограммы.

Макет: `docs/mockups/analysis-file-picker-combined-frame-mockup.png`.

Файлы: `SpectrogramFileSegmentRail.tsx`, `SpectrogramViewer.tsx`, `PredictAnalysisSpectrogramPane.tsx`, `PredictSpectrogramPanel.tsx`, `PredictResultsTabPanel.tsx`, `analysis-lab.css`, тесты `SpectrogramFileSegmentRail.test.tsx`, `studioAlign.test.ts`, `ek7PredictResultsGate.test.ts`.

### 54. Анализ · порядок слева: рамка → частота → Исходные/Фильтр

В `.analysis-segment-rail-studio-file` порядок DOM: **fileframe** (фикс. 18rem) → **fileMeta** сразу после ▶ → капсула **Исходные/Фильтр** (`margin-left: auto` у `.labels`) → (в table-hero) кнопка классов. Длина имени трека рамку и позицию ▶/частоты не меняет.

Файлы: `SpectrogramFileSegmentRail.tsx`, `analysis-lab.css`, тест «orders fileframe → rate meta → Исходные/Фильтр».

### 55. Анализ · LCD без миллисекунд

`formatStudioLcdClock` — целые секунды (`04:47`, не `04:47.000`). Размер LCD (`min-width: 22rem`, высота chrome) не менять; `.predict-logic-lcd-panel-value` — `width: 100%` + `text-align: center`.

Файлы: `spectrogramPlayer.ts` (+test), `analysis-lab.css`, `SpectrogramAudioPlayer.test.tsx`.

### 56. Анализ · LCD индикатор play/pause у позиции

Перед значением **Позиция** (не **Длина**) в m04 LCD: зелёный ▶ (`IconPlay`) при воспроизведении, ‖ (`IconPause`) на паузе. **Stop** и конец файла/окна снимают глиф (`lcdTransport: idle`). «Длина» и «Канал» без глифа. `data-lcd-transport` на корне LCD.

Глиф — **оверлей** (`position: absolute` у `.predict-logic-lcd-transport`), цифры MM:SS остаются по центру колонки (без резерва flex-gap / `visibility:hidden` слота). Актуальное поведение и тесты — также §66.

Файлы: `SpectrogramLogicLcd.tsx`, `SpectrogramAudioPlayer.tsx` (+tests), `analysis-lab-filter.css` (или barrel `analysis-lab.css`).

### 57. Спектрограмма · меньше работы после abort тайла

`SpectrogramColormapCanvas`: если эффект уже aborted после `fetchSpectrogramTileBlob`, **не** вызывать `createImageBitmap` (нет лишнего decode/RGBA). При позднем bitmap — по-прежнему `bitmap.close()` в `finally`. На cleanup эффекта `grayRef = null`, чтобы не держать буфер тайла после unmount.

Файлы: `SpectrogramColormapCanvas.tsx` (+test).

### 60. Спектрограмма · LRU тайлов, общий in-flight, prefetch и warm соседей

После §44 / §57: меньше повторной сети и decode при pan/zoom и смене записи.

Поведение:

- `spectrogramTileCache.ts`: LRU **64** записи (`SPECTROGRAM_TILE_CACHE_MAX_ENTRIES`); ключ без cache-bust `_`/`v`; общий `inflight` — pan-prefetch и UI делят один `fetch`; abort сети только когда уходит **последний** waiter; `invalidateSpectrogramTileCache` поднимает generation и abort’ит in-flight.
- `prefetchSpectrogramTileBlob(url)` — fire-and-forget warm LRU (ошибки глотаются).
- `SpectrogramViewer`: debounce запроса тайла ~**90 ms** (`TILE_FETCH_DEBOUNCE_MS`); при сдвиге окна — prefetch соседних тайлов через `prefetchSpectrogramTileBlob`. Hand-pan / overscan 1.25 / defer mid-drag — **§75**.
- Соседи по файлам (±1 WAV в очереди Анализа): `spectrogramNeighborWarm.ts` (`neighborWavPaths`, `warmNeighborSpectrograms`); вызов из `PredictSpectrogramPanel` с debounce + `AbortController` при смене пути; без спектрограммы / offline — не греть.

Не поднимать потолок LRU «вслепую» (§25 П1). Не убирать shared in-flight.

Файлы:

- `apps/ui/src/lib/spectrogramTileCache.ts` (+test, если есть)
- `apps/ui/src/lib/spectrogramNeighborWarm.ts` (+test)
- `apps/ui/src/components/SpectrogramViewer.tsx`
- `apps/ui/src/components/PredictSpectrogramPanel.tsx`
- `apps/ui/src/components/PredictAnalysisSpectrogramPane.tsx`
- `apps/ui/src/components/PredictResultsTabPanel.tsx` (`neighborFiles`)

## Проверка на Windows

Из `apps/ui`:

```bash
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/vitest run --configLoader native --config vitest.config.mjs \
  src/lib/callDurationLimits.test.ts \
  src/components/PredictFilterHistogram.test.tsx \
  src/components/PredictFilterStudio.test.tsx \
  src/lib/ek8PredictFilterGate.test.ts \
  src/lib/manualCopyGate.test.ts \
  src/lib/jobProjectScope.test.ts \
  src/jobs/JobsListContext.test.tsx \
  src/layout/navigation.test.ts \
  src/lib/importFormatNotice.test.ts \
  src/lib/countForms.test.ts \
  src/lib/tipsHint.test.ts \
  src/lib/windowHopLabel.test.ts \
  src/lib/pipelineTableLamp.test.ts \
  src/lib/spectrogramViewMemory.test.ts \
  src/trainWizard/snippetCalc.test.ts \
  src/lib/projectSummaryFormat.test.ts \
  src/lib/projectsStudio.test.ts \
  src/lib/predictQueueUi.test.ts \
  src/lib/analysisRunSummary.test.ts \
  src/workspace/predictSettings.sync.test.ts \
  src/api/modelsCache.test.ts \
  src/lib/studioAlign.test.ts \
  src/hooks/useProjectSummary.test.ts \
  src/lib/scrollElementIntoScroller.test.tsx \
  src/components/SpectrogramOverlay.test.tsx \
  src/components/SpectrogramColormapCanvas.test.tsx \
  src/lib/spectrogramTileCache.test.ts \
  src/lib/spectrogramNeighborWarm.test.ts \
  src/components/SpectrogramAudioPlayer.test.tsx \
  src/components/spectrogram/SpectrogramLogicLcd.test.tsx \
  src/components/SpectrogramFileSegmentRail.test.tsx \
  src/components/PredictResultsClassSidebar.test.tsx \
  src/lib/spectrogramView.test.ts \
  src/lib/ek7PredictResultsGate.test.ts \
  src/lib/buttonPress.test.ts \
  src/lib/filterCliLine.test.ts \
  src/lib/layoutScaleGate.test.ts \
  src/lib/jobLogTail.test.ts \
  src/lib/jobEventStream.test.ts \
  src/hooks/useJobLogTail.test.tsx \
  src/lib/shellMetaFrames.test.ts \
  src/lib/trainPipeline.annotations.test.ts \
  src/lib/ek13QaPlan.test.ts \
  src/lib/pipelineErrorExplain.test.ts \
  src/lib/ek14TrainMonitorGate.test.ts \
  src/lib/parameterExcludedCalls.test.ts \
  src/lib/tipsHint.test.ts \
  src/lib/homeWizardPlan.test.ts \
  src/lib/ek4HomeGate.test.ts \
  src/lib/trainMonitorAvailability.test.ts \
  src/lib/appAccess.test.ts \
  src/pages/home/HomeProjectCard.test.tsx \
  src/predict/PredictSessionContext.test.tsx \
  src/lib/userFacingError.test.ts \
  src/lib/studioAlign.test.ts \
  src/components/projects/ProjectsStudio.test.tsx
```

После §62–§66 на macOS дополнительно: `PredictSessionContext.test.tsx`, `SpectrogramLogicLcd.test.tsx`, `userFacingError` / façades gates. После §67–§76 также: `studioAlign.test.ts` (Help), `ProjectsStudio.test.tsx` (latches / focus), `test_messenger.py`, dock/jobFormat/batch-strip тесты если есть на ветке, `predictSettings.sync.test.ts` (§73/§77), `spectrogramViewMemory.test.ts` (§74), `spectrogramView.test.ts` / ek7 (§75 overscan). После §77–§80: `predictQueueUi.test.ts` (results tab не по `running`), `analysisRunSummary.test.ts` (header notify), `layoutScaleGate.test.ts` (без toast-ассерта). На Windows достаточно списка выше + sidecar ниже; полный `npm run ui:test` / полный unittest — по желанию.

Ручная проверка монитора (§29–§30): кнопка **Монитор** → второе окно; свернуть Lab (Windows: minimize) → монитор жив; закрыть монитор → обучение не падает; полный выход (Windows: ✕ / Alt+F4) → runtime стоп; иконка окна B-Scope.

Ручная проверка рейки (§35–§36): без активного плана мастера — KPI на Home; после «Обучить с нуля» / дообучения с очередью — рейка вместо KPI, Monitor в углу, пульс LED шага `train` и лампы Monitor совпадают по фазе; ручной Run шага на Pipeline рейку на Home не включает; `/__preview/home-plan-rail` открывается без Запуска sidecar.

Ручная проверка Анализа (§41–§54, §56/§66): палитра и Классы/Плеер — две рамки; play/pause глиф у **Позиция**, цифры не сдвигаются; ≥3 строки таблицы; maximize / resize без белых полей; правый край chrome = **Результаты**; сегменты — залитые треугольники; одна капсула имени с ◀▶ и ▼.

Ручная проверка keep-alive / session (§64–§65, §72): очередь Predict переживает уход на Главную и возврат; Results search не сбрасывается при том же; смена проекта гидратит сессию заново; **смена цели на Проектах не уводит на Главную** и не блокирует разделы; с `/predict` при focus=training — редирект на Home.

Ручная проверка §67–§71: Help в шапке — голый `?` без «Справка» на лице; factory reset / смена цели / сохранение параметров — точные тосты (§68); Lab dock indeterminate до первого тика predict, затем files/%; CSV — latches с полными подписями; focus — одна капсула без radio-dots.

Ручная проверка §73–§74: в проекте A включить «Перезаписывать результаты» → открыть/создать проект B → галочка выкл.; на Анализе в B красный playhead у начала даже если тот же WAV крутили в A; внутри B после сдвига playhead позиция запоминается до смены проекта.

Ручная проверка §75–§76: «Рука» — протяжка без чёрных/долгих перезагрузок mid-drag, один STFT после отпускания; до первых тиков predict полоса в консоли статичная ~30 % (не ездит), в таблице Задач — бегунок.

Ручная проверка §77–§80: A с `-ow` + активный пресет → новый проект B → галочка выкл.; во время predict вкладка «Анализ» недоступна; после успеха — остаётесь на Параметрах, «Анализ» пульсирует жёлтым, в шапке info с итогом; полный провал — sticky error в шапке; toast на Анализе нет; в Справке / руководстве — примечание про полосы классов.

Ручная проверка §81: Loop — две горизонтальные стрелки repeat (как `analysis-loop-repeat-ref.png`); Reset — один круг; Loop stroke 1.75, SVG 1.4rem / size 22.

Ручная проверка §82: контент должен реально переполнять колонку. Параметры / Задачи / Анализ / консоль — recess+raised C (~9px, тёмный track, raised thumb). Чипы классов на Анализе и рейка плана на Главной — hairline D (~5px, без track). Если полосы системные/невидимы — проверить, что в CSS нет `:is(...)::-webkit-scrollbar` и что перенесён актуальный `scrollbars.css`.

Ручная проверка §83: Фильтрация → «Применить фильтр» → подпись «Выполняется…»; кнопка остаётся справа, ширина не схлопывается, футер не переносит Apply на левый край второй строки.

Sidecar, своим Python 3.11, не системным 3.13. При ошибках numba/librosa cache задать `NUMBA_CACHE_DIR` (см. §28):

```bash
cd apps/sidecar
set PYTHONPATH=src
python -m unittest \
  tests.test_jobs tests.test_train_pipeline tests.test_parameter_guard \
  tests.test_project_studio tests.test_label_array_annotation_base \
  tests.test_projects tests.test_filter_preview \
  tests.test_helpers_cmd tests.test_spectrogram_en_flags \
  tests.test_job_log_tail tests.test_p14_full_coverage \
  tests.test_messenger
```

Сборку `.app` macOS и номер 1.0.4 не повторять. Руководство монитора (§ Монитор в `docs/manual/{ru,en}/04-train.md`) переносить вместе с §29.

## 58. Тексты советов без ИИ-штампов

Все советы переписаны коротко и по-человечески (RU/EN):

- `shellHealth.*` — tip в шапке (факт → что сделать / что это значит).
- `pipeline.snippetsShortageHeaderTip`.
- `settings.dataHealthBannerHint`.
- `predict.help.*.tip`, `thresholdHintBody` / зоны, `outputPathFieldHint`, `labelSuffixFieldHint`, `callDurationLimitsHint`.

Тесты: `countForms.test.ts`, `tipsHint.test.ts`.

## 59. Руководство: живой язык и редактура (ранний проход)

В `docs/manual/{ru,en}/` (ранний проход до принятого revised):

- убраны штампы («надстройки», «голый CLI», Under the hood / bare CLI / extras, «убедитесь», «без необходимости»);
- открытия глав — задача сначала, не «в этом разделе можно»;
- «Начало работы» — сценарии отдельно от блока «Отличия от терминала»;
- термины: акустические сигналы; класс / тип как в UI.

Аудит: canvas `orcai-manual-editorial-audit`. **Для RU этот пункт перекрыт §61** — копировать актуальные главы оттуда. EN до отдельной поставки: либо оставить согласованный с §59 снимок, либо ждать файл от автора (не выдумывать). Не упрощать § про clamp/`n_batch` в `04-train` ценой точности.

## 61. Руководство RU/EN · принятый revised + клавиши оболочки

На macOS в `docs/manual/{ru,en}/` принят финальный revised (после редактуры + ответы на `ВОПРОС` + шлифовка). HTML-комментов нет. Якоря `{#…}` и набор файлов 00–10 сохранить.

Переносить **все** `docs/manual/ru/*.md` и `docs/manual/en/*.md` с этой macOS-копии (после адаптации оболочки ниже). Ключевые отличия от старого §22/§59:

| Тема | Что должно быть |
|------|-----------------|
| Установка | Desktop **1.0.4**, orcAI **3.0.4**; основная поставка macOS Apple + фраза «на этой сборке — Windows»; автономный пакет; CPU по умолчанию / GPU Metal opt-in (macOS); без выдуманного ОЗУ; обучение — часы и десятки ГБ |
| Распознавание | Кнопка **Запустить распознавание** / **Run predictions**; канал **1**, порог **0,50** / **0.50** |
| Проекты | **Список проектов** / **Открыть папку проекта** (Finder / Проводник) / пустое состояние = подключить папку orcAI; **Добавить WAV** + drag-and-drop; **Добавить аннотации**; `-ut`/`-up` = дописать |
| Обучение | `n_overlap` = hop; `val_MBA` расшифрован; пример **3400→53** |
| Глоссарий | `n_overlap`, `val_MBA`; PHS = звуки поедания добычи |
| Настройки | Дефолты в таблицах; спектрограмма на **Среда выполнения**; F11 — полноэкран в приложении |
| Неполадки | Issues: https://github.com/macalpine1987/orcAI-Desktop/issues |
| Оболочка | Двухплатформенные примечания (таблица ниже) — не оставлять только ⌘W/⌘Q |

### Клавиши и закрытие окна (адаптация под Windows)

| Действие | macOS | Windows |
|----------|-------|---------|
| Скрыть / свернуть Lab, вычисления в фоне | ✕ окна или ⌘W (hide) | Свернуть в панели задач |
| Полный выход, стоп sidecar + движок | ⌘Q | ✕ / Alt+F4 у главного окна или выход из меню |
| Файловый менеджер проекта | Finder | Проводник |
| Окно монитора обучения | Остаётся при hide Lab; закрытие монитора обучение не стопает | То же при свёрнутом Lab; ✕ главного окна стопает runtime |

Файлы с уже адаптированным текстом на macOS-копии: `00-getting-started`, `01-home`, `02-projects`, `04-train`, `07-tasks` (RU и EN). Не выдумывать DirectML / иные GPU-бэкенды Windows, если их нет в UI этой сборки.

Тест: `manualCopyGate.test.ts`.

## 62. Thin façades страниц + CSS barrel + glyphs

Страницы Predict / Pipeline / Projects — тонкие façades; логика в hooks (`usePredictQueue`, `usePipelineBoard*`, `useProjectStudio*`, …). String gates смотрят в hooks, не только в page-файл.

`analysis-lab.css` — barrel из `analysis-lab-base.css` / `analysis-lab-predict.css` / `analysis-lab-filter.css` / `analysis-lab-jobs.css` (каждый фрагмент валиден для postcss-import, `@layer components`).

Glyphs спектрограммы: каталог `apps/ui/src/components/spectrogramIconGlyphs/` + façade `SpectrogramIcons.tsx` (не `spectrogramIcons` — case-collision на macOS APFS). На Windows путь тот же; не переименовывать обратно в смешанный регистр.

Файлы (ориентир): `apps/ui/src/pages/{Predict,Pipeline,Projects}Page.tsx`, `apps/ui/src/hooks/usePredict*.ts`, `apps/ui/src/styles/analysis-lab*.css`, `apps/ui/src/components/SpectrogramIcons.tsx`, `apps/ui/src/components/spectrogramIconGlyphs/**`.

## 63. Единые user-facing ошибки + LRU/prune

Тосты и статусы runtime/jobs без сырых stack: `formatUserFacingError*` / `formatUserFacingErrorI18n` / `formatUserFacingErrorRequired` в `apps/ui/src/lib/userFacingError.ts` (+ i18n).

Sidecar: LRU/prune для `_jobs` logs, `_pipeline_cache`, `_build_locks` и родственных Maps. UI Maps с тем же принципом там, где уже сделано на macOS.

Сбой `start_fn` в очереди → job **FAILED** (не зависает в `running`); `_cancelled` подрезается. Import-audio через общий `register_thread` / worker path.

Файлы: `apps/ui/src/lib/userFacingError.ts` (+tests), вызовы в sidecar/runtime/jobs hooks; `apps/sidecar/src/orcai_desktop_sidecar/` (jobs / cache prune).

## 64. Lab keep-alive · Predict и Results

`LabKeepAliveHost` держит смонтированными **Predict** и **Results** при уходе на другие разделы Lab (Outlet — placeholder). Хелперы путей: `labKeepAlivePaths.ts` (`isPredictPath`, `isResultsPath`).

Не монтировать «все разделы навсегда». Не поднимать число потоков спектрограммы ради keep-alive.

Обязательно вместе с §72: редирект `predictNavInactiveForWorkspace` → Home только когда `isPredictPath(pathname)`. Иначе смена цели на Проектах «убивает» разделы.

Файлы: `apps/ui/src/layout/LabKeepAliveHost.tsx`, `apps/ui/src/layout/labKeepAlivePaths.ts`, проводка в `App.tsx` / shell routing.

## 65. Predict session store

Единый источник правды очереди/сессии распознавания: `PredictSessionProvider` (`apps/ui/src/predict/PredictSessionContext.tsx`). `usePredictQueue` — façade над сессией + импорт WAV. `hydrateFromProject` при открытии проекта; focus refresh только при `engineReady` и predict-path; `navAppliedKeyRef` не даёт повторно заливать nav-state.

Обернуть дерево Lab в `PredictSessionProvider` (см. `App.tsx`). Опциональный хук `usePredictSessionOptional` для Projects / nav actions.

Тесты: `PredictSessionContext.test.tsx`, связанные `usePredictQueue` / Projects mocks.

## 66. Анализ · LCD play/pause у «Позиция» (финал §56)

Глиф ▶/‖ стоит у колонки **Позиция** (`SpectrogramLogicLcd`), не у **Длина**. Оверлей `position: absolute` — цифры MM:SS не сдвигаются. Idle при Stop / конце файла.

Файлы: `apps/ui/src/components/spectrogram/SpectrogramLogicLcd.tsx` (+test), `SpectrogramAudioPlayer.tsx` (+test asserts), CSS LCD transport.

## Пятая волна: Help / save notice / Lab dock / CSV / focus (2026-11-17)

Ниже — правки после §62–§66. Переносить целиком с рабочей macOS-копии. Номер Desktop на Windows не бампать.

### 67. Кнопка «Справка» в шапках · голый знак ?

Outlined / «Справка» с подписью и рамкой сняты. В шапках разделов — **только** круглый `?` (~22px SVG), без rim/fill/label. Hit-area `2.25rem`, фон прозрачный; hover меняет только цвет знака. Tooltip + `aria-label` остаются «Справка» / Help. Позиция 10px от правого верхнего угла панели (§11) сохраняется.

Файлы:

- `apps/ui/src/components/PageHelpButton.tsx` — `HelpMarkIcon`, класс `page-help-btn`
- `apps/ui/src/styles/studio.css` — `.page-help-btn` / `.page-help-btn-icon` + pin-трансформы
- тест: `apps/ui/src/lib/studioAlign.test.ts` (селекторы `.page-help-btn`)

Не возвращать текст «Справка» на лице кнопки и не рисовать outlined pill.

### 68. Тексты шапочного «сохранено»

Подробно: `docs/WINDOWS-SAVE-NOTICE-COPY.md`. Кратко:

| Место | Ключ | RU | EN |
|-------|------|----|----|
| Factory reset | `settings.resetDone` | Настройки сброшены к заводским | Settings restored to factory defaults |
| Цель проекта | `projects.studio.focus.saved` | Цель проекта сохранена | Project focus saved |
| Параметры проекта | `projects.studio.params.saved` | Параметры проекта записаны | Project parameters saved |

`common.saveSuccess` («Изменения сохранены успешно») — только для настоящих сохранений настроек. Reset вызывает `notifySaved(t("settings.resetDone"))` в `usePreferencesControllers.ts`.

### 69. Lab dock · прогресс (strip + развёрнутая шапка)

Свёрнутая полоса консоли и шапка развёрнутого дока показывают один и тот же кластер прогресса.

Поведение UI:

- Хук `useLabDockProgress` + `LabDockProgressCluster` + `JobProgressBar` (`variant="dock"`).
- Пока `running` и нет числового progress (`progress <= 0` / null) — indeterminate **семантика** (без ложного %). Визуал дока — **§76** (статичные ~30 %); скользящий `progress-fill--indeterminate` остаётся у таблицы Задач / монитора.
- Пакетный predict: `predictBatchStripPercent(done, total, currentFilePct)` — файлы + доля текущего; подписи files / % / duration на strip и в expanded header.
- Import-audio с `params.paths` — accent batch и счётчик файлов.

Sidecar (обязательно вместе с UI):

- `adapters/predict.py`: старт `set_progress(job_id, 0.0)` — **без** фейкового `0.05` / `0.02` до реальных тиков (§12 обновлён).
- `messenger.py` `_parse_progress`: только training/tqdm/`epoch N/M` / `[predict-file] N/M`. Произвольный `%` из лога (порог, метрики) **не** progress.
- `[predict-file] N/M` = старт файла → progress `(N-1)/total` (для `1/1` → `0.0`, indeterminate до следующего тика).

Файлы:

- `apps/ui/src/hooks/useLabDockProgress.ts`
- `apps/ui/src/components/labDock/LabDockProgressCluster.tsx`
- `apps/ui/src/components/LabDock.tsx`, `labDock/LabDockMain.tsx`
- `apps/ui/src/components/JobProgressBar.tsx`
- `apps/ui/src/lib/predictBatchStripProgress.ts` (+test, если есть)
- `apps/ui/src/lib/jobFormat.ts` (`isJobProgressIndeterminate`)
- `apps/ui/src/styles/jobs-console.css` (`.lab-dock-progress-cluster`)
- `apps/sidecar/.../messenger.py`, `adapters/predict.py`
- тесты: `apps/sidecar/tests/test_messenger.py`, UI dock / jobFormat / batch strip

Не делать: фейковый 5% на single-WAV; любой `%` из лога → progress. Не путать с §76: в **доке** статичная ширина fill для indeterminate — норма; в таблице Задач — бегунок.

### 70. Проекты · CSV toolbar · latches (вариант F)

На вкладке **Записи** переключатели «Все столбцы CSV» и «Обновлять столбцы CSV автоматически» — DAW-latches (`.ps-latch`), не обычные `.ps-btn` / checkbox-only.

- Полные подписи (короткие «CSV» / «Авто» не использовать — непонятно).
- Иконки `IconCsvColumns` / `IconCsvAutoSync` в `ProjectsIcons.tsx`.
- Вкл.: `.is-on` (утопленная тень); автосинк — `.ps-latch--lcd.is-on` (зелёный LCD `#7dffa3`).
- `aria-pressed`; автосинк `disabled` при `busy`.

Локали: `projects.studio.table.showCsvColumns`, `autoSyncCsv`, `autoSyncCsvTip`.

Файлы: `ProjectRecordingsTab.tsx`, `ProjectsIcons.tsx`, `projects-studio.css` (блок `.ps-latch`), `ProjectsStudio.test.tsx`.

### 71. Проекты · цель · единая капсула (вариант A)

Переключатели фокуса (Распознавание / Обучение / Полный цикл) — **одна** recess-капсула `.ps-focus-radios` (как сегмент Jobs): тёмный inset, `border-radius: 999px`, выбранный пункт `.ps-focus-radio.is-selected` без отдельных radio-dots / `.ps-radio`.

Кнопки `role="radio"` / `radiogroup`; повторный клик по уже выбранному не шлёт PATCH. Подпись — `projects.studio.focus.*`.

Файлы: `ProjectHeaderCard.tsx`, `projects-studio.css` (`.ps-focus-radios` / `.ps-focus-radio`), тесты Projects studio.

Не возвращать отдельные круглые точки слева от каждой подписи.

### 72. Смена цели · keep-alive Predict не уводит с разделов

Баг: после смены focus на «Обучение» / «Полный цикл» разделы «переставали грузиться» — оболочку уводило на Главную.

Причины и фикс:

1. **Keep-alive Predict** (`§64`) остаётся смонтированным на любом work-route. `usePredictPageState` вызывал `navigate("/", { replace: true })` при `predictNavInactiveForWorkspace` **без** проверки маршрута → смена цели на Проектах триггерила редирект.
   - Фикс: `if (!isPredictPath(location.pathname)) return;` перед navigate. Импорт из `labKeepAlivePaths.ts`.
2. **Гонка summary → workspace:** `useProjectStudioLifecycle` при `summaryFocus !== detail.focus` пушил **устаревший** summary focus в workspace и откатывал PATCH.
   - Фикс: применять sync только когда `summaryFocus === detail.focus`; при расхождении ждать обновления summary.

Pipeline (`usePipelineBoard`) монтируется только на `/pipeline` — отдельный path-gate не обязателен. Results keep-alive такого focus-redirect не делает.

Файлы:

- `apps/ui/src/hooks/usePredictPageState.ts`
- `apps/ui/src/hooks/useProjectStudioLifecycle.ts`
- `apps/ui/src/layout/labKeepAlivePaths.ts` (`isPredictPath`)

Ручная проверка: на Проектах сменить цель Распознавание ↔ Обучение — остаётесь на Проектах, меню/разделы кликаются; с `/predict` при focus=training — уход на Главную как задумано.

Тесты гейтов: `ek4HomeGate`, `ek8PredictFilterGate`, `ek9ResultsGate`, `PredictSessionContext.test.tsx` (строка `isPredictPath`).

### 73. Смена проекта · сброс «Перезаписывать результаты»

`overwrite` в `predictSettings` (и filter `overwrite`) — **глобальные** поля workspace. Включение в одном проекте оставалось включённым в новом → лишний `-ow` на свежих файлах.

Фикс (база):

- `applyProjectCallDurationLimits` при смене `projectDir` ставит `overwrite: false` (рядом с очисткой `baseDirRecording` / retarget `-cdl`).
- В `usePredictPageLocalState` при смене `queue.projectDir` всегда форсировать `overwrite: false` в draft + `savePredictSettings` (даже если CDL-stamp уже совпал и `apply*` early-return). Filter: `saveFilterSettings({ overwrite: false })`.

**Дожим — §77:** общий пресет после смены `activeProjectId` снова подставлял `overwrite: true`. Без §77 одного §73 недостаточно.

Внутри того же проекта галочку можно снова включить — до следующей смены проекта она сохраняется (keep-alive Predict не сбрасывает при уходе на Главную).

Файлы:

- `apps/ui/src/workspace/predictSettings.ts` (`applyProjectCallDurationLimits`)
- `apps/ui/src/hooks/usePredictPageLocalState.ts`
- тест: `apps/ui/src/workspace/predictSettings.sync.test.ts`

### 74. Новый проект · красный playhead спектрограммы с начала

Красный ползунок Анализа (`.analysis-playhead`, `#ff4d4d`) запоминался в `localStorage` **только по пути WAV**. Новый проект с теми же абсолютными путями (или keep-alive Predict при том же path) восстанавливал mid-file позицию.

Фикс: ключ памяти — `spectrogramViewStorageKey(activeProjectId, wavPath)` = `` `${projectId}\0${wavPath}` ``. Без fallback на голый path. Новый `activeProjectId` → нет записи → `playheadSec: 0`, окно с сегмента 0. Смена проекта при том же WAV сбрасывает applied-key и заново резолвит память.

Проводка `projectScope: activeProjectId` из `useSpectrogramViewerModel` → `useSpectrogramFocusSelection` / `useSpectrogramTransportZoom` / `useSpectrogramZoom` (clear на reset studio).

Файлы:

- `apps/ui/src/lib/spectrogramViewMemory.ts` (+test: другой project id не наследует playhead)
- `apps/ui/src/components/spectrogram/useSpectrogramFocusSelection.ts`
- `apps/ui/src/components/spectrogram/useSpectrogramViewerModel.tsx`
- `apps/ui/src/hooks/useSpectrogramTransportZoom.ts`
- `apps/ui/src/hooks/spectrogramTransport/useSpectrogramZoom.ts`
- `apps/ui/src/hooks/spectrogramTransport/types.ts`

Не делать: fallback на ключ без project id (вернёт баг для новых проектов).

### 75. Спектрограмма · Hand-pan без mid-drag STFT

При перетаскивании «Рукой» каждый выход за край тайла (~90 ms) запускал новый STFT → долгие подгрузки mid-gesture.

Фикс:

- Пока зажат pointer Hand (`handDragActive` / `deferTileSwap`): только CSS-сдвиг уже загруженного тайла; **не** менять `tileFetchWindow` и не soft-prefetch.
- По `pointerup` после реального сдвига — один `flushTileFetch()` (как и раньше на commit).
- `handPanArmed`: debounce смены тайла `TILE_FETCH_DEBOUNCE_HAND_MS` = **280 ms** (колёсико/кнопки); обычный pan — **90 ms**.
- `SPECTROGRAM_TILE_OVERSCAN_RATIO`: **0.75 → 1.25** (больше запас CSS-pan до hard miss).

Файлы:

- `apps/ui/src/hooks/useSpectrogramTileFetch.ts` (`deferTileSwap`, `handPanArmed`, debounce constants)
- `apps/ui/src/components/spectrogram/useSpectrogramViewerModel.tsx` (`handDragActive`)
- `apps/ui/src/hooks/spectrogramTransport/useSpectrogramLoopSegment.ts` (`onHandDragActiveChange`)
- `apps/ui/src/hooks/useSpectrogramTransportZoom.ts`, `spectrogramTransport/types.ts`
- `apps/ui/src/lib/spectrogramView.ts` (`SPECTROGRAM_TILE_OVERSCAN_RATIO`)

Не делать: STFT на каждом `pointermove`; возвращать overscan 0.75 без defer (снова лаги на Hand).

### 76. Lab dock · indeterminate визуал (статичные 30 %)

После §69 док сначала получил скользящий `progress-fill--indeterminate` (как Задачи). Вернули прежний спокойный вид консоли, семантика «без ложного %» сохранена.

- `JobProgressBar` `variant="dock"` + indeterminate → класс `progress-fill--indeterminate-static` (`width: 30%`, без animation).
- `variant="table"` (и TrainMonitor со своим markup) → по-прежнему `progress-fill--indeterminate` (бегунок).

Файлы:

- `apps/ui/src/components/JobProgressBar.tsx`
- `apps/ui/src/styles/jobs-console.css` (`.progress-fill--indeterminate-static`)

Не делать: снова вешать бегунок на dock strip; фейковый `set_progress(0.05)` (§69).

### 77. Смена проекта · `-ow` не возвращается из пресета

После §73 галочка всё ещё могла остаться включённой при создании/открытии нового проекта: `usePredictWorkspaceModelSync` при смене `activeProjectId` заново применял видимый пресет (`profileSettingsToPredictSettings`) **после** сброса по `queue.projectDir`, либо очередь на кадр была `null` и сброс не успевал.

Фикс:

- В sync при смене проекта всегда `overwrite: false` (и ветка пресета, и ветка без пресета) + `savePredictSettings`.
- В `usePredictPageLocalState` отдельный сброс по `workspace.activeProjectId` (не ждать `queue.projectDir`); filter overwrite — там же.

Файлы:

- `apps/ui/src/hooks/usePredictWorkspaceModelSync.ts`
- `apps/ui/src/hooks/usePredictPageLocalState.ts`

Не делать: снова отдавать `overwrite` из пресета при project switch (ручной выбор пресета на том же проекте — можно).

### 78. Распознавание · «Анализ» после окончания + жёлтый пульс

Раньше вкладка **Анализ** открывалась уже по `running` / первым готовым файлам, а после batch UI сам переключал на неё.

Фикс:

- `predictResultsTabEnabled` — только `done` / `filtered` (`isRecognitionComplete`), не `running`.
- `resultsEnabled` ещё и `!batchRunning` (частично готовые файлы mid-batch вкладку не открывают).
- Убрать `setActiveTab("results")` из CSV- и per-file batch path.
- После успеха (`succeeded > 0` или `preexisting > 0`) — `setAnalysisTabHint(true)`: вкладка **Анализ** с классом `predict-tab--hint` (тот же amber pulse, что `pp-btn--hint` на конвейере). Снимается при открытии вкладки.
- Локаль `predict.tabs.resultsBusy` на disabled title во время batch.

Файлы:

- `apps/ui/src/lib/predictQueueUi.ts` (+test)
- `apps/ui/src/hooks/usePredictRunDerived.ts`
- `apps/ui/src/hooks/usePredictBatchRun.ts` / `predictBatchFileLoop.ts` / `usePredictBatchRunTypes.ts`
- `apps/ui/src/hooks/usePredictTabsNav.ts`, `usePredictPageLocalState.ts`, `usePredictPageState.ts`
- `apps/ui/src/components/PredictTabs.tsx`
- `apps/ui/src/styles/predict-params.css` (`.predict-tab--hint`, `@keyframes pp-btn-hint-pulse`)
- локали `predict.tabs.resultsBusy` (RU/EN)

Не делать: автопереход на Анализ; включать вкладку по статусу `running`.

### 79. Итог распознавания · chip в шапке, не toast на Анализе

Баннер «Распознавание завершено: N из N…» убран с вкладки **Анализ** (иначе после §78 пользователь его не видит, оставаясь на Параметрах).

Фикс: `notifyAnalysisRunComplete` → `notifySaved(message)` (info flash ~3.2 s) или `notifyHeaderError` при tone `error`. Старт batch вызывает `dismissHeaderError()`. Состояние `runSummary` / `.predict-results-toast` сняты.

Файлы:

- `apps/ui/src/lib/analysisRunSummary.ts` (`analysisRunBannerMessage`, `notifyAnalysisRunComplete`) +test
- `apps/ui/src/hooks/usePredictBatchRun.ts`, `predictBatchFileLoop.ts`
- `apps/ui/src/components/PredictResultsTabPanel.tsx` (без toast props)
- `apps/ui/src/styles/analysis-lab-jobs.css` (блок toast удалён)
- `apps/ui/src/lib/layoutScaleGate.test.ts` (ассерт toast убран)

Не делать: возвращать in-studio toast; дублировать итог и в шапке, и на Анализе.

### 80. Руководство · полосы классов — время, не частота

В `docs/manual/{ru,en}/03-predict.md` (раздел **Анализ**), сразу после абзаца про спектрограмму orcAI:

**RU:** цветные полосы — метки класса по **времени** (как дорожки в Audacity), не по частоте; по вертикали — частота (0–16 кГц), поэтому полоса может лежать не там, где видна энергия; в файлах orcAI только начало, конец и класс.

**EN:** bands mark **class over time** (Audacity-style), not frequency; frequency runs up the plot; orcAI label files have no frequency bounds.

Переносить вместе с остальным §61 / живым `docs/manual/`. Не выдумывать другую формулировку.

### 81. Анализ · кнопка «Зациклить» — music-style repeat

Ориентир формы: `docs/mockups/analysis-loop-repeat-ref.png` (две stadium-стрелки ↔). `strokeWidth` **1.75** (чуть жирнее Reset 1.45), `size={22}`, SVG **1.4rem**.

`IconLoop`: верхняя дуга+шеврон вправо, нижняя дуга+шеврон влево (не круг Reset, не filled-кольцо). Класс `predict-logic-loop-btn`. Принято в UI (2026-11-17).

Файлы:

- `apps/ui/src/components/spectrogramIconGlyphs/transportIcons.tsx` (`IconLoop`)
- `apps/ui/src/components/spectrogram/SpectrogramAudioTransportBar.tsx`
- `apps/ui/src/components/spectrogram/SpectrogramDefaultTransport.tsx`
- `apps/ui/src/styles/analysis-lab-filter.css` (`.predict-logic-loop-btn` → `1.4rem`)
- `docs/mockups/analysis-loop-repeat-ref.png`, `docs/mockups/analysis-loop-icon-now.png`

Не делать: копию `IconCircularReset`; filled evenodd-кольцо; non-uniform `width≠height` у SVG.

### 82. Lab · тёмные полосы прокрутки (C + D)

Макет: `docs/mockups/scrollbar-dark-theme-options.html` / `.png`. Принято: **C** для Lab-колонок, **D** для узких списков.

- **C** (Instrument recess+raised, ~9px): `.lab-scroll` + колонки (`pp-params-scroll`, `jobs-table-body`, `predict-results-studio`, dock log, Home/Projects/Settings/Help/Models, …).
- **D** (hairline, ~5px, без track): `.lab-scroll-narrow` + рейка плана (`.home-wizard-plan-scroll`), чипы классов (`.predict-results-classes-tools-chips`), очередь WAV (`.pp-queue-table-wrap`), sidebar классов, …

Файлы:

- `apps/ui/src/styles/scrollbars.css` — единый chrome C/D
- `apps/ui/src/index.css` — `@import "./styles/scrollbars.css"` **последним** (после studio/page CSS)
- `apps/ui/src/styles/home.css` — сняты локальные A-стили у `.home-wizard-plan-scroll`
- `apps/ui/src/styles/analysis-lab-filter.css` — сняты локальные B-стили у `.predict-results-classes-tools-chips`

**Критично (macOS QA 2026-11-17):** первая версия оборачивала хосты в `:is(.a, .b)::-webkit-scrollbar`. CSS попадал в бандл, но **WKWebView не применял** эти правила — в UI оставались системные/невидимые полосы. Исправление: **прямые comma-списки**

```css
.pp-params-scroll,
.jobs-work-panel .jobs-table-body,
/* … */ {
  scrollbar-width: thin;
  scrollbar-color: #4a4b4e #0e0f10;
}
.pp-params-scroll::-webkit-scrollbar,
.jobs-work-panel .jobs-table-body::-webkit-scrollbar,
/* … */ {
  width: 9px;
  height: 9px;
}
```

На Windows WebView2 копировать тот же файл без «упрощения» обратно в `:is(...)`. Новые скролл-хосты — добавлять класс `.lab-scroll` / `.lab-scroll-narrow` или дописывать селектор в `scrollbars.css` тем же прямым списком.

Не делать: цветные акцентные thumbs; системный светлый scrollbar в тёмной теме; возвращать metal-B на чипы; `:is(...)` / `:where(...)` перед `::-webkit-scrollbar`; считать «CSS в бандле» доказательством видимости без ручной проверки переполненной колонки.

### 83. Фильтрация · «Применить фильтр» не сдвигается влево

При `filterSubmitting` подпись меняется на `predict.running` («Выполняется…» / короче «Применить фильтр»). Без фикса колонка `.pp-footer-side` схлопывалась и при `flex-wrap` футер мог перенести Apply на вторую строку влево.

Фикс в `predict-filter.css` + класс `predict-filter-apply-btn`:

- `.predict-filter-m05-foot .pp-footer-main` — `flex-wrap: nowrap` (на узкой колонке `@container … 36rem` снова `wrap`)
- `.predict-filter-m05-foot .pp-footer-side` — `margin-left: auto` (сброс в 0 в том же container query)
- `.predict-filter-apply-btn` — `min-width: 12.5rem`

Файлы: `apps/ui/src/styles/predict-filter.css`, `apps/ui/src/components/PredictFilterStudio.tsx`.

### 84. Монитор обучения · смена языка из Lab

`train-monitor` — отдельный WebviewWindow со своим экземпляром i18n. Смена локали в Настройках Lab раньше обновляла только main.

Фикс: `setAppLocale` (main) → `broadcastLocaleToTrainMonitor` (`emitTo` `orcai-locale-changed`) → `useTrainMonitorLocaleListener` в Preferences монитора.

**Полная инструкция для Windows:** `docs/WINDOWS-TRAIN-MONITOR-LOCALE.md`.

Файлы: `apps/ui/src/platform/localeSync.ts`, `apps/ui/src/hooks/useTrainMonitorLocaleListener.ts`, `apps/ui/src/i18n.ts`, `apps/ui/src/preferences/PreferencesContext.tsx`, gate в `ek14TrainMonitorGate.test.ts`.

### 85. Главная · порядок шагов плана обучения

Рейка плана на Главной брала `active_plan.commands` в порядке обхода jobs (`updated_at DESC`) — шаги шли «с конца».

Фикс: sidecar `_active_wizard_plan` и UI `resolvePlanCommandIds` упорядочивают по `TRAIN_STEP_IDS` / `TRAIN_PIPELINE_STEP_IDS` (как доска конвейера).

**Полная инструкция для Windows:** `docs/WINDOWS-HOME-WIZARD-PLAN-ORDER.md`.

Файлы: `apps/sidecar/.../pipeline_jobs.py`, `apps/sidecar/tests/test_train_pipeline.py`, `apps/ui/src/lib/homeWizardPlan.ts`, `apps/ui/src/lib/homeWizardPlan.test.ts`.

### 86. Главная · автопрокрутка рейки плана к running

Рейка показывает ~3 строки; при длинном плане активный шаг уезжал вниз из видимой области.

Фикс: `HomeWizardPlanRail` через `homeWizardPlanFocusStepId` (running, иначе error) + `scrollElementIntoScroller` в `.home-wizard-plan-scroll`. Уже видимый шаг не дёргает scroll.

**Добивка:** static scroller не был `offsetParent` → scroll no-op. Нужны `position: relative` на `.home-wizard-plan-scroll` и rect-fallback в `scrollElementIntoScroller` (+ rAF retry в рейке).

**Полная инструкция для Windows:** `docs/WINDOWS-HOME-WIZARD-PLAN-AUTOSCROLL.md`.

Файлы: `HomeWizardPlanRail.tsx`, `homeWizardPlan.ts`, `spectrogramDetections.ts`, `home.css`, тесты `homeWizardPlan` / `ek4HomeGate` / `scrollElementIntoScroller`.

См. также §85 (`docs/WINDOWS-HOME-WIZARD-PLAN-ORDER.md`).


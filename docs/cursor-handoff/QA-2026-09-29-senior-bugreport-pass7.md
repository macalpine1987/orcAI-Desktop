# Баг-репорт · Senior QA · orcAI Desktop v0.1.23 (проход 7)

**Роль:** Senior QA  
**Дата:** 2026-09-29  
**Объект:** Lab UI + sidecar; акцент — допуск к обучению, лампы аннотаций, fidelity к orcAI 3.0.2 (ручная разметка `.txt`, не CSV-путь и не `*_predicted` / `*_filtered`), масштаб до fullscreen  
**База:** working tree после правил фокуса, ламп «Аннотации» / «Записи без аннотаций» и справки  
**Предыдущий:** `QA-2026-09-28-senior-bugreport-pass6.md`  
**Метод:** сверка `train_pipeline` / `project_registry` с правилом «метка = файл `.txt` со stem WAV»; unit (bundled Python 3.11, vitest). Живой fullscreen retest — не повторялся: CSS не менялся  
**Ограничение фикса:** код и логика. Цвета, отступы, макеты разделов не менялись.

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после QA-31…35 |
| Регресс QA-01…30 | **Hold** (QA-21 stretch спектрограммы по-прежнему Reverted) |
| Лампа «Аннотации» | При загруженных WAV показывает число парных `.txt`, не строк CSV |
| Кнопка «Мастер обучения» | Смотрит `paired_files` на диске. Карточка готовности в Проектах по-прежнему на сводном счётчике |
| Layout | Герои на cqh/flex; `vh` только cap модалок. `layoutScaleGate` — 8 тестов, зелёные |

Дизайн разделов не менялся. Версия не поднималась, `.app` не пересобирался.

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус |
|----|------|--------|
| QA-01…20 | runtime, table-hero, snippets readiness, data-health | Hold |
| QA-21 | Analysis stretch до `52cqh` | **Reverted** (не возвращать) |
| QA-22 | cache sidecar = `apps/sidecar` | Hold. Этот проход **не** копировал `train_pipeline.py` в bundle |
| QA-23 | apply_best → temp `-p` | Hold |
| QA-24 | toast `flex: 0 0 auto` | Hold |
| QA-25 | монитор без size-контейнера | Hold |
| QA-26…30 | калькулятор сниппетов | Hold |

---

## Новые дефекты (этот проход)

### QA-31 · High — лампа «Аннотации» зеленела от пути в CSV

**Шаги:** WAV на диске, в `recording_table.csv` заполнен `rel_annotation_path`, файла `.txt` нет.  
**Факт:** `annotated_count` включал stem из таблицы. Лампа могла стать `ok` и показать «N из N», пока `paired` оставался 0, шаги от label arrays были `blocked` / `no_annotations`, а «Записи без аннотаций» честно считали пропуск.  
**Ожидание:** при наличии WAV лампа и подпись «0 из N» совпадают с парными `.txt`. Путь в таблице без файла меткой не является. orcAI `create-label-arrays` читает файл, не строку CSV.  
**Фикс:** `_annotations_readiness`. При `wav_count > 0` на лампу идут `paired_txt_count` / `wav_count`. Без WAV остаётся прежний счёт (метка раньше записи).  
**Статус:** **Fixed**. Тесты `test_base_dir_alone_is_not_an_annotation`, `test_predicted_export_and_nested_label`.

---

### QA-32 · Medium — «Мастер обучения» открывался по сводному счётчику

**Факт:** кнопка смотрела `readiness_lines.annotations.annotated` = `max(строки CSV, файлы)`. Строка с `rel_annotation_path` без файла делала кнопку активной, а конвейер тут же держал шаги.  
**Ожидание:** кнопка неактивна, пока нет ни одного `.txt`, чей stem совпадает с WAV. Подсказку на кнопку не возвращать.  
**Фикс:** в сводку добавлено поле `paired_files` (только файлы). `trainWizardBlockedByAnnotations` берёт его; у старого sidecar без поля остаётся прежний `annotated`. Карточка готовности и `next_actions` не переведены на это поле.  
**Статус:** **Fixed** для кнопки. Карточка — см. QA-36.

---

### QA-33 · Medium — проект в каталоге с точкой в имени терял файлы

**Факт:** `any(part.startswith(".") for part in path.parts)` смотрел абсолютный путь. Родитель вроде `~/.cursor` помечал каждый файл скрытым. Обнулялись лишние таблицы, счётчики разметки / predicted / tvt / `.keras` и поиск `best_hyperparameters.json`. Каноническая `recording_table.csv` при этом находилась отдельно и жила.  
**Ожидание:** скрытым считается только фрагмент внутри корня обхода (`annotations/.draft`, не домашний каталог).  
**Фикс:** `_rel_is_hidden(path, root)` в `project_registry.py` и в поиске hpsearch.  
**Статус:** **Fixed**. Тесты `test_paired_files_ignore_csv_path_and_survive_hidden_parent`, `test_find_best_json_under_hidden_parent`.

---

### QA-34 · Low — вложенный `.txt` и регистр суффикса расходились

**Факт:**
1. Конвейер искал метки через `annotations.rglob`. Сводка проектов — только верхний уровень `iterdir`. Кнопка и шаги могли не согласиться на `annotations/batch/clip.txt`.
2. Конвейер отсекал `_predicted.txt` / `_filtered.txt` с учётом регистра. `clip_Predicted.txt` становился ручной меткой. Сводка уже сравнивала имя в lower case.

**Ожидание:** одна и та же пара «stem WAV + ручной `.txt`», вложенные файлы считаются один раз, экспорт распознавания меткой не является.  
**Фикс:** парный счётчик тоже `rglob` и множество stem; суффикс в конвейере через `name.lower()`.  
**Статус:** **Fixed**. Тест `test_predicted_export_and_nested_label`.

---

### QA-35 · Low — тот же скрытый родитель у hpsearch

**Факт:** `_find_best_hyperparameters_json` пропускал `best_hyperparameters.json`, если проект лежал под каталогом с точкой. Train тогда не видел результат orcAI hpsearch.  
**Фикс:** тот же относительный фильтр, корень — `project/hpsearch`.  
**Статус:** **Fixed**. Тест `test_find_best_json_under_hidden_parent`.

---

## Открыто (логика, интерфейс не трогать)

### QA-36 · Low — карточка «Аннотации» в Проектах всё ещё сводная

`annotated` на карточке по-прежнему `max(строки CSV, файлы на диске)`. При пути в таблице без файла карточка может остаться «готова», а кнопка мастера — выключена без подсказки. Баннер data-health считает такой разрыв как `ann_gap`. Карточку и `next_actions` не переключал: это контракт BUG-P-06, смена числа сдвинет «следующий шаг».

### QA-37 · Low — `409 no_annotations` без перевода

`POST /v1/jobs` для команд от `create-label-arrays` до `test` отвечает `409` с текстом `no_annotations`, если в `project_dir` есть WAV и нет парного `.txt`. UI до этого запроса не доходит. Отдельную строку в интерфейс не добавлял.

### QA-38 · Info — bundle не синхронизирован

Dev sidecar читает `apps/sidecar/src`. Копия в `python-bundle` / собранном `.app` эти правки не видит, пока пакет не переустановлен. Сборку не запускал.

---

## Info (не дефект / не трогать без запроса)

| Тема | Вердикт |
|------|---------|
| QA-21 спектрограмма | Stretch **не** возвращать |
| `vh` у модалок | TZ: cap `min(Nrem, 100vh - 3rem)` — OK |
| Герои студий | Высота от контейнера (`cqh` / flex), не от окна |
| Table-hero анализа | `max-height: none` у таблицы детекций — герой колонки (`flex: 1`, `min-height: 0`), не график внутри `overflow-y: auto` |
| `.tm-modal` | Size-контейнера нет (QA-25) |
| Мастер по `?view=wizard` | Пока доска не пришла, рисуется уже существующая строка «загрузка», не форма мастера |
| Регистр stem `CLIP.txt` / `clip.wav` | Как у orcAI: stem как в имени файла |
| Подсказка на кнопке мастера | Не возвращать |

---

## Масштабирование (сводка)

CSS в этом проходе не менялся. Контракт `layoutScaleGate.test.ts` зелёный.

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная / Проекты | size-контейнер | OK |
| Параметры | очередь `50cqh`, не `vh` | OK |
| Анализ | потолок `52cqh`; host не растянут | QA-21 Reverted |
| Фильтрация / Результаты / Модели / Задачи | cqh/flex | OK |
| Конвейер, Настройки, Справка | flex, chrome не сжимается в ноль | OK |
| Монитор / диалоги мастера | cap от `vh` | OK |
| Калькулятор сниппетов | колонки по тексту заголовка | Hold QA-26 |
| Dock | `clamp(10rem, 38cqh, 17.5rem)` | OK |

Полноэкранный прогон вживую не повторялся: отступы и токены те же, что после прохода 6.

---

## orcAI fidelity (сводка)

| Правило | Статус |
|---------|--------|
| Метка для обучения — файл `.txt` рядом по имени с WAV | Fixed QA-31, QA-32, QA-34 |
| `base_dir_annotation` сам по себе не метка | Hold |
| `*_predicted.txt` / `*_filtered.txt` не ручная разметка | Fixed, сравнение без регистра |
| Спектрограммы можно строить без меток | Hold |
| Шаги от label arrays при нуле парных `.txt` не стартуют | Hold + серверный 409 |
| Фокус «Распознавание» гасит вход в Обучение, пункт меню остаётся видимым | Hold |
| hpsearch — opt-in, не третий сценарий мастера | Hold |
| `best_hyperparameters.json` находится и под скрытым родителем | Fixed QA-35 |

---

## Тесты

Sidecar, bundled Python 3.11, `PYTHONPATH=src`, 80 тестов, OK:

- `tests.test_train_pipeline`
- `tests.test_projects`
- `tests.test_hps_merge`

UI vitest, 60 тестов, OK:

- `projectsStudio.test.ts` (кнопка мастера)
- `trainPipeline.annotations.test.ts`
- `layoutScaleGate.test.ts`
- `navigation.test.ts`
- `ek5ProjectsGate.test.ts`
- `ek12PipelineGate.test.ts`
- `ek13TrainWizardGate.test.ts`

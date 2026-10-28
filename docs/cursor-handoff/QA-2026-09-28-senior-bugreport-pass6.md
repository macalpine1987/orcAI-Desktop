# Баг-репорт · Senior QA · orcAI Desktop v0.1.22 (проход 6)

**Роль:** Senior QA  
**Дата:** 2026-09-28  
**Объект:** Lab UI + sidecar; акцент — калькулятор сниппетов, fidelity к orcAI 3.0.2 (`snippets._filter_snippet_table` / `_make_snippet_table`), масштабирование до fullscreen  
**База:** working tree после прохода 5 и калькулятора на шаге 4 мастера  
**Предыдущий:** `QA-2026-09-28-senior-bugreport-pass5.md`  
**Метод:** сверка с `orcai/snippets.py` 3.0.2 + unit (bundled Python 3.11, vitest). Живой fullscreen retest — Pending  
**Ограничение фикса:** код и логика. Цвета, отступы chrome, макеты разделов не менялись. У калькулятора только ширина колонок, чтобы подписи не обрезались.

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после QA-26…30 |
| Регресс QA-01…25 | **Hold** (QA-21 stretch спектрограммы по-прежнему Reverted) |
| Калькулятор | Оценка «Останется» совпадает с `int(fraction_removal * n_empty)` orcAI; «точные» цифры только если `-p` проекта совпал и в таблице есть колонки выбранных классов |
| Layout | Герои студий на cqh/flex; `vh` только cap модалок; `.tm-modal` без `container-type: size` |

Дизайн разделов не менялся.

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус |
|----|------|--------|
| QA-01…20 | runtime, table-hero, snippets readiness, data-health | Hold |
| QA-21 | Analysis stretch до `52cqh` | **Reverted** (не возвращать) |
| QA-22 | cache sidecar = `apps/sidecar` | Hold; этот проход синхронизировал `snippet_calculator.py` в bundle |
| QA-23 | apply_best → temp `-p` | Hold |
| QA-24 | toast `flex: 0 0 auto` | Hold |
| QA-25 | монитор без size-контейнера | Hold |

---

## Новые дефекты (этот проход)

### QA-26 · Medium — заголовки калькулятора обрезались

**Шаги:** Мастер, шаг 4, «Рассчитать…», RU.  
**Факт:** `table-layout: fixed` и узкий `min-width` числовых колонок резали uppercase-подписи («Батчей максимум», «Нужно сейчас»).  
**Ожидание:** подпись колонки видна целиком при ширине окна вплоть до fullscreen.  
**Фикс (layout, без смены токенов):** `.tw-calc-modal` до `min(72rem, 100vw - 2.5rem)`, `table-layout: auto`, у `.tw-col-num` `min-width: 9.75rem`, у `th` `white-space: nowrap`.  
**Статус:** **Fixed**. Gate: `layoutScaleGate.test.ts`.

---

### QA-27 · High — «Останется» не совпадало с фильтром orcAI

**Факт:** оценка считала `floor(n_empty * (1 - fraction_removal))`. orcAI `_filter_snippet_table` удаляет `int(fraction_removal * n_empty)` (усечение к нулю). Для 917 пустых и 0.99: orcAI оставляет 10, старая формула — 9 (917 → kept 52 вместо 53).  
**Ожидание:** та же целочисленная формула, что в `orcai/snippets.py`.  
**Где:** `snippet_calculator._kept_after_removal`.  
**Статус:** **Fixed**. Тест `test_removal_matches_orcai_truncation`.

---

### QA-28 · High — «измеренные» counts могли быть сырой таблицей

**Факт:**
1. Если в `all_snippets.csv.gz` нет колонок выбранных классов, clamp-хелпер возвращает сырые строки. Калькулятор помечал их как точный post-filter (`source: measured`, запас 0).
2. Пустой или отсутствующий блок `snippets` в `-p` сравнивался с дефолтами и мог «совпасть».
3. Файл параметров брался как первый `*_orcai_parameter.json` по алфавиту, а не `<orcai_name>_orcai_parameter.json`, как train.

**Ожидание:** measured только когда параметры нарезки совпали с `-p` проекта и фильтр orcAI реально применим. Иначе остаётся оценка с запасом 10%.  
**Статус:** **Fixed**. Тесты `test_measured_uses_orcai_name_parameter_not_alphabetical`, `test_measured_without_snippets_block_is_not_a_match`.

---

### QA-29 · Low — окно короче сниппета всё равно шло в счётчик

**Факт:** orcAI берёт старт через `rng.uniform(low, high)` и не может выбрать точку, если `high <= low` (доля сплита × `segment_duration` ≤ `snippet_duration`). Оценка всё равно прибавляла `int(frac * segment * snippets_per_sec)`.  
**Ожидание:** такой сплит в оценке даёт 0 нарезанных.  
**Статус:** **Fixed**. Тест `test_window_shorter_than_snippet_is_not_counted`.

---

### QA-30 · Low — повторный расчёт затирал ошибку и гонялся с предыдущим запросом

**Факт:** ответ более раннего запроса мог записаться поверх нового; `finally` снимал «идёт расчёт» у ещё живого запроса; ошибка пересчёта не показывалась, пока на экране оставалась старая таблица.  
**Ожидание:** на экране ответ последнего запроса; ошибка видна в уже существующей строке таблицы.  
**Фикс:** порядковый номер запроса, без новых элементов UI.  
**Статус:** **Fixed**. Правила «Применить» вынесены в `snippetCalc.ts` и покрыты vitest.

---

## Info (не дефект / не трогать без запроса)

| Тема | Вердикт |
|------|---------|
| Оценка до `all_snippets.csv.gz` | Длительность WAV + пересечение Audacity-интервалов, не кадры спектрограммы и не `labels.zarr`. Запас 0.9 как раз на `drop_duplicates` и округление кадров |
| Частотные строки Audacity | orcAI читает TSV через pandas (`start/stop/label`); калькулятор берёт первые три поля. Не ломать парсер без расхождения на реальных файлах |
| QA-21 спектрограмма | Stretch **не** возвращать |
| `vh` у модалок | TZ §2.3: cap `min(Nrem, 100vh - 3rem)` — OK |
| Герои студий | `Nvh` на высоте героя не найдено; панели — `container-type: size` + cqh |
| `.tm-modal` | Size-контейнера нет (QA-25) |
| Publication defaults / data-health off | Как в проходе 5 |

---

## Масштабирование (сводка)

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная / Проекты / Параметры | flex / cqh | OK |
| Анализ | потолок `52cqh`; host не растянут | QA-21 Reverted |
| Фильтрация / Результаты / Модели / Задачи | cqh/flex | OK |
| Конвейер, Настройки, Справка | flex, chrome `shrink-0` | OK |
| Монитор обучения | `max-height` от `vh`, не size-контейнер | OK |
| Калькулятор сниппетов | колонки по тексту заголовка | Fixed QA-26 |
| Dock | `38cqh` | OK |

---

## orcAI fidelity (сводка)

| Правило | Статус |
|---------|--------|
| `int(fraction_removal * n_unlabelled)` | ✓ QA-27 |
| uniform только при `high > low` | ✓ QA-29 |
| measured = повторный `_filter_snippet_table`, не сырые строки | ✓ QA-28 |
| `-p` = `<orcai_name>_orcai_parameter.json` | ✓ QA-28 |
| «Применить» только если у train/val/test есть ≥ 1 батч | ✓ |
| Board без sticky apply_best; clamp temp `-p`; `strict=False` | Hold с прохода 5 |

---

## Тесты

| Файл | Что |
|------|-----|
| `apps/sidecar/tests/test_snippet_calculator.py` | формула orcAI, короткое окно, merge интервалов, параметры, выбор `-p`, отказ measured без колонки класса |
| `apps/ui/src/trainWizard/snippetCalc.test.ts` | apply / shortfall |
| `apps/ui/src/lib/layoutScaleGate.test.ts` | ширина колонок калькулятора; монитор без size-контейнера |
| `apps/ui/src/lib/ek13TrainWizardGate.test.ts` | `snippetCalcCanApply`, номер запроса |

Прогон: sidecar `tests.test_snippet_calculator` (bundled 3.11) — 10 OK. UI snippetCalc + layoutScale + ek13 — 17 OK.

Модуль скопирован в bundle (`src-tauri/resources/python` → cache). Штамп `.app` этот модуль подхватит после следующей сборки.

---

## Чек-лист живой приёмки (Pending)

1. Калькулятор, RU, окно на весь экран и ~1100 px: все семь заголовков читаются.  
2. Проект без `tvt_data/all_snippets.csv.gz`: источник «оценка», «Применить» ставит suggested, не max.  
3. Таблица есть, но класс мастера отсутствует в колонках: источник остаётся оценкой, не «измерено».  
4. Повторный «Пересчитать» при ошибке сети показывает текст ошибки, а не прошлую таблицу.  
5. Анализ fullscreen: спектрограмма как до QA-21.  
6. Монитор обучения открывается (не нулевая высота).

# Баг-репорт · Senior QA · orcAI Desktop v0.1.22 (+ table-hero / Analysis)

**Роль:** Senior QA  
**Дата:** 2026-09-28  
**Объект:** полный продукт (Lab UI + sidecar + runtime), акцент на Analysis table-hero, масштабирование, fidelity к orcAI 3.0.2  
**База:** working tree `orcai-desktop`, baseline v0.1.22  
**Метод:** статический разбор кода + gate/unit tests; живой прогон `.app` — Pending  
**Ограничение фикса:** только код / логика / точные тексты подсказок; **дизайн (токены, chrome, макеты) не менять**

---

## Вердикт

Продукт в целом собран и верен orcAI: predict / filter-predictions / train / hpsearch / finetune, null-границы `-cdl`, `recording_table.csv`, Home `startAll` через host HTTP. Недавний table-hero (спектрограмма выкл.) работает: фильтр классов и порог вероятности влияют на таблицу; пустой `studio-stack` убран.

Найдены дефекты runtime и согласованности Analysis. **P0–P2 из этого отчёта закрыты в коде** (см. «Исправлено сейчас»). Остаётся живой retest `.app`.

| | |
|--|--|
| Рекомендация | **Retest** на stamp `/tmp/orcAI-Desktop_0.1.22_aarch64.app` после сборки |
| Code gate / unit | Pass (обновлены EK-7 / EK-10 / job stream / jobs.py) |
| Живой прогон | Pending |
| Retest (вечер) | см. `QA-2026-09-28-senior-bugreport-retest.md` (QA-09 Fixed) |

---

## Матрица: что не трогать (уже корректно)

| Область | Статус |
|---------|--------|
| `filter-predictions` (не `filter-annotations`) | ✓ |
| Пустые min/max фильтра → JSON `null`; без `[null,null]` на классах, затеняющих `default` | ✓ |
| Predict `-cdl` opt-in; filter без inject → default package | ✓ |
| Train `-lm`/`-lmf`; `-ft` = имя папки, не CLI-флаг | ✓ |
| hpsearch не 3-й сценарий мастера | ✓ |
| Home `startAll` → `invokeSidecarEngineStart` | ✓ |
| Layout heroes: cqh/flex; `vh` только у модалок (TZ-layout-scale) | ✓ |
| Table-hero: preference `showSpectrogram`, modal без «Отображение» | ✓ |
| AUTONOMY GATE / nested Python.app | ✓ (на stamp) |

---

## Дефекты

### QA-01 · High — Старт движка CPU/GPU в Настройках через WKWebView `fetch`

**Шаги:** Запуск на Главной → Настройки → Среда → сменить CPU↔GPU (runtime уже активен).  
**Факт:** `restartRuntimeForComputeDevice` / `startEngineService` вызывали `startEngine()` → `fetch(/v1/engine/start)` из WKWebView.  
**Ожидание:** тот же host path, что `startAll` (`sidecar_engine_start`) — фикс v0.1.22.  
**Риск:** движок остаётся idle после смены устройства / «мягкого» рестарта.  
**Где:** `apps/ui/src/sidecar/SidecarContext.tsx`.  
**Фикс (code-only):** `invokeSidecarEngineStart` в Tauri; `startEngine` только как web-smoke fallback.  
**Статус:** **Fixed** + gate EK-10.

---

### QA-02 · Medium — Live-длительность задачи включает ожидание в очереди

**Шаги:** Поставить job в очередь при занятом worker → дождаться RUNNING → смотреть колонку длительности до следующего poll.  
**Факт:** SSE `status` не слал `started_at`; UI до poll падал на `created_at`.  
**Ожидание:** длительность с момента RUNNING (`started_at`).  
**Где:** `apps/sidecar/.../jobs.py` publish; `apps/ui/src/lib/jobEventStream.ts` `patchJobFromStream`.  
**Фикс:** `started_at` в status payload + merge в UI.  
**Статус:** **Fixed** + unit/sidecar tests.

---

### QA-03 · Medium — Table-hero: внешний скролл студии вместо внутренней таблицы

**Шаги:** Analysis, спектрограмма выкл., много детекций, окно ~900×600 или развёрнутый dock.  
**Факт:** `.predict-results-stage { min-height: min-content }` + table-hero `max-height: none` → stage растёт с контентом, скроллится вся студия.  
**Ожидание (TZ §2.2):** hero сжимается; скролл у `.analysis-detections-table-scroll`.  
**Где:** `analysis-lab.css` `.is-table-hero .predict-results-stage`.  
**Фикс:** `min-height: 0` / flex chain на stage в table-hero.  
**Статус:** **Fixed** + EK-7 gate. Дизайн таблицы не менялся.

---

### QA-04 · Medium — Table-hero: 3-колоночная сетка сегмент-рейла с пустой правой половиной

**Шаги:** Analysis, спектрограмма выкл.  
**Факт:** `fileNavOnly` прячет sep/right, но `grid-template-columns: 1fr auto 1fr` остаётся → контент в 1-й колонке, ~половина полосы пустая.  
**Ожидание:** полоса файла на всю ширину chrome (без сдвига макета при спектрограмме вкл.).  
**Где:** `SpectrogramFileSegmentRail` + `analysis-lab.css`.  
**Фикс:** класс `is-file-nav-only` → одна колонка.  
**Статус:** **Fixed**. Не меняет вид режима со спектрограммой.

---

### QA-05 · Medium — Studio footer таблицы: счётчик «в сегменте» при списке на весь файл

**Шаги:** Analysis (studio) → футер таблицы детекций.  
**Факт:** `effectiveScope === "file"`, но footer писал `footerSegmentShown` по `segmentRows` + total файла.  
**Ожидание:** один счётчик по видимым строкам файла (`footerFileShown`).  
**Где:** `SpectrogramDetectionsTable.tsx`.  
**Статус:** **Fixed**.

---

### QA-06 · Low — Подсказка Settings про «без фильтра классов»

**Факт:** `settings.showSpectrogramHint` утверждала отсутствие фильтра классов; кнопка «Классы» и модалка есть.  
**Фикс:** уточнён RU/EN hint (текст подсказки, не chrome).  
**Статус:** **Fixed**.

---

### QA-07 · Low — Клик по строке в table-hero крутит segment/tile/playhead

**Факт:** `focusDetection` всегда обновлял окно/тайлы при отсутствии plot.  
**Фикс:** early-return после `setSelectedSegment` при `!showSpectrogram`.  
**Статус:** **Fixed**.

---

### QA-08 · Info — Двойной класс `analysis-spectrogram-studio-host`

**Факт:** host на pane и на section. Сейчас безвредно; риск для будущих flex-правок.  
**Фикс:** отложен (не трогать без нужды).  
**Статус:** Open / Won't-fix сейчас.

---

## Масштабирование (сводка по разделам)

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная | flex / rem | OK |
| Проекты | cqh / flex | OK; wizard modal `vh` — по TZ |
| Параметры | `.pp-params-scroll` эталон | OK |
| Анализ + спектрограмма | cqh / flex + class rail | OK |
| Анализ table-hero | → QA-03/04 | Fixed |
| Фильтрация / Результаты / Модели / Задачи / Конвейер | cqh/flex / m16 | OK |
| Настройки / Справка | OK | |
| Dock | `clamp(…, 38cqh, 17.5rem)` | OK |

Запрещённые `vh` на высотах героев в studio CSS не найдены.

---

## orcAI fidelity (сводка)

| Команда | Desktop | CLI 3.0.2 |
|---------|---------|-----------|
| predict | `-c -m -md -o -th -ow -sp -bdr -cdl -ls -v` | ✓ |
| filter-predictions | `-cdl -o -ow -ls -v` | ✓ |
| train / finetune | `-p -ct -lm -lmf -v` | ✓ |
| hpsearch | `-p -hp -pl -ct -v` | ✓ |

Нет выдуманного CLI `-ft`.

---

## Тесты, обновлённые в этом прогоне

- `apps/ui/src/lib/jobEventStream.test.ts` — `started_at` из SSE  
- `apps/sidecar/tests/test_jobs.py` — publish включает `started_at`  
- `apps/ui/src/lib/ek7PredictResultsGate.test.ts` — table-hero stage / file-nav / focus early-return  
- `apps/ui/src/lib/ek10SettingsGate.test.ts` — host engine start на restart  
- `apps/ui/src/components/SpectrogramFileSegmentRail.test.tsx` — `is-file-nav-only`

---

## Чек-лист retest (живой `.app`)

1. [ ] Главная Запуск → движок ready; Настройки CPU↔GPU → движок снова ready без «idle».  
2. [ ] Задача в очереди: длительность с RUNNING не включает wait (сразу после старта).  
3. [ ] Analysis, спектрограмма выкл.: таблица под сегментами без большой дыры; много строк → скролл внутри таблицы.  
4. [ ] Полоса файла на всю ширину; кнопка «Классы» → фильтр без блока «Отображение»; чекбоксы/порог режут таблицу.  
5. [ ] Analysis, спектрограмма вкл.: сегмент-рейл и class sidebar как раньше (регресс).  
6. [ ] Футер таблицы studio: один счётчик «во всём файле».  
7. [ ] Resize / fullscreen / UI Scale 125–150 / dock expanded на Параметрах, Анализе, Задачах.

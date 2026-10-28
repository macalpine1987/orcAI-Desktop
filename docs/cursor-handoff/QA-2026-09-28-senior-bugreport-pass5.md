# Баг-репорт · Senior QA · orcAI Desktop v0.1.22 (проход 5)

**Роль:** Senior QA  
**Дата:** 2026-09-28  
**Объект:** полный Lab UI + sidecar + runtime; акцент — логика, fidelity к orcAI 3.0.2, масштабирование до fullscreen / UI Scale  
**База:** working tree после publication defaults + `dataHealthBannerEnabled` default **off**  
**Предыдущие:** `…-pass4.md`, `…-pass3.md`, `…-retest.md`, `…-senior-bugreport.md`  
**Метод:** статический разбор + gate/unit (bundled Python); живой UI retest stamp — Pending  
**Ограничение фикса:** **только код / логика / точные тексты статуса**; дизайн (токены, chrome, макеты) **не менять**

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после QA-21…24; живой fullscreen retest Analysis — желателен |
| Регресс QA-01…20 | **Hold** / Fixed по таблице ниже |
| orcAI fidelity | Board train не sticky-apply; opt-in apply_best → **temp `-p`** (как n_batch clamp); train `strict=False` |
| Layout scale | Heroes на cqh/flex; toast chrome `flex: 0 0 auto`; Analysis host stretch QA-21 — **Reverted** |
| «Предупреждения о данных» | Default **выкл.** (первый старт + factory reset); явный opt-in сохраняется |

Продукт в целом верен orcAI. В этом проходе закрыты логические дефекты без смены визуального языка. Дизайн не трогали (кроме обязательного chrome-lock на toast — без цветов/отступов).

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус |
|----|------|--------|
| QA-01 | Engine start → `invokeSidecarEngineStart` | Hold |
| QA-02 | SSE `started_at` | Hold |
| QA-03…07 | table-hero / rail / footer / focus / Settings | Hold |
| QA-08 | Двойной `analysis-spectrogram-studio-host` | Hold Fixed |
| QA-09 | Hydrate `largeWavOptimize` | Hold |
| QA-10→12 | Snippets readiness = **все** splits | Hold Fixed |
| QA-11 | Optimistic CPU/GPU | Hold |
| QA-13 | Shell banners `shrink-0` | Hold Fixed |
| QA-14 | Hint data-health + snippets | Hold Fixed |
| QA-15 | Board sticky `apply_best` | Hold Fixed в `apps/`; **был регресс в cache** → QA-22 |
| Publication preset button | Убрана; defaults 5 / 0.3 | Hold Fixed |
| dataHealth default | Было **on** → теперь **off** | Fixed (запрос продукта) |

---

## Новые дефекты (этот проход)

### QA-21 · Medium — Analysis спектрограмма не растягивалась до потолка `52cqh`

**Статус:** **Reverted** по запросу — возвращены `flex: 0 0 auto` у host/stack и `height: auto` у with-sidebar (как до фикса QA-21). Растягивание до `52cqh` снова не применяется.

---

### QA-22 · High — Bundled/cache sidecar отставал от `apps/sidecar` (sticky apply_best + train `strict=True`)

**Шаги:** Dev/`tauri` без `ORCAI_USE_DEV_PYTHON=1` → Python из `src-tauri/resources/python` → cache `~/.cache/orcai-desktop/python-bundle-…`.  
**Факт:** в cache: board Train выставлял `apply_best_hyperparameters=True` при любом `best_hyperparameters.json`; `run_train` clamp с `strict=True`. В `apps/` уже исправлено.  
**Ожидание:** runtime = исходники sidecar; board train без sticky; clamp non-strict.  
**Где:** symlink `resources/python` → cache site-packages.  
**Фикс (code-only):** `rsync` `apps/sidecar/src/orcai_desktop_sidecar/` → cache; `scripts/sync-sidecar-into-app.sh` на `/tmp/orcAI-Desktop_0.1.22_aarch64.app`.  
**Статус:** **Fixed** (cache + stamp). Перед следующей приёмкой повторять sync / embed pipeline.

---

### QA-23 · Medium — Opt-in `apply_best` переписывал проектный `-p` на диске

**Шаги:** Мастер с apply_best после hpsearch → train.  
**Факт:** `_apply_best_hyperparameters_before_train` делал `write_json(doc, path)` в файл проекта. Upstream `orcai train` не мутирует `-p` из артефактов hpsearch. Clamp n_batch уже использует temp.  
**Ожидание:** merge только для job (temp `-p`); on-disk parameter не меняется.  
**Где:** `apps/sidecar/.../adapters/training.py` `_apply_best_hyperparameters_before_train`.  
**Фикс:** temp dir `orcai_hps_apply_` + возврат пути; тест `test_apply_uses_temp_copy_without_rewriting_project_parameter`.  
**Статус:** **Fixed**.

---

### QA-24 · Low — Toast на Анализе без chrome shrink-lock

**Шаги:** Analysis + длинный toast + сжатое окно / 150% scale.  
**Факт:** `.predict-results-toast` — flex-ребёнок студии без `flex: 0 0 auto`.  
**Ожидание (TZ §2.2):** chrome не сжимается.  
**Фикс:** `flex: 0 0 auto` (цвета/padding не менялись). Gate в `layoutScaleGate.test.ts`.  
**Статус:** **Fixed**.

---

### QA-25 · High — Монитор обучения не открывался (регресс L-02 из pass4)

**Факт:** в pass4 окну `.tm-modal` добавили `container-type: size`. У окна нет заданной высоты (только `max-height`), а size containment не учитывает содержимое → окно схлопывалось до нулевой высоты, монитор выглядел незагруженным.  
**Фикс:** `container-type` у `.tm-modal` убран (как в v0.1.21); график по-прежнему ограничен `min(22rem, 45cqh)` от окна приложения. Gate `ek14TrainMonitorGate` теперь запрещает size-контейнер на `.tm-modal`.  
**Статус:** **Fixed**.

## Info (не дефект / не трогать без запроса)

| Тема | Вердикт |
|------|---------|
| FACTORY_MODEL kernel 5 / dropout 0.3 | Намеренно (публикация / isl-v1); ≠ package default 3/0.5 |
| `create-recording-table` post-fill call columns = True | Продуктовое расхождение с чистым CSV orcAI; не ломать без ТЗ |
| Init seed truncate для JS | Known Low fidelity; стабильность UI |
| Жёлтые «Сниппеты» + clamp Desktop | Ожидаемо; баннер за `dataHealthBannerEnabled` |
| `vh` у модалок | TZ §2.3 OK |
| Dock `38cqh` clamp | OK |
| filter-predictions + null min/max | ✓ |
| Host `sidecar_engine_start` | ✓ |

---

## Масштабирование (сводка)

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная / Проекты / Параметры | flex / cqh | OK |
| Анализ | cqh потолок; host `flex: 0 0 auto` | QA-21 Reverted |
| Фильтрация / Результаты / Модели / Задачи | cqh/flex | OK |
| Конвейер + shell banners | shrink-0 | OK |
| Настройки / Справка | flex | OK |
| Dock | `38cqh` | OK |
| Toast Analysis | `flex: 0 0 auto` | Fixed QA-24 |

Запрещённых `Nvh` на высотах героев студий не найдено.

---

## orcAI fidelity (сводка)

| Правило | Статус |
|---------|--------|
| `filter-predictions` | ✓ |
| null min/max `-cdl` | ✓ |
| train `-lm`/`-lmf`; нет CLI `-ft` | ✓ |
| hpsearch не 3-й сценарий | ✓ |
| Board без sticky apply_best | ✓ (+ cache sync QA-22) |
| apply_best → temp `-p` | ✓ QA-23 |
| `_clamp_n_batches` strict=False | ✓ (+ cache sync) |
| Snippets readiness все splits | ✓ |
| dataHealth default off | ✓ |
| Publication defaults в FACTORY_MODEL | ✓ |

---

## Тесты обновлены

| Файл | Что |
|------|-----|
| `apps/sidecar/tests/test_hps_merge.py` | temp `-p`, project file untouched |
| `apps/sidecar/tests/test_train_pipeline.py` | rename train-worst-split case |
| `apps/ui/src/lib/p13aSettingsGate.test.ts` | dataHealth default off + resolve `=== true` |
| `apps/ui/src/lib/layoutScaleGate.test.ts` | toast `flex: 0 0 auto` |

Прогон: sidecar `test_hps_merge` / `test_nbatch_clamp` / `test_train_pipeline` (bundled 3.11) — OK; UI gates layoutScale / p13a / ek7 / ek12 — 34 passed.

---

## Чек-лист живой приёмки (Pending)

1. Чистый prefs / factory reset → «Предупреждения о данных» **Выкл.**; баннеры скрыты.  
2. Вкл. → data-health + snippets shortage.  
3. Мастер шаг 4: defaults kernel 5 / dropout 0.3; «Вернуть значения»; нет «Пресет публикации».  
4. Board Train при наличии `best_hyperparameters.json` **без** opt-in — project `-p` и job без merge.  
5. Opt-in apply_best — train с winners, on-disk `-p` не меняется.  
6. Analysis fullscreen: спектрограмма как до QA-21 (stretch **Reverted**).  
7. UI Scale 150% + dock + 900×600 — banners/toast не клипятся.

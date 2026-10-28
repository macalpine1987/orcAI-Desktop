# Баг-репорт · Senior QA · orcAI Desktop v0.1.22 (проход 4)

**Роль:** Senior QA  
**Дата:** 2026-09-28  
**Объект:** полный Lab UI + sidecar + runtime; акцент — логика, fidelity к orcAI 3.0.2, масштабирование до fullscreen / UI Scale  
**База:** working tree после баннера сниппетов + gating «Предупреждения о данных»  
**Предыдущие:** `QA-2026-09-28-senior-bugreport.md`, `…-retest.md`, `…-pass3.md`  
**Метод:** статический разбор + gate/unit; живой `.app` — Pending  
**Ограничение фикса:** **только код / логика / точные тексты статуса**; дизайн (токены, chrome, макеты) **не менять**

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после QA-12…20; нужен живой retest stamp |
| Регресс QA-01…11 | **Hold** в дереве |
| orcAI fidelity | Readiness сниппетов теперь по **всем** splits (как `create_tvt`) |
| Layout scale | Heroes на cqh/flex; shell-баннеры — `shrink-0` (не клипятся) |
| «Предупреждения о данных» | Гейтит и data-health, и snippets-shortage; hint обновлён |

Продукт в целом верен orcAI. Найдены и **закрыты в коде** три логических дефекта. Дизайн не трогали.

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус |
|----|------|--------|
| QA-01 | Engine start CPU/GPU → `invokeSidecarEngineStart` | Hold |
| QA-02 | SSE `started_at` | Hold |
| QA-03…07 | table-hero scroll / rail / footer / focus / Settings hint | Hold |
| QA-08 | Двойной `analysis-spectrogram-studio-host` | **Fixed** (host только на Panel) |
| QA-09 | Hydrate `largeWavOptimize` при table-hero | Hold |
| QA-10 | Snippets readiness = train (+ filter) | Hold → уточнено QA-12 |
| QA-11 | Optimistic CPU/GPU preference | Hold |

---

## Новые дефекты (этот проход)

### QA-12 · Medium — Readiness «Сниппеты» смотрел только train, orcAI падает на любом split

**Шаги:** Достаточно train для `n_batch_train×batch_size`, но val/test меньше `n_batch_val|test×batch_size`.  
**Факт:** лампа могла быть зелёной; чистый orcAI в `create_tvt_snippet_tables` всё равно `ValueError` на val/test.  
**Ожидание (orcAI fidelity):** warn при нехватке **любого** запрошенного split; в KPI — worst shortfall (`split` + actual/required/n_batch).  
**Где:** `apps/sidecar/.../train_pipeline.py` (`inspect_pipeline` readiness.snippets).  
**Фикс (code-only):** перебор train/val/test; поле `split`; локали `snippetsSub` / баннер с `{{split}}`. UI-хром без изменений.  
**Статус:** **Fixed** + unittest (`test_snippets_readiness_warns_on_val_shortfall_when_train_ok`).

---

### QA-13 · Medium — Shell-баннеры в flex-колонке без `flex-shrink: 0`

**Шаги:** Конвейер + UI Scale 150% + развёрнутый dock + включённые «Предупреждения о данных» (длинный snippets banner) на ~900×600.  
**Факт:** баннеры — flex-дети `mat-shell-main` с default `flex-shrink: 1`; при `overflow: hidden` текст мог сжиматься/клипиться, hero студии «съедал» шапку.  
**Ожидание (TZ §2.2 chrome):** advisory chrome `flex: 0 0 auto` / `shrink-0`.  
**Где:** `PipelineSnippetsShortageBanner`, `ProjectDataHealthBanner`, `RuntimeRestartBanner`.  
**Фикс (code-only):** класс `shrink-0` на контейнерах. Цвета/отступы/`mb-4` не менялись.  
**Статус:** **Fixed** + EK-4 / EK-12 gate.

---

### QA-14 · Low — Hint «Предупреждения о данных» не описывал баннер сниппетов

**Шаги:** Настройки → Интерфейс → подсказка у переключателя; выключить → баннер сниппетов пропадает.  
**Факт:** hint говорил только про WAV/аннотации/таблицу; гейт уже покрывал и snippets shortage.  
**Ожидание:** точный текст статуса без смены chrome.  
**Где:** `locales/ru|en` `settings.dataHealthBannerHint`.  
**Фикс:** дополнить hint про `n_batch × batch_size`.  
**Статус:** **Fixed**.

---

## Info (не дефект / не трогать дизайн)

| Тема | Вердикт |
|------|---------|
| Жёлтые «Сниппеты» при clamp Desktop | Ожидаемо; баннер объясняет clamp; гейт — «Предупреждения о данных» |
| `vh` у модалок / popover shell-meta | По TZ §2.3 — OK |
| Dock `--m16-dock-h: clamp(10rem, 38cqh, 17.5rem)` | OK (`layoutScaleGate`) |
| table-hero `min-height: 0` на stage | Hold QA-03 |
| Health / capabilities только при `runtimeBase` | ✓ |
| `call_weights` → «Веса классов» | Семантически верно (Keras `class_weight`) |
| QA-08 двойной host спектрограммы | **Fixed** — host только на `PredictSpectrogramPanel` |

---

## Масштабирование (сводка)

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная / Проекты / Параметры | flex / cqh / эталон | OK |
| Анализ + table-hero | QA-03/04 Hold | OK в коде |
| Фильтрация / Результаты / Модели / Задачи | cqh/flex / m16 | OK |
| Конвейер + shell banners | flex + `shrink-0` | OK после QA-13 |
| Настройки / Справка | flex | OK |
| Dock | `38cqh` clamp | OK |
| Модалки wizard/monitor | `min(…, calc(100vh - 3rem))` | По TZ |

Запрещённых `Nvh` на высотах героев студий не найдено. `min-height: min-content` у `.pp-col` / settings cards — эталон Параметров (рост карточек, скролл снаружи).

---

## orcAI fidelity (сводка)

| Команда / правило | Статус |
|-------------------|--------|
| `filter-predictions` (не filter-annotations) | ✓ |
| null min/max `-cdl`; без затенения `default` | ✓ |
| train `-lm`/`-lmf`; нет CLI `-ft` | ✓ |
| hpsearch не 3-й сценарий мастера | ✓ |
| Host `sidecar_engine_start` | ✓ |
| `_clamp_n_batches_to_snippets` (filtered) | ✓ |
| Readiness snippets vs **всех** splits (+ filter) | ✓ после QA-12 |
| Snippets banner ↔ `dataHealthBannerEnabled` | ✓ |

---

### QA-08 · Info → Fixed — Двойной класс `analysis-spectrogram-studio-host`

**Факт:** host на `PredictAnalysisSpectrogramPane` wrap и на `PredictSpectrogramPanel` section.  
**Фикс:** убран wrap-host с Pane (fragment + hint); единственный host — section панели. CSS/макет без изменений.  
**Статус:** **Fixed** + EK-7 gate.

---

## Follow-up после субагентов (тот же проход)

Аудиты [QA audit logic/orcAI](8771d4cd-3ad9-41ce-b055-56f95f6b3b20) и [QA audit layout scale](b292f627-f50e-467b-8082-c56a1cf5bf20) подтвердили QA-13 (shrink-0) и уточнили дополнительные дефекты — **закрыты ниже**.

### QA-15 · High — `run_train` с `strict=True` блокировал train, который orcAI принял бы

**Факт:** при `available < batch_size` Desktop поднимал ValueError до вызова `orcai.train` (который читает TF datasets и не перепроверяет inventory).  
**Фикс:** `strict=False` в `run_train` (create-tvt по-прежнему non-strict + orcAI ValueError).  
**Статус:** **Fixed** + `test_nbatch_clamp`.

---

### QA-16 · Medium — Board Train sticky `apply_best_hyperparameters` от файла hpsearch

**Факт:** любой `best_hyperparameters.json` навсегда включал merge на ручном Train доски.  
**Ожидание:** только явный opt-in мастера (`plan.ts`).  
**Фикс:** убран auto-flag из `params_for("train")`.  
**Статус:** **Fixed** + unittest.

---

### QA-17 · Medium — Баннер сниппетов: честный clamp + sync с доской

**Факт:** tip всегда обещал успех clamp; отдельный poll 15s расходился с лампой.  
**Фикс:** `publishSnippetsReadiness` из PipelinePage; tip `…Clamp` / `…NoClamp` по `actual ≥ batch_size`.  
**Статус:** **Fixed**.

---

### QA-18 · Medium — MetricChart `45cqh` → fallback `vh` (портал вне size container)

**Фикс:** `container-type: size` на `.tm-modal`.  
**Статус:** **Fixed** + EK-14 gate.

---

### QA-19 · Low — Pipeline in-panel alerts без `flex: 0 0 auto`

**Фикс:** `.pp-error` / `.pp-notice` / `.pp-plan-banner` / `.pp-train-alert`.  
**Статус:** **Fixed**.

---

### QA-20 · Low — Empty spectrogram placeholder `min-h-[280px]`

**Фикс:** `min-h-40` (10rem), UI Scale-aware.  
**Статус:** **Fixed**.

---

## Тесты обновлены (включая follow-up)

- `apps/sidecar/tests/test_train_pipeline.py` — val shortfall; sticky hpsearch; OK inventory  
- `apps/sidecar/tests/test_nbatch_clamp.py` — non-strict path  
- `apps/ui/src/lib/ek12PipelineGate.test.ts` — banner bus / clamp tips / chrome flex  
- `apps/ui/src/lib/ek14TrainMonitorGate.test.ts` — tm-modal container-type  
- `apps/ui/src/lib/ek4HomeGate.test.ts` — banners + shrink-0  
- `layoutScaleGate` — Pass

---

## Retest checklist (живой `.app`)

1. Конвейер: train OK, val short → жёлтая лампа + sub с `val` + баннер (если предупреждения вкл.).  
2. Выкл. «Предупреждения о данных» → баннер скрыт, лампа остаётся.  
3. Баннер и лампа синхронны после смены n_batch (один poll доски).  
4. Board Train при старом `best_hyperparameters.json` **не** подмешивает hpsearch; мастер с opt-in — подмешивает.  
5. Train при inventory &lt; batch_size и готовых TVT datasets — не падает на Desktop strict (как CLI train).  
6. 900×600 + dock + UI Scale 150% + баннеры — текст шапки читаем.  
7. Монитор: график не раздувается сверх тела модалки.  
8. Fullscreen: Параметры / Анализ table-hero / Задачи / Конвейер.  
9. AUTONOMY GATE на stamp после следующей сборки.

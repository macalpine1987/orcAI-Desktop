# Баг-репорт · Senior QA · orcAI Desktop v0.1.22 (проход 3)

**Роль:** Senior QA  
**Дата:** 2026-09-28 (вечер)  
**Объект:** полный Lab UI + sidecar + runtime; акцент — логика, fidelity к orcAI 3.0.2, масштабирование до fullscreen / UI Scale  
**База:** working tree после UI-чисток (шапка pipeline, Help About, Settings, monitor legend, CPU/GPU restart copy)  
**Предыдущие:** `QA-2026-09-28-senior-bugreport.md`, `QA-2026-09-28-senior-bugreport-retest.md`  
**Метод:** статический разбор + gate/unit; живой `.app` — Pending  
**Ограничение фикса:** **только код / логика / точные тексты статуса**; дизайн (токены, chrome, макеты) **не менять**

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после QA-10 / QA-11; нужен живой retest stamp |
| Регресс QA-01…09 | **Hold** в дереве |
| orcAI fidelity | Уточнён readiness сниппетов (train / filter) |
| Layout scale | Heroes на cqh/flex; `vh` только у модалок — без новых дефектов |
| Недавние UI-чистки | Без битых i18n/gate ссылок |

Продукт в целом верен orcAI. Найдены и **закрыты в коде** два логических дефекта (см. ниже). Дизайн не трогали.

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус |
|----|------|--------|
| QA-01 | Engine start CPU/GPU → `invokeSidecarEngineStart` | Hold |
| QA-02 | SSE `started_at` | Hold |
| QA-03…07 | table-hero scroll / rail / footer / focus / Settings hint | Hold |
| QA-08 | Двойной `analysis-spectrogram-studio-host` | Open / Won't-fix |
| QA-09 | Hydrate `largeWavOptimize` при table-hero | Hold |

---

## Новые дефекты (этот проход)

### QA-10 · Medium — Readiness «Сниппеты» сравнивал `n_batch_train×batch_size` с сырым gzip (все splits)

**Шаги:** Иметь `all_snippets.csv.gz` с малым train и большим val/test; `n_batch_train×batch_size` > train, но < суммы всех строк.  
**Факт:** `actual = _gzip_data_rows` (все строки) → лампа могла быть зелёной при нехватке train; clamp при train использует **filtered train**.  
**Ожидание (orcAI fidelity):** `actual` = число **train**-сниппетов; при доступном orcAI — после `_filter_snippet_table` (как `create_tvt_snippet_tables`).  
**Где:** `apps/sidecar/.../train_pipeline.py` (`inspect_pipeline` readiness.snippets).  
**Фикс (code-only):** `_snippet_rows_by_type` (stdlib) + optional `_counts_after_orcai_filter`. UI/лампы не менялись — только источник `actual`/`state`.  
**Статус:** **Fixed** + unittest.

---

### QA-11 · Medium — Preference CPU/GPU обновлялся только после успешного рестарта

**Шаги:** Runtime активен → Настройки → переключить CPU↔GPU.  
**Факт:** `setComputeDevice(device)` вызывался **после** `await restartRuntimeForComputeDevice`; весь рестарт UI показывал старое устройство; при сбое mid-way preference и запущенный движок могли расходиться по цели.  
**Ожидание:** сразу зафиксировать целевое устройство; при ошибке — откат preference.  
**Где:** `SettingsRuntimePanel.tsx` `onComputeDeviceChange`.  
**Фикс (code-only):** optimistic `setComputeDevice(device)` → restart → `setComputeDevice(previous)` on catch. Сегмент-контроль / chrome без изменений.  
**Статус:** **Fixed** + EK-10 gate.

---

## Info (не дефект / не трогать дизайн)

| Тема | Вердикт |
|------|---------|
| Жёлтые «Сниппеты» при готовых TVT-датасетах | Ожидаемо при `actual < n_batch×batch_size` (после QA-10 — по train) |
| Сообщение рестарта в шапке + баннер | Дубль текста осознанный; design не менять |
| Убраны closeWindow / pathsFooter / wizard note / Help «Публикация» / packagedFiles | Нет битых ссылок; gates зелёные |
| MBA/val_MBA в шапке монитора | OK |

---

## Масштабирование (сводка)

| Раздел | Герой | Замечания |
|--------|-------|-----------|
| Главная / Проекты / Параметры | flex / cqh / эталон | OK |
| Анализ + table-hero | QA-03/04 Hold | OK в коде |
| Фильтрация / Результаты / Модели / Задачи / Конвейер | cqh/flex / m16 | OK |
| Настройки / Справка (2 колонки About) | flex | OK; 3-я колонка снята по запросу |
| Dock | `clamp(…, 38cqh, 17.5rem)` | OK |
| Модалки | `min(…, calc(100vh - 3rem))` | По TZ |

Запрещённых `Nvh` на высотах героев студий не найдено.

---

## orcAI fidelity (сводка)

| Команда / правило | Статус |
|-------------------|--------|
| `filter-predictions` (не filter-annotations) | ✓ |
| null min/max `-cdl`; без затенения `default` | ✓ |
| train `-lm`/`-lmf`; нет CLI `-ft` | ✓ |
| hpsearch не 3-й сценарий мастера | ✓ |
| Host `sidecar_engine_start` | ✓ |
| Readiness snippets vs train (+ filter) | ✓ после QA-10 |

---

## Тесты, обновлённые в этом прогоне

- `apps/sidecar/tests/test_train_pipeline.py` — warn state; train-split-only actual  
- `apps/ui/src/lib/ek10SettingsGate.test.ts` — optimistic computeDevice + rollback  
- Ранее зелёные: `shellMetaFrames`, `ShellMetaFrames`, `ek11HelpGate`, `showSpectrogram`

---

## Чек-лист retest (живой `.app`)

1. [ ] Главная Запуск → ready; Настройки CPU↔GPU: шапка сразу показывает сообщение о перезагрузке среды; сегмент сразу на новом устройстве; после готовности — движок ready.  
2. [ ] При ошибке рестарта сегмент CPU/GPU откатывается.  
3. [ ] Конвейер: readiness «Сниппеты» = train (после фильтра) / `n_batch×batch_size`; жёлтый при нехватке train даже если val/test много.  
4. [ ] `/pipeline` — без рамки predict-модели в шапке.  
5. [ ] Analysis table-hero / спектрограмма вкл. — регресс QA-03…07.  
6. [ ] Help · О программе — две колонки, без «Публикация» и без строки LICENSE/NOTICE.  
7. [ ] Resize / fullscreen / UI Scale 125–150 / dock expanded на Параметрах, Анализе, Задачах, Конвейере.

# Т-7 · Протокол приёмки — Обучение · конвейер (ЭК-12)

**Сборка:** исходник + штамп **`/tmp/orcAI-Desktop_0.1.18_aarch64.app`** (2026-09-20, AUTONOMY GATE PASSED; включает ЭК-12 + фикс скролла доски при раскрытой консоли)  
**Промпт:** П-7 · `docs/cursor-handoff/промты.md`  
**Макет:** `m07-train-pipeline.png`  
**Снимок по коду:** `m07-train-pipeline-from-code.png`  
**Требования:** FR-7.1 – FR-7.13 · UC-16, UC-18  

QA: **Senior QA**, повторная приёмка **2026-09-20** (после фикса D-08 и новой сборки `.app`).  
Первичная приёмка 2026-09-18: UI **Fail** (блокер D-08); фикс в коде в тот же день, повторный UI sign-off не проводился.

## Code gate

| Проверка | Статус |
|----------|--------|
| `apps/ui/src/lib/ek12PipelineGate.test.ts` | ☑ 7/7 (2026-09-20) |
| `apps/ui/src/lib/p15PortabilityGate.test.ts` (ЭК-2) | ☑ 4/4 (2026-09-20) |
| `apps/sidecar/tests/test_train_pipeline.py` | ☑ 11/11 (2026-09-20), в т.ч. D-08 |
| `tsc --noEmit` (`apps/ui`) | ☑ exit 0 (2026-09-20) |

```bash
cd apps/ui && npm run test -- src/lib/ek12PipelineGate.test.ts src/lib/p15PortabilityGate.test.ts
cd apps/ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
cd apps/sidecar && PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_train_pipeline.py' -v
```

## UI sign-off (QA)

**Итог:** ☑ **Pass** · дата **2026-09-20** · штамп `/tmp/orcAI-Desktop_0.1.18_aarch64.app`  
Живая доска (**E-05**) подтверждена пользователем (живой прогон 2026-09-20).

Блокер **D-08** закрыт в коде (2026-09-18) и подтверждён повторным прогоном sidecar 2026-09-20.

### Блок D · П-7 / Т-7

| ID | Критерий | Pass |
|----|----------|------|
| D-01 | 8 шагов в порядке orcAI; hpsearch необязателен и не блокирует train | ☑ |
| D-02 | Удалить каталог артефакта `spectrograms/` → `done` → `idle` без перезапуска процесса sidecar (`inspect_pipeline`); UI опрашивает 2 с + focus/visibility | ☑ (фикстура + gate) |
| D-03 | Смена влияющего параметра (`spectrogram.nfft`) → статус `stale` / «Устарело» | ☑ |
| D-04 | «Нет данных» всегда с ключом причины; test без `*.keras` → `missing_checkpoint` | ☑ |
| D-05 | Сниппеты vs n_batch × batch_size: лампа/подсчёт по готовности | ☑ |
| D-06 | UI: `done` → «Открыть» + «Ещё»/перезапуск; не «Запустить» | ☑ (gate) |
| D-07 | «Мастер обучения» / «Монитор» — кнопки входа (заметка ЭК-13/14, не полный UI) | ☑ (gate) |
| D-08 | **ГОТОВО только при своих артефактах.** `create-label-arrays` не `done`, если на диске только `spectrograms/…/spectrogram` | ☑ (фикстура `test_spectrograms_without_labels_are_not_done`) |

### Таблица шаг → состояние (фикстура Senior QA)

Команда: `inspect_pipeline(project_dir, …)` / `test_train_pipeline.py`. Каталог временный.

| Шаг | A пустой | B только `recording_table.csv` | C есть `spectrograms/` (без labels) | D `rmtree spectrograms/` | G TVT есть, нет keras |
|-----|----------|--------------------------------|-------------------------------------|---------------------------|------------------------|
| create-spectrograms | blocked `missing_recording_table` | **idle** | **done** | **idle** | done |
| create-label-arrays | blocked | blocked `no_annotations` | **blocked `no_annotations`** (не done) | blocked | blocked / idle по меткам |
| create-snippet-table | blocked | blocked | **blocked `missing_label_arrays`** | blocked | done (если есть all_snippets) |
| create-tvt-snippet-tables | blocked | blocked | blocked | blocked | done |
| create-tvt-data | blocked | blocked | blocked | blocked | done |
| hpsearch | blocked | blocked | blocked | blocked | **idle**, optional |
| train | blocked | blocked | blocked | blocked | **idle** (hpsearch не блокирует) |
| test | blocked `missing_checkpoint` | blocked `missing_checkpoint` | blocked `missing_checkpoint` | blocked `missing_checkpoint` | blocked `missing_checkpoint` |

Дополнительно (фикстуры): **E** nfft → `stale` / `params_changed_spectrogram`. **I** running job перекрывает disk `done`. Labels рядом со спектрограммой (`spectrograms/{rec}/labels`) → label-arrays **done**.

### Блок E · Макет / Lab / ЭК-1–2

| ID | Критерий | Pass |
|----|----------|------|
| E-01 | Студия m07: левая карта готовность+параметры, 8 карточек, статусы-пилюли | ☑ (код + gate) |
| E-02 | i18n RU/EN `pipeline.*` | ☑ |
| E-03 | `joinFsPath` на PipelinePage; CSS без `vh`; **общая прокрутка `.pp-body`** при открытой консоли (layout-scale) | ☑ (gate 2026-09-20) |
| E-04 | Справка `help?topic=train.pipeline` | ☑ |
| E-05 | Живая доска при запущенных Sidecar+движке на штампе `.app` | ☑ (живой прогон 2026-09-20) |

### Согласованные отклонения от m07

1. Версия окна **v0.1.18**, не v0.2.0 макета (версию не бампали).
2. Ряд «Сниппеты / n_batch × batch_size» в готовности — П-7 п.4, в PNG макета нет.
3. Левая карта — одна рамка + горизонтальный split.
4. Мастер / Монитор — вход, не экраны ЭК-13/14.

### Блокер D-08 (закрыт 2026-09-18, подтверждён 2026-09-20)

Причина: `_child_dir_count()` считал файлы спектрограмм артефактами меток.  
Фикс: только `{rec}/spectrogram` и `{rec}/labels`. Тесты `test_spectrograms_without_labels_are_not_done`, `test_labels_next_to_spectrograms_still_count`.

### Остаточный риск

- Stale по mtime всего `*_orcai_parameter.json`, не по ключам шага.
- orcAI: spectrogram+labels у одного родителя; Desktop — `spectrograms/` и `label_arrays/` раздельно (риск ЭК-13).
- NFR-13: лампа диска предупреждает, `runStep` не блокирует запуск.

---

## Чеклист живого UI (E-05) — выполнен 2026-09-20

Штамп: **`/tmp/orcAI-Desktop_0.1.18_aarch64.app`**

1. ☑ Запуск → Главная → **Запуск** (Sidecar + движок).
2. ☑ Проект → **Обучение**.
3. ☑ **8 шагов**; у `done` — **Открыть**.
4. ☑ Консоль раскрыта → прокрутка доски до последних шагов.
5. ☑ (по возможности) label-arrays не «Готово» без своих артефактов / D-08.
6. ☑ Справка → глава конвейера.

**ЭК-12 / Т-7 закрыт:** code gate Pass + UI sign-off Pass.
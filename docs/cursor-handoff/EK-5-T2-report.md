# ЭК-5 / П-2 → Т-2 — отчёт (Проекты)

**Дата:** 2026-09-08  
**Этап:** ЭК-5 · **П-2 → Т-2**  
**Макеты:** `m02-projects.png`, `m23-projects-annotations.png`, `m24-projects-artifacts.png`, `m25-projects-params.png`, `m32-project-wizard.png`, `m33-project-empty.png`, `m34-project-field.png`, `m35-project-lab.png`, `m36-project-readiness.png`  
**Сборка:** `/tmp/orcAI-Desktop_0.1.10_aarch64.app` (v0.1.10) · **AUTONOMY GATE** — см. прогон `build-macos-release.sh`  
**Dev-stamp ЭК-5:** `/tmp/orcAI-Desktop_0.1.9-ek5_aarch64.app` (до бампа версии)

**Итог code gate:** **Pass** (2026-09-08)  
**Итог UI приёмки:** ожидает sign-off пользователя по `T-2-protocol.md`

---

## Сделано (актуальный UI)

### Шапка и действия (m02)
- `ProjectsActionsBar` — «Создать проект» · «Открыть папку» · «Обновить таблицу» (+ CLI-подсказка `create-recording-table -ut -up`)
- `ProjectHeaderCard` — имя, путь, «активен» / «инициализирован»; метрики: **фокус · записи (кол-во + часы) · аннотации · классы**; список остальных проектов (активировать / изменить / удалить из списка или с файлами / init); **переключатель фокуса**

### Готовность данных (m36, FR-2.16)
- `ProjectReadinessPanel` — пять карточек-ламп: записи · аннотации · predict · датасеты · модель (`ready` / `needed` / `empty` из `/summary`)
- «Следующие шаги» с CLI-командой на каждом шаге → переход в `/predict`, `/pipeline`, filter
- Строка UC-24 «проект готов … `predict -md`» при полной готовности
- Offline → подсказка, никаких «готово»

### Вкладки (m02, m23–m25)
| Вкладка | Компонент | Источник |
|---|---|---|
| Записи | `ProjectRecordingsTab` | `GET /v1/projects/{id}/recording-table`, `PATCH …/recording-table/rows/{recording}` |
| Аннотации | `ProjectAnnotationsTab` | `GET /v1/projects/{id}/annotations` |
| Артефакты | `ProjectArtifactsTab` | `GET /v1/projects/{id}/artifacts` |
| Параметры | `ProjectParametersTab` | `GET/PUT /v1/projects/{id}/parameters`, `POST …/parameters/validate` |

- **Записи:** все строки `recording_table.csv`; оригинальные столбцы (`duplicate`, `base_dir_recording`, `rel_recording_path`, `base_dir_annotation`, `rel_annotation_path`) показываются по кнопке «Показать столбцы CSV» **без переименования**; вычисляемые: частота, длительность, аннотация, распознавание (`*_predicted.txt` + статус задач), размер; **канал редактируется в строке** (PATCH → CSV); **96 кГц → 48 кГц** метка + примечание в подвале; WAV вне таблицы → «нет в таблице» + «таблица устарела»
- **Обновить таблицу** — всегда явное действие с диалогом (merge / create / rebuild) → `create-recording-table -ut -up`
- **Аннотации:** классы из таблицы записей (fallback — параметры); пустая ячейка подписана **«класс замаскирован»**; подвал: всего меток + метки вне списка
- **Артефакты:** спектрограммы · массивы меток · датасеты · модели · предсказания — файлов, объём, обновлено, «Открыть»
- **Параметры:** `<имя>_orcai_parameter.json`, live-валидация (ошибки/предупреждения), сохранение только валидного JSON, экспорт

### Мастер (m32, FR-2.14 / FR-2.15 / FR-2.17)
- `ProjectCreateWizard` — три карточки мягкого фокуса (полевое распознавание · обучение модели · полный цикл) с CLI-подсказкой; имя + папка → превью `<папка>/<slug>`; «Далее · init» → фаза init (ждёт движок → `orcai init`)
- Фокус хранится **только** в Desktop SQLite (`project_focus`); в `*_orcai_parameter.json` / CSV ничего не пишется
- CLI-проект без строки в SQLite → фокус «полный цикл» (или по артефактам), `focus_source = inferred`

### Empty state и акценты (m33 / m34 / m35)
- m33: после init — «добавьте WAV → обновите таблицу», кнопки добавить WAV · обновить таблицу · открыть каталог
- m34 (полевой): подсказка + CTA «Распознать»; m35 (лабораторный): акцент на аннотациях, кнопка «Мастер обучения»; **оба пути доступны** всегда

### Soft focus вместо hard lock
- Удалены `navAllowedForProjectKind`, `isRouteAllowedForProjectKind`, `trainingProjectRedirectPath` (`projectKind.ts`), их использование в `AppShell`, `CommandPalette`, `RuntimeRouteGuard`
- Разделы «Распознавание» / «Обучение» не скрываются по фокусу

### Sidecar
- `project_studio.py` — новый модуль (таблица, канал, аннотации, артефакты, параметры)
- `project_registry.py` — `focus` в `project_to_dict`, `create_project(focus=)`, `set_project_focus`, `_detect_cli_orcai_name` (имя из `<name>_orcai_parameter.json`, даже если отличается от slug папки)
- `store.py` — таблица `project_focus`, каскадное удаление
- Регистр имён: строки `Call_A` / `call_a` **не** схлопываются (тест `test_case_sensitive_stems_are_not_collapsed`)

### Сборка
- `embed-python-framework.sh` — физические пути (`pwd -P` + `realpath`): при `/tmp` → `/private/tmp` относительный `@loader_path` раньше строился через `/` и embed падал на import-smoke

---

## Тесты

| Набор | Файл | Кейсы | Результат |
|---|---|---:|---|
| UI static gate | `apps/ui/src/lib/ek5ProjectsGate.test.ts` | 12 | Pass |
| UI components (happy-dom) | `apps/ui/src/components/projects/ProjectsStudio.test.tsx` | 9 | Pass |
| UI unit | `apps/ui/src/lib/projectsStudio.test.ts`, `projectKind.test.ts` | 13 + 1 | Pass |
| UI весь suite | `npm run test` | 92 файла · 527 тестов | Pass |
| Sidecar | `apps/sidecar/tests/test_project_studio.py` (bundled Python 3.11) | 10 | Pass |
| `tsc --noEmit` | — | — | Pass |
| `ruff check` | — | 3 pre-existing (`test_p15_extended.py`, есть в baseline v0.1.9) | без новых |

Полный sidecar-suite: те же pre-existing FAIL/ERROR, что и в baseline v0.1.9 (не связаны с ЭК-5).

---

## Принятые отклонения

- **Readiness на Главной (m37)** — П-2 п.3 упоминает панель «и на Главной»; по решению продукта на ЭК-4 Home остаётся по m01 без отдельной «Готовности». Панель m36 реализована в «Проектах»; `HomeReadinessPanel` сохранён, не рендерится.
- **Live UI-прогон** — dev-режим в браузере не поднимает runtime (Sidecar control только в Tauri); сборка `.app` собрана и запущена с изолированным `HOME=/tmp/orcai-ek5-home` и тестовым CLI-проектом `/tmp/orcai-ek5-demo/Fjord-Field-2026`. Визуальный sign-off по m33/m34/m35/m36 — за пользователем (`T-2-protocol.md`).

---

## Открыто для формального закрытия этапа

- [ ] Ручной UI sign-off A–F в `T-2-protocol.md` на `/tmp/orcAI-Desktop_0.1.10_aarch64.app`
- [ ] Скрины m33 / m34 / m35 / панели готовности
- [x] Зафиксировано как **v0.1.10** (`build-macos-release.sh` + baseline)

---

## Следующий этап

**ЭК-6 / П-3 → Т-3** — Распознавание · Параметры (m03)

# Протокол приёмки Т-2 · ЭК-5 «Проекты»

**Этап:** ЭК-5 (П-2 → Т-2)  
**Макеты:** `mockups/m02-projects.png`, `m23-projects-annotations.png`, `m24-projects-artifacts.png`, `m25-projects-params.png`, `m32-project-wizard.png`, `m33-project-empty.png`, `m34-project-field.png`, `m35-project-lab.png`, `m36-project-readiness.png`  
**Требования:** FR-2.1 – FR-2.17 · **Сценарии:** UC-02 – UC-05, UC-17, UC-24

---

## Метаданные прогона

| Поле | Значение |
|------|----------|
| Дата | 2026-09-08 |
| Тестировщик | Cursor agent (code gate) + пользователь (UI sign-off) |
| Сборка | `/tmp/orcAI-Desktop_0.1.10_aarch64.app` (v0.1.10; ранее dev-stamp `0.1.9-ek5`) |
| AUTONOMY GATE | ☐ PASSED (после сборки) |
| Тестовый проект | `orcai init` в терминале: `/tmp/orcai-ek5-demo/Fjord-Field-2026` |
| macOS / разрешение | ☐ 1280×800 · ☐ Full Screen |

**Итог прогона:** ☐ **Pass** ☐ **Fail** ☐ **Pass с замечаниями**

---

## Блок A · Мастер и фокус (m32, FR-2.14 / FR-2.15 / FR-2.17)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| A-01 | «Создать проект» | Три карточки фокуса: полевое распознавание · обучение модели · полный цикл; под каждой — CLI-подсказка | ☐ | ☐ |
| A-02 | Имя + папка | Превью пути `<папка>/<slug>`; «Далее · init» неактивна без имени/папки/Sidecar | ☐ | ☐ |
| A-03 | Далее | Фаза init: статус-строка, карточки скрыты; после завершения проект активен, вкладка «Записи» | ☐ | ☐ |
| A-04 | Фокус в SQLite | В `<проект>/*_orcai_parameter.json` и `recording_table.csv` **нет** поля фокуса; `focus_source = stored` | ☐ | ☐ |
| A-05 | Каждый из трёх фокусов | Подсказки/акценты меняются; разделы «Обучение» и «Распознавание» доступны в навигации всегда | ☐ | ☐ |
| A-06 | Смена фокуса в шапке | Переключатель в карточке проекта; UI перестраивается без пересоздания проекта | ☐ | ☐ |

---

## Блок B · CLI-проект и шапка (m02, FR-2.1 – FR-2.4)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| B-01 | «Открыть папку» → проект из `orcai init` | Открывается полностью; имя берётся из `<name>_orcai_parameter.json`, даже если не совпадает со slug папки | ☐ | ☐ |
| B-02 | Фокус CLI-проекта | Без записи в SQLite: «полный цикл» (или по артефактам); `focus_source = inferred` | ☐ | ☐ |
| B-03 | Шапка | Имя, путь, статусы «активен» / «инициализирован»; метрики: фокус · записи (кол-во + часы) · аннотации · классы | ☐ | ☐ |
| B-04 | Список проектов | Раскрывающийся список остальных; активировать / изменить / удалить (из списка или с файлами) | ☐ | ☐ |

---

## Блок C · Готовность данных (m36, FR-2.16)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| C-01 | Панель | Пять карточек: записи · аннотации · predict · датасеты · модель; лампа зелёная/жёлтая/серая | ☐ | ☐ |
| C-02 | Добавить WAV + аннотации на диске | Индикаторы обновляются автоматически (poll / focus), без пересоздания проекта | ☐ | ☐ |
| C-03 | «Следующие шаги» | Список действий с CLI-командой; клик ведёт в раздел (predict / pipeline / filter) | ☐ | ☐ |
| C-04 | Всё готово | Строка UC-24 «проект готов … predict -md с моделью из этой папки» | ☐ | ☐ |
| C-05 | Sidecar offline | Подсказка вместо карточек, без «готово» | ☐ | ☐ |

---

## Блок D · Вкладка «Записи» (m33 / m34 / m35, FR-2.5 – FR-2.9)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| D-01 | Пустой проект после init (m33) | Заголовок + шаги; empty: иконка WAV + **одна** кнопка «Добавить WAV» + drop-hint; «Обновить таблицу» — в toolbar при наличии таблицы (disabled при auto-sync CSV) | ☐ | ☐ |
| D-02 | Таблица | Строки = `recording_table.csv`; «Показать столбцы CSV» раскрывает `duplicate`, `base_dir_recording`, `rel_recording_path`, `base_dir_annotation`, `rel_annotation_path` **без переименования** | ☐ | ☐ |
| D-03 | Вычисляемые столбцы | Частота, длительность, аннотация (точка), распознавание (pill), размер | ☐ | ☐ |
| D-04 | Канал | Редактируется в строке; PATCH пишет в CSV; `channel` в CSV совпадает с UI | ☐ | ☐ |
| D-05 | 96 кГц | Метка «→ 48 кГц» у строки и примечание в подвале | ☐ | ☐ |
| D-06 | WAV на диске вне таблицы | Строка с меткой «нет в таблице», предупреждение «таблица устарела» | ☐ | ☐ |
| D-07 | «Обновить таблицу» | Диалог подтверждения (merge / create / rebuild) → `create-recording-table -ut -up`; без подтверждения CSV не трогается | ☐ | ☐ |
| D-08 | Столбец распознавания | Синхронен с `*_predicted.txt` на диске (done / running / failed / —) | ☐ | ☐ |
| D-09 | Регистр имён | Две строки `Call_A` / `call_a` не схлопываются | ☐ | ☐ |
| D-10 | Полевой (m34) / лабораторный (m35) | m34: подсказка field + CTA «Распознать» на tab strip страницы; m35: без CTA predict, акцент на аннотациях; оба пути доступны | ☐ | ☐ |

---

## Блок E · Аннотации · Артефакты · Параметры (m23 – m25, FR-2.10 – FR-2.13)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| E-01 | Аннотации | Строки = записи; столбцы = классы из таблицы записей (или параметров) | ☐ | ☐ |
| E-02 | Пустая ячейка класса | Подписана как «класс замаскирован», не «0» | ☐ | ☐ |
| E-03 | Подвал | Всего меток; метки вне списка классов перечислены | ☐ | ☐ |
| E-04 | Артефакты | Спектрограммы · массивы меток · датасеты · модели · предсказания: файлов, объём, обновлено, «Открыть» | ☐ | ☐ |
| E-05 | Параметры | JSON `<имя>_orcai_parameter.json`; live-валидация; «Сохранить» только при валидном JSON; экспорт | ☐ | ☐ |

---

## Блок F · DPI / Full Screen (NFR-17 регресс)

| ID | Пресет | Проекты не обрезаны | Pass | Fail |
|----|--------|:-------------------:|:----:|:----:|
| F-01 | 125% | ☐ | ☐ | ☐ |
| F-02 | 150% | ☐ | ☐ | ☐ |
| F-03 | Full Screen | ☐ | ☐ | ☐ |

---

## Code gate (автоматически)

| Проверка | Статус |
|----------|--------|
| UI static gate `ek5ProjectsGate.test.ts` (вкладки, мастер, readiness, empty state, soft focus, i18n) | ☑ Pass |
| UI components `ProjectsStudio.test.tsx` (Wizard m32, Recordings m33/m34/m35, Readiness m36, Tabs m02) | ☑ Pass |
| UI page `ProjectsPage.test.tsx` (tab-strip Predict CTA, stale/missing CSV gate, navigate) | ☑ Pass |
| UI extras `ProjectStudioExtras.test.tsx` (m24 artifacts, m25 params, WAV/TXT drop hooks) | ☑ Pass |
| UI unit `projectsStudio.test.ts`, `projectKind.test.ts` | ☑ Pass |
| Sidecar `tests/test_project_studio.py` (focus SQLite, CLI name, table+channel, case-sensitive stems, masked classes, artifacts, parameters) | ☑ Pass |
| `tsc --noEmit`, `ruff check` | ☑ Pass |

Команды:

```bash
cd apps/ui && npm run test -- \
  src/lib/ek5ProjectsGate.test.ts \
  src/lib/projectsStudio.test.ts \
  src/lib/projectKind.test.ts \
  src/components/projects/ProjectsStudio.test.tsx \
  src/components/projects/ProjectStudioExtras.test.tsx \
  src/pages/ProjectsPage.test.tsx

cd apps/sidecar && PYTHONPATH=src python3 -m unittest tests.test_project_studio -v
```

---

## Артефакты

| Файл | Назначение |
|------|------------|
| `EK-5-T2-report.md` | Отчёт закрытия этапа |
| `T-2-projects-m33.png` | Скрин пустого состояния |
| `T-2-projects-m34.png` / `T-2-projects-m35.png` | Скрины полевого / лабораторного фокуса |
| `T-2-projects-readiness.png` | Скрин панели готовности |

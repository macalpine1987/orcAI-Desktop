# Протокол приёмки Т-1 · ЭК-4 «Главная»

**Этап:** ЭК-4 (П-1 → Т-1)  
**Макеты:** `mockups/m01-home.png`, `mockups/m37-home-readiness.png`  
**Требования:** FR-1.1 – FR-1.7, FR-2.11, FR-2.16 · **Сценарий:** UC-01

---

## Метаданные прогона

| Поле | Значение |
|------|----------|
| Дата | 2026-09-02 |
| Тестировщик | Cursor agent (code gate) + пользователь (UI sign-off) |
| Сборка | `/tmp/orcAI-Desktop_0.1.8_aarch64.app` |
| AUTONOMY GATE | ☐ PASSED (после сборки) |
| macOS / разрешение | ☐ 1280×800 · ☐ Full Screen |

**Итог прогона:** ☐ **Pass** ☐ **Fail** ☐ **Pass с замечаниями**

---

## Блок A · Среда выполнения (m01)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| A-01 | Запуск вручную с Главной | 4 строки: Sidecar, движок, Python, ускоритель; у каждой точка-индикатор | ☐ | ☐ |
| A-02 | После старта | Sidecar показывает порт; orcAI/Python/ускоритель — версии мелким шрифтом | ☐ | ☐ |
| A-03 | Кнопки | «Перезапустить» + «Остановить» при running; «Запуск» при stopped | ☐ | ☐ |
| A-04 | Автозапуск | По умолчанию выключен; подпись «Автозапуск выключен» | ☐ | ☐ |

---

## Блок B · Проект и готовность (m37)

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| B-01 | Активный проект + Sidecar online | LCD: записи/аннотации/распознано/модель из `/summary`, не hardcode | ☐ | ☐ |
| B-02 | recording_table.csv | Строка sync: актуальна / устарела / отсутствует | ☐ | ☐ |
| B-03 | Readiness panel | **Deferred → ЭК-5** (m37 не на Home; см. отчёт). API + `HomeReadinessPanel` сохранены | ☐ | ☐ |
| B-04 | Без движка, Sidecar online | Summary и readiness видны (не требуют engineReady) | ☐ | ☐ |

---

## Блок C · Быстрые действия

| ID | Действие | Переход | Pass | Fail |
|----|----------|---------|:----:|:----:|
| C-01 | Распознать | `/predict` · tab run | ☐ | ☐ |
| C-02 | Обучить | `/pipeline` | ☐ | ☐ |
| C-03 | Отфильтровать | `/predict` · tab filter | ☐ | ☐ |
| C-04 | Результаты | `/results` | ☐ | ☐ |

---

## Блок D · Задачи и header

| ID | Шаг | Ожидание | Pass | Fail |
|----|-----|----------|:----:|:----:|
| D-01 | Последние задачи | 5 колонок; running без времени завершения | ☐ | ☐ |
| D-02 | ShellMetaFrames | Проект · модель · движок на Главной и других разделах | ☐ | ☐ |

---

## Блок E · DPI / Full Screen (NFR-17 регресс)

| ID | Пресет | Карточки Home не обрезаны | Pass | Fail |
|----|--------|:-------------------------:|:----:|:----:|
| E-01 | 125% | ☐ | ☐ | ☐ |
| E-02 | 150% | ☐ | ☐ | ☐ |
| E-03 | Full Screen | ☐ | ☐ | ☐ |

---

## Code gate (автоматически)

| Проверка | Статус |
|----------|--------|
| UI static gate `ek4HomeGate.test.ts` (T-1 A–D + locales + orcAI pin) | ☑ Pass |
| UI components: `RuntimeControlPanel`, `HomeProjectCard`, `HomeRecentJobs` | ☑ Pass |
| UI unit: `projectSummaryFormat`, `shellMetaFrames` | ☑ Pass |
| Sidecar `test_compute_project_summary_*` (counts + sync states) | ☑ Pass |

Команда:

```bash
cd apps/ui && npm run test -- \
  src/lib/ek4HomeGate.test.ts \
  src/lib/projectSummaryFormat.test.ts \
  src/lib/shellMetaFrames.test.ts \
  src/components/RuntimeControlPanel.test.tsx \
  src/pages/home/HomeProjectCard.test.tsx \
  src/pages/home/HomeRecentJobs.test.tsx

cd apps/sidecar && PYTHONPATH=src python3 -m unittest \
  tests.test_projects.ProjectRegistryTests.test_compute_project_summary_counts_and_readiness \
  tests.test_projects.ProjectRegistryTests.test_compute_project_summary_recording_table_sync_states -v
```

Отчёт прогона: `docs/cursor-handoff/EK-4-T1-QA-tests.md`

---

## Артефакты

| Файл | Назначение |
|------|------------|
| `EK-4-T1-report.md` | Отчёт закрытия этапа |
| `T-1-home-1280.png` | Скрин Главной 1280×800 |
| `T-1-home-fullscreen.png` | Скрин Full Screen |

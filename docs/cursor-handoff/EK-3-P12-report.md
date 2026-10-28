# ЭК-3 / П-12 — отчёт (Задачи и консоль)

**Дата:** 2026-09-01  
**Этап:** ЭК-3 · **П-12**  
**Макеты:** `m16-tasks.png`, `m26-console-errors.png`, `m27-console-command.png`

## Сделано

### JobsPage (m16)
- Таблица: команда, объект, статус, прогресс, начало, длительность
- Фильтры: Все / Активные / Ошибки / История
- Действия: отменить (running), убрать (pending), повторить (failed), открыть (completed → copy path)
- Полная история (без фильтра project_dir)
- Экспорт лога выбранной задачи

### LabDock (консоль)
- Вкладки: **Лог**, **Инспектор**, **Ошибки**, **Команда**
- Лог: incremental poll `/v1/jobs/{id}/log?since=`
- Ошибки: список failed + badge count + переход к задаче
- Команда: `command_line` + копирование
- Свёрнутая полоса: активная задача + статус + прогресс %
- Копировать / экспорт лога

### Lib / hooks
- `jobFormat`, `jobTargetLabel`, `jobOpenResult`, `jobLogExport`
- `useJobsList`, `useJobLogTail`
- API: `fetchJobLogSince`, `fetchJobsQueue`

## Тесты
- `jobFormat.test.ts` — 6
- `jobTargetLabel.test.ts` — 4

## Следующий этап
**ЭК-4 / П-1 → Т-1** — Главная (m01, m37). ЭК-3a закрыт — см. `EK-3a-T13a-report.md`.

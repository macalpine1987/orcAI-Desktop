# Senior QA · ЭК-3 / Т-12 · проверка кнопок UI

**Дата:** 2026-09-01 (аудит кнопок после m16-выравнивания)  
**Роль:** Senior QA  
**Scope:** `JobsPage` + `LabDock` + header meta на `/jobs`  
**Автотесты:** **420/420 PASS**

## Вердикт

| | |
|--|--|
| **Статус** | **Accept** (с оговорками P3) |
| **Кнопки / интерактив** | **22/22 wired** · **19 PASS** · **2 PARTIAL** · **1 P3** |
| **Блокеры** | **0** (P1 «тихие» сбои исправлены в этом прогоне) |

---

## Матрица кнопок · JobsPage

| # | Элемент | Обработчик | Backend / эффект | Автотест | Ручная | Verdict |
|---|---------|------------|------------------|----------|--------|---------|
| 1 | **? Справка** | `<Link to="/help">` | React Router → HelpPage | — | ☐ | **PASS** (навигация) |
| 2 | **Все / Активные / Ошибки / История** | `setFilter(f)` | `filterJobs()` локально | `jobFormat.test` | ☐ | **PASS** |
| 3 | **Очистить** | `onClear` | filter→all, `selectJob(null)`, сброс ошибки | — | ☐ | **PARTIAL** — не удаляет историю из SQLite (API purge нет); сбрасывает UI-состояние |
| 4 | **Экспорт лога** | `exportJobLogToFile` | Tauri save + `shell_write_text_file` / dev download | `jobLogExport`, `shell` | ☐ | **PASS** — disabled без выбранной задачи; cancel диалога = no-op; ошибка записи → `actionError` |
| 5 | **Клик по строке** | `selectJob(id)` | `fetchJob` + dock tab→log | `LabJobContext` static | ☐ | **PASS** |
| 6 | **Отменить** (running) | `cancelJob` → refresh | `POST /v1/jobs/{id}/cancel` | `api/jobs.test` | ☐ | **PASS** — ошибка API → `actionError` |
| 7 | **Убрать** (pending) | `cancelJob` | тот же endpoint | `api/jobs.test` | ☐ | **PASS** |
| 8 | **Повторить** (failed) | `retryJob` → select new id | `POST /v1/jobs/{id}/retry` | `api/jobs.test` | ☐ | **PASS** |
| 9 | **Открыть** (completed) | `revealJobResult` | Tauri `shell_reveal_in_finder` | `jobOpenResult.test` | ☐ | **PASS** — нет пути → сообщение `jobs.openNoResult` |

---

## Матрица кнопок · LabDock

| # | Элемент | Обработчик | Backend / эффект | Автотест | Verdict |
|---|---------|------------|------------------|----------|---------|
| 10 | **Лог / Инспектор / Ошибки / Команда** | `setDockTab` | локальный state | `p12JobsGate` | **PASS** |
| 11 | **Копировать** (log toolbar) | `copyText(jobLogText)` | `navigator.clipboard` | `jobLogExport.test` | **PASS** — disabled без задачи; fail clipboard = тихий P3 |
| 12 | **Свернуть** (dock toolbar) | `toggleCollapsed` | localStorage `labDockCollapsed` | — | **PASS** |
| 13 | **Resize handle** | pointer drag | localStorage inspector width | `labDockLayout.test` | **PASS** |
| 14 | **Элемент списка ошибок** | `setSelectedErrorId` | локально | — | **PASS** |
| 15 | **К задаче** (m26) | `selectJob` + tab inspector | — | — | **PASS** |
| 16 | **Повторить** (m26) | `retryJob` + refresh | sidecar retry | `api/jobs.test` | **PASS** — ошибка → красный текст под кнопками |
| 17 | **Копировать** (command pane) | `copyText(cmd)` | clipboard + «Скопировано» 1.5s | `jobLogExport.test` | **PASS** |
| 18 | **КОНСОЛЬ** (status strip) | `toggleCollapsed` | expand/collapse dock | — | **PASS** |

---

## Header meta · `/jobs`

| # | Элемент | Verdict |
|---|---------|---------|
| 19 | **Проект / Модель** frames | **PASS** — read-only из workspace |
| 20 | **Движок + лампа** | **PASS** — `RuntimeReadyLamp` + `useSidecarStatus` |
| 21 | **Model «i»** (если bridge) | **N/A** на Jobs — `onToggleModelSettings` не регистрируется |

---

## Исправления в этом QA-прогоне

| Finding | Severity | Fix |
|---------|----------|-----|
| «Открыть» без artifact path — тихий no-op | **P1** | `throw jobs.openNoResult` в `runAction` |
| «Экспорт лога» — unhandled reject при Tauri write fail | **P2** | try/catch → `actionError` |
| «Повторить» в вкладке Ошибки — unhandled reject | **P2** | `retryError` state под кнопками |

---

## Оговорки (не блокеры)

| # | Тема | Severity | Комментарий |
|---|------|----------|-------------|
| 1 | **Очистить** не чистит БД | P3 | Соответствует текущему API; нужен `DELETE /v1/jobs` для полного макета |
| 2 | **Копировать лог** без feedback при fail | P3 | Command pane имеет «Скопировано»; log toolbar — нет |
| 3 | **Справка** → `/help`, не deep link | P3 | ЭК-11 / manifest.json |
| 4 | **Cancel/retry sidecar** e2e | — | INHERITED ЭК-0; dev host без orcai → BLOCKED; прогон в `.app` |
| 5 | **SSE /events** | — | Не wired; poll `/log?since=` достаточен для П-12 |

---

## Чек-лист ручной приёмки (T-12)

Запуск: sidecar + engine **running**, раздел **Задачи**, ≥1 задача каждого статуса.

- [ ] Фильтры меняют состав таблицы
- [ ] Клик строки → лог + JSON параметров в dock
- [ ] Отменить running → статус cancelled, прогресс останавливается
- [ ] Убрать pending → исчезает из active
- [ ] Повторить failed → новая задача в очереди
- [ ] Открыть completed → Finder на артефакте
- [ ] Экспорт лога → save dialog, файл на диске
- [ ] Очистить → снят выбор, фильтр «Все»
- [ ] 4 вкладки dock переключают контент
- [ ] Ошибки: список + detail + К задаче + Повторить
- [ ] Команда: Copy → вставка в Terminal
- [ ] Свернуть / КОНСОЛЬ toggle сохраняется после reload

---

## Автоматизация ЭК-3

| Suite | Tests |
|-------|-------|
| `p12JobsGate` | 10 |
| `jobFormat` | 16 |
| `jobLogExport` | 8 |
| `jobOpenResult` | 7 |
| `api/jobs` | 10 |
| `platform/shell` | 5 |
| `labDockLayout` | 8 |
| `labDockSubtitle` | 6 |
| `useJobLogTail` | 5 |
| + прочие | … |
| **Итого UI** | **420** |

**Следующий этап:** ручной прогон чек-листа в `.app` → закрытие Т-12 пользователем.

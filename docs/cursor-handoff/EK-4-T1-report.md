# ЭК-4 / П-1 → Т-1 — отчёт (Главная)

**Дата:** 2026-09-02  
**Этап:** ЭК-4 · **П-1 → Т-1**  
**Макеты:** `m01-home.png` (целевой UI); `m37-home-readiness.png` — **отложен на ЭК-5**  
**Сборка:** `/tmp/orcAI-Desktop_0.1.8_aarch64.app` · **AUTONOMY GATE** — см. прогон сборки (если есть)

**Итог code gate:** **Pass with notes** (2026-09-02)  
**Итог UI приёмки:** ожидает sign-off пользователя по `T-1-protocol.md`

---

## Сделано (актуальный UI · m01)

### Среда выполнения
- 4 строки: Sidecar, движок, Python, ускоритель; точки-индикаторы
- Python «Готов» при `sidecarPhase === "running"` (версия — когда есть capabilities)
- Ускоритель: GPU → «Доступен» (синяя); CPU → «CPU» (зелёная ready, не available)
- «Запуск» / «Перезапустить» / «Остановить»; автозапуск default off + подпись

### Текущий проект
- LCD: записи / аннотации / распознано / модель из `/summary`
- Sync `recording_table.csv` (актуальна / устарела / отсутствует)
- «Открыть папку» (с иконкой) / «Сменить»

### Быстрые действия (m01)
- Распознать → `/predict` (tab run); Обучить → `/pipeline`; Отфильтровать → `/predict` (filter); Результаты → `/results`

### Последние задачи
- Лимит 4; chrome таблицы `/jobs`; точка статуса **только** в pill (без дубля у команды)

### ShellMetaFrames
- Проект · модель · движок на всех экранах

### Persist
- `runtimeAutostart` в preferences (default false)

### Тесты
- UI static: `ek4HomeGate.test.ts` (T-1 A–D + locales + orcAI pin)
- UI components: `RuntimeControlPanel`, `HomeProjectCard`, `HomeRecentJobs`
- UI unit: `projectSummaryFormat.test.ts`, `shellMetaFrames.test.ts`
- Sidecar: `test_compute_project_summary_counts_and_readiness`, `test_compute_project_summary_recording_table_sync_states`
- Отчёт прогона: `EK-4-T1-QA-tests.md` (**Pass**, 2026-09-02)

---

## Принятое отклонение · m37

**B-03 Readiness panel на Главной** — не показывается (убрана по решению продукта: m01 без отдельной «Готовности»).  
API `readiness` / `HomeReadinessPanel` сохранены для **ЭК-5 / Проекты** (m36).  
В `T-1-protocol.md` B-03 помечен как deferred.

---

## Открыто для формального закрытия этапа

- [ ] Ручной UI sign-off A/C/D/E в `T-1-protocol.md`
- [ ] Сборка `.app` + `verify-app-python.sh` → AUTONOMY GATE PASSED
- [ ] Скрины DPI 125% / 150% / Full Screen (E-01…E-03)

---

## Следующий этап

**ЭК-5 / П-2 → Т-2** — Проекты (m02, m23–m36), включая readiness UI

# ЭК-4 / Т-1 — расширенный code gate (Senior QA)

**Дата прогона:** 2026-09-02  
**Тестировщик:** Cursor agent (Senior QA)  
**Область:** Главная · П-1 / Т-1 · m01 (+ m37 deferred)  
**Итог автотестов:** **Pass**

---

## Вердикт

Расширенный набор автотестов **закрывает code gate** по блокам A–D протокола Т-1.  
Ручные E-01…E-03 (DPI/Full Screen), сборка `.app` и UI sign-off **вне** этого прогона — остаются на приёмке пользователя.

| Блок | Автопокрытие | Результат |
|------|--------------|-----------|
| A · Среда выполнения | static + component | Pass |
| B · Проект / summary / sync | static + component + sidecar | Pass |
| B-03 · Readiness на Home | static (deferred → ЭК-5) | Pass (ожидаемо отсутствует) |
| C · Быстрые действия | static + predict nav | Pass |
| D · Задачи / ShellMeta | static + component + unit | Pass |
| E · DPI / Full Screen | — | **не авто** (ручной) |
| Locales RU/EN + pin orcAI 3.0.2 | static | Pass |

---

## Набор тестов

### UI · static gate
`apps/ui/src/lib/ek4HomeGate.test.ts` — **17** кейсов по ID A-01…D-02, locales, pin `v3.0.2`.

### UI · components (happy-dom)
| Файл | Кейсы | Что проверяет |
|------|------:|---------------|
| `RuntimeControlPanel.test.tsx` | 5 | 4 строки+точки+detail; Start/Restart/Stop; Autostart off; GPU blue vs CPU green |
| `HomeProjectCard.test.tsx` | 4 | LCD metrics; sync current/stale/missing; Open folder icon; empty state |
| `HomeRecentJobs.test.tsx` | 3 | limit 4; 5 колонок; running без «Завершена» |

### UI · unit (смежные)
- `projectSummaryFormat.test.ts` (2)
- `shellMetaFrames.test.ts` (2)

### Sidecar
- `test_compute_project_summary_counts_and_readiness` — метрики + readiness (annotations expectation исправлена: manual `.txt` → 1)
- `test_compute_project_summary_recording_table_sync_states` — **новый**: missing / current / stale (rows + mtime)

---

## Результаты прогона

```text
UI:  6 files · 33 tests · Pass
Sidecar summary: 2 tests · Pass
```

Команды — в `T-1-protocol.md` (секция Code gate).

---

## Находки в ходе расширения suite

1. **Старый sidecar assert** `annotations == 0` при наличии `clip_a.txt` — ложный; исправлен на `1`.  
2. **B-03** на Home отсутствует по продуктовому решению — зафиксирован тестом «нет `HomeReadinessPanel` на `HomePage`».  
3. Ручные **E-01…E-03**, **AUTONOMY GATE**, скрины — всё ещё открыты для формального закрытия этапа.

---

## Рекомендация Senior QA

- **Code gate ЭК-4:** закрывать как **Pass**.  
- **Этап ЭК-4 целиком:** **Pass with notes** до ручного sign-off A/C/D/E + `.app`/GATE.

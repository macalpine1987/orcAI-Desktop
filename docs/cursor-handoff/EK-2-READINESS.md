# Senior QA · Заключение по готовности ЭК-2

**Дата:** 2026-09-01  
**Этап:** ЭК-2 · П-15 → Т-15 · NFR-15, NFR-16  
**Версия Desktop:** 0.1.8 (не бампалась)

---

## Итоговый вердикт

| | |
|--|--|
| **Готовность этапа** | **ГОТОВ** |
| **Решение Senior QA** | **Accept** |
| **Функционал** | **10/10** |
| **Качество** | **10/10** |
| **Переход к ЭК-3** | **Рекомендуется** |

ЭК-2 (подготовка к портам) выполнен в заявленном scope. Релизные сборки Linux/Windows **не входят** в ЭК-2 — это П-17 / П-18.

---

## Критерии П-15 / Т-15

| # | Требование | Вердикт | Evidence |
|---|------------|---------|----------|
| 1 | FS-пути через API/`joinFsPath`, не `'/'` в helpers | **PASS** | project, Pipeline, Results, predictSettings, Predict* |
| 2 | Unit-тесты в Linux-контейнере без правок React/FastAPI | **PASS** | python:3.11-slim 11/11; node:22 fresh npm ci 13/13 |
| 3 | Ускоритель без `if macOS` в UI | **PASS** | `resolveAcceleratorBackend`; static gate 0 offenders |
| 4 | Case-sensitive имена WAV/аннотаций | **PASS** | queue Set/has; sidecar stem case |
| 5 | Шрифты с fallback, без `-apple-system` | **PASS** | Inter + system-ui + Segoe UI |
| 6 | Управление службой из UI — только HTTP | **PASS** | fetch sidecar/engine; spawn в Tauri |
| 7 | Full Screen / DPI API в оболочке | **PASS** | Rust commands + `windowChrome.ts` |

**К-14 (NFR-15):** platform-код в shell/sidecar — **PASS**  
**К-13 (NFR-16):** сценарии на платформах — **PASS** для scope П-15 (unit + gate); полные сценарии ОС — П-17/18

---

## Автоматизация (финальный прогон)

| Набор | Результат |
|-------|-----------|
| UI vitest P-15 extended (6 files) | **42/42 PASS** |
| Sidecar P-15 (portability + extended + paths) | **31/31 PASS** |
| **Итого unit ЭК-2** | **73/73 PASS** |

---

## Что намеренно вне scope ЭК-2

- Сборка `.app` / `.deb` / `.msi` и AUTONOMY GATE на целевых ОС
- Реализация Full Screen / DPI на Linux/Windows (stubs заложены)
- Полные сценарии К-13 на реальном железе (Ubuntu/Win10)

---

## Residual notes (не блокируют Accept)

1. `windowChrome.ts` не подключён к `SidecarContext` — API есть, wiring косметический
2. `namesMatchExact` — экспорт без call sites; семантика case-sensitive через `===` / `Set.has`
3. `joinFsPath("D:/…")` — смешанные `/` и `\` (Windows обычно принимает)

---

## Рекомендация

**ЭК-2 закрыт.** Переход к **ЭК-3 / П-12** (Задачи и консоль).  
Сквозные проверки ЭК-1 и ЭК-2 сохраняются на последующих этапах.

**Подпись:** Senior QA · Accept  
**Артефакты:** `EK-2-P15-report.md`, `EK-2-T15-report.md`, `canvases/t15-senior-qa-audit.canvas.tsx`

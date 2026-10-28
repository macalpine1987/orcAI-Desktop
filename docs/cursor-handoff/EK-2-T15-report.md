# Т-15 — отчёт приёмки (ЭК-2 / П-15)

**Дата:** 2026-08-31  
**Scope:** подготовка к портам (без релизных сборок Linux/Windows)

## Вердикт

| | |
|--|--|
| **Т-15 (авто)** | **PASS** |
| **Senior QA** | **Accept · 10/10 · 10/10** (`EK-2-T15-senior-qa.md`) |
| Linux container unit smoke | **PASS** (релизные сборки — П-17) |

## Сценарии промпта

| # | Требование | Результат |
|---|------------|-----------|
| 1 | Нет склейки FS-путей через `'/'` в UI helpers | **PASS** — `joinFsPath` в project/Pipeline/Results/predictSettings; HTTP URL `/` OK |
| 2 | Сборка/тесты в Linux-контейнере | **PASS** — `python:3.11-slim` 11/11; `node:22` fresh `npm ci` 13/13; без правок React/FastAPI |
| 3 | Экран среды без `if macOS` для ускорителя | **PASS** — `resolveAcceleratorBackend`; rg darwin/macos в UI пуст |
| 4 | Case-sensitive WAV/аннотации | **PASS** — UI 3 теста + sidecar stem case |
| 5 | Шрифты с fallback | **PASS** — Inter + system-ui + Segoe UI; без -apple-system в axes |

## Авто-прогоны

| Прогон | Результат |
|--------|-----------|
| UI vitest P-15 (базовый) | **13/13 PASS** |
| UI vitest P-15 **extended** (6 files) | **42/42 PASS** |
| Sidecar `test_p15_portability` + `test_paths` | **11/11 PASS** |
| Sidecar `test_p15_extended` (+ portability + paths) | **31/31 PASS** |

Extended UI: `joinFsPath`, `sidecarCapabilities`, `p15PortabilityGate`, `caseSensitivePaths`, `projectPaths`, `windowChrome`.  
Extended sidecar: `tests/test_p15_extended.py`.

## Остаточные platform-if (намеренно в shell/sidecar)

- Rust `#[cfg(target_os = "macos")]` hide / Reopen / Opened
- `window_close_policy` → `"hide"` | `"stop_and_close"`
- Sidecar `engine_worker.py` Metal probe (источник capabilities, не UI-ветка)

## Команды

```bash
cd apps/ui && npm test -- --run src/lib/sidecarCapabilities.test.ts \
  src/lib/joinFsPath.test.ts src/workspace/caseSensitivePaths.test.ts
cd apps/sidecar && PYTHONPATH=src python -m unittest tests.test_p15_portability tests.test_paths -v
```

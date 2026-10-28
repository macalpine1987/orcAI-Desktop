# Т-14 — отчёт приёмки (ЭК-0 / П-14)

**Дата:** 2026-08-31 (после fix cancel `test` без `-o` → marker на `model_dir`)  
**Вердикт:** **PASS** (unit 68/68; integration exit 0)  
**Прогон:** `ORCAI_FORCE_INPROCESS_JOBS=1 PYTHONPATH=src python tests/run_t14_integration.py`  
**Сырой лог:** `/tmp/orcai-t14-report.txt`

## Соответствие пунктам П-14

| # | Требование | Статус |
|---|------------|--------|
| 1 | 12 handlers; дефолты из движка | PASS |
| 2 | Очередь / cancel / retry / priority / =1 | PASS |
| 3 | Поток лога + прогресс; реконнект | PASS |
| 4 | Точная `command_line` | PASS |
| 5 | `exit_code` + текст ошибки | PASS |
| 6 | Cancel cleanup / incomplete | PASS (вкл. `test` → `model_dir` без `-o`) |
| 7 | Абсолютные created_files (только созданные) | PASS |

## Senior QA

**Функционал 10/10 · качество 10/10 · Accept**

## Сценарии

T-14.1 … T-14.6 + T-14.4b — все PASS.

## Примеры curl

См. `docs/cursor-handoff/EK-0-curl-examples.md`.

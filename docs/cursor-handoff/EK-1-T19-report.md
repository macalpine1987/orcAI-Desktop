# Т-19 — отчёт приёмки (ЭК-1 / П-19)

**Дата:** 2026-08-31  
**Прогон:** автоматическая часть; **п.4 UI-стресс исключён** по решению заказчика  
**Сырой лог:** `/tmp/orcai-t19-report.txt`

## Вердикт Senior QA

| | |
|--|--|
| **Т-19 (scope без п.4)** | **PASS · Accept** |
| **Функционал** | **10/10** |
| **Качество** | **10/10** |

## Сценарии промпта

| # | Требование | Результат |
|---|------------|-----------|
| 1 | ruff: 0 error; noqa с комментарием | **PASS** — `All checks passed`; 23× `BLE001` с `— <why>` |
| 2 | Bundled orcAI не изменён | **PASS** — нет `orcai` в `sidecar/src`; `orcai==3.0.2` |
| 3 | Дефолты CLI / имена артефактов predict | **PASS** — pass-through; CLI без `-th`/`-c`; `*_predicted.txt` |
| 4 | Стресс UI ≥30 мин + RSS | **EXCLUDED** (заказчик) |
| 5 | Cancel без «готовых» частичных (NFR-6) | **PASS** — unit cancel + Т-14.2 |

## Регрессия

| Прогон | Результат |
|--------|-----------|
| Unit П-14 | **68/68 OK** |
| `run_t14_integration.py` | **VERDICT: PASS** |
| Sidecar cancel micro-stress | **OK** (доп. к п.5) |

## Evidence (повторный QA-прогон)

- `ruff check src tests` → All checks passed  
- bare `# noqa: BLE001` без причины → none  
- predict control: `{'recording_path': ...}` / `orcai predict /tmp/control.wav` / `sample_c1_orcai-isl-v1_predicted.txt`

## Команды повтора

```bash
cd apps/sidecar
ruff check src tests
NUMBA_DISABLE_JIT=1 ORCAI_FORCE_INPROCESS_JOBS=1 PYTHONPATH=src \
  python -m unittest tests.test_p14_full_coverage tests.test_p14_job_contract
NUMBA_DISABLE_JIT=1 ORCAI_FORCE_INPROCESS_JOBS=1 PYTHONPATH=src \
  python tests/run_t14_integration.py
```

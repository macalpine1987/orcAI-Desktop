# ЭК-1 / П-19 — отчёт (Clean Code · NFR-19/20)

**Дата:** 2026-08-31  
**Этап:** ЭК-1 · **П-19** (реализация) / **Т-19** (автоматическая часть)  
**Макет:** `docs/cursor-handoff/mockups/d01-architecture.png`

## Вердикт

| Часть | Статус |
|-------|--------|
| NFR-19 ruff по sidecar | **PASS** — `ruff check src tests` → All checks passed |
| Bundled orcAI не тронут | **PASS** (правки только в `orcai_desktop_sidecar` + tests) |
| Регрессия Т-14 | **PASS** (unit 68/68; `run_t14_integration.py` PASS) |
| Стресс UI ≥30 мин (NFR-20) | **EXCLUDED** из Т-19 по решению заказчика |
| Т-19 (scope без п.4) | **PASS · 10/10 · 10/10** — `EK-1-T19-report.md` |

## Ruff: было → стало

| | |
|--|--|
| **Было** | 70 findings (`BLE001`×35, `S110`×14, + I/RUF/SIM/TRY/B) |
| **Стало** | 0 errors |
| **Команда** | `npm run lint:sidecar` или `cd apps/sidecar && ruff check src tests` |
| **Конфиг** | `apps/sidecar/pyproject.toml` `[tool.ruff]` (без глобального отключения) |

## Было / стало по трём модулям

### 1. `runner.py`

| Было | Стало |
|------|--------|
| `except Exception: pass` на cancel/partial и restore tqdm | Лог `debug(..., exc_info=True)` + `# noqa: BLE001 — <why>` |
| Job boundary `except Exception` без пояснения noqa | `# noqa: BLE001 — job boundary; error logged + returned to UI`; `str(exc)` в статус/лог (NFR-8) |

### 2. `jobs.py`

| Было | Стало |
|------|--------|
| `_sync_persist`: silent `except Exception: pass` (S110) | `_log.debug(..., exc_info=True)` + noqa с комментарием «persist is best-effort» |
| Cancel path уже был NFR-6 (terminate→wait→cleanup) | Без смены поведения; только явный лог на границах |

### 3. `cancel_cleanup.py`

| Было | Стало |
|------|--------|
| `except Exception:` + `_log.exception` без noqa | `# noqa: BLE001 — cancel cleanup must not fail the cancel path` (явный комментарий П-19 п.8) |
| Покрытие init/CRT/test | Без изменения семантики cleanup |

## NFR-20 (точечный аудит)

- **Отмена / висящие процессы:** контракт П-14 сохранён (Т-14.2 PASS); `clear_worker` / `terminate_worker` на границах job.
- **UI listeners / setInterval:** `SidecarContext`, `JobsPage`, `useJobPoller`, `LabJobContext` — `clearInterval` / `removeEventListener` в cleanup `useEffect` (утечек при размонтировании не найдено; React не меняли).
- **Тяжёлая работа:** jobs остаются в sidecar/очереди; прогресс через messenger/tqdm (без смены orcAI).

## Изменённые файлы (вне orcAI)

`adapters/{audio_import,labels,results_metrics,spectrogram_render,spectrogram_tf_batch}.py`,  
`cancel_cleanup.py`, `engine.py`, `engine_worker.py`, `job_queue.py`, `job_worker.py`,  
`jobs.py`, `main.py`, `progress_tqdm.py`, `project_registry.py`, `runner.py`,  
`tests/{run_t14_integration,test_p14_full_coverage,test_p14_job_contract}.py`,  
`package.json` (`lint:sidecar`), `pyproject.toml` (`dev` extra: ruff).

## Т-19 — чек-лист

1. [x] ruff: ноль error; noqa только с комментарием  
2. [x] bundled orcAI не изменён  
3. [x] CLI/дефолты: регрессия Т-14.6 predict pass-through  
4. [x] Стресс UI ≥30 мин — **исключён** из scope Т-19 (заказчик)  
5. [x] Cancel → нет «готовых» частичных (Т-14.2)

## Unit coverage (П-19)

Файл: `apps/sidecar/tests/test_p19_stability.py` (**14** тестов).

| Класс | Что закрывает |
|-------|----------------|
| `RuffGateTests` | `[tool.ruff]` включён; BLE001 noqa только с `— why` |
| `ExplicitErrorTests` | NFR-8: текст ошибки; persist/cleanup/tqdm log, не silent fail |
| `CancelStabilityTests` | NFR-6/20: terminate→wait→cleanup; thread join; 12 команд |
| `PathContractStabilityTests` | NFR-7: стабильные CLI / kwargs / `*_predicted.txt` |
| `SchedulerStabilityTests` | start_fn exception → log + освобождение слота |
| `ProgressReportingTests` | NFR-4: tqdm → `job.progress` |

## Как повторить

```bash
cd apps/sidecar
ruff check src tests
NUMBA_DISABLE_JIT=1 ORCAI_FORCE_INPROCESS_JOBS=1 PYTHONPATH=src \
  python -m unittest tests.test_p19_stability tests.test_p14_full_coverage tests.test_p14_job_contract
NUMBA_DISABLE_JIT=1 ORCAI_FORCE_INPROCESS_JOBS=1 PYTHONPATH=src \
  python tests/run_t14_integration.py
```

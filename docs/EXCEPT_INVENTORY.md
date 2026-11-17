# `except Exception` inventory (sidecar)

Policy from the out-of-scope remediation plan: **do not** mass-remove `# noqa: BLE001` on cancel/engine IPC. Narrow only non-cancel paths where typed errors help.

## Keep broad (cancel / engine / job boundary)

| Location | Why |
|----------|-----|
| `job_cancel.py` | Cancel must stay resilient |
| `engine.py` / `engine_worker.py` | TF probe / session IPC; errors returned on queue |
| `runner.py` job boundary | Surfaces failure to UI; tqdm restore / fingerprint / prediction index are best-effort |
| `jobs.py` persist / sleep inhibit | Best-effort; rate-limited warning already on persist |
| `routes/jobs.py` worker `proc.start()` | Logs + `set_status(FAILED)` + `append_log` — keep broad |

## Best-effort optional (leave broad or skip-soft)

| Location | Note |
|----------|------|
| `adapters/training.py` path probes / filter fallback | Optional |
| `adapters/results_summary.py` jobs enrichment / one bad label | Must not fail summary |
| `adapters/audio_import.py` per-file | Collected in `failed[]` |
| `adapters/labels.py` TF window/segment | Warnings to UI |
| `progress_tqdm.py`, `sleep_prevent.py`, `compute_device.py` | Side effects |

## Narrowed (typed)

| Location | Catches |
|----------|---------|
| `adapters/training.py` temp CSV write | `(OSError, ValueError, TypeError)` |
| `adapters/training.py` train parameter metadata | `(OSError, ValueError, TypeError, KeyError)` |
| `adapters/models.py` `_parameter_calls` | `(OSError, ValueError, TypeError, KeyError)` |
| `project_studio.py` WAV meta | `(OSError, ValueError, RuntimeError)` |

Revisit adapters when adding new disk write paths: prefer concrete I/O/parse types, not bare `Exception`, unless the call is optional probe.

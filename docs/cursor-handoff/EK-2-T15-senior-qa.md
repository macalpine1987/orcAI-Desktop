# Senior QA · ЭК-2 / Т-15 (re-audit)

**Дата:** 2026-08-31  
**Роль:** Senior QA  
**Артефакт:** `canvases/t15-senior-qa-audit.canvas.tsx`

## Вердикт

| | |
|--|--|
| **Статус** | **Accept** |
| **Функционал** | **10/10** |
| **Качество** | **10/10** |

Предыдущий Conditional Accept снят: Т-15.2 подтверждён в Linux-контейнерах.

## Критерии

| # | Требование | Вердикт |
|---|------------|---------|
| 1 | FS-пути → `joinFsPath` | **PASS** |
| 2 | Тесты в Linux-контейнере без правок React/FastAPI | **PASS** |
| 3 | Ускоритель без `if macOS` | **PASS** |
| 4 | Case-sensitive имена WAV | **PASS** |
| 5 | Шрифты с fallback | **PASS** |
| 6 | HTTP-only из UI | **PASS** |
| 7 | Full Screen / DPI stubs | **PASS** |

## Linux container evidence

```text
# Sidecar
docker run --rm -v "$REPO:/work" -w /work/apps/sidecar python:3.11-slim \
  bash -c 'PYTHONPATH=src python -m unittest tests.test_p15_portability tests.test_paths -v'
→ 11/11 OK

# UI (fresh linux npm ci — host node_modules = darwin optional deps)
docker run --rm -v "$REPO:/work" node:22-bookworm-slim …
  rsync apps/ui → /tmp; npm ci; vitest P-15 files
→ 13/13 OK
```

## Residual notes (не блокеры Accept)

- `windowChrome.ts` не wired в `SidecarContext` (API заложен)
- `namesMatchExact` не вызывается (семантика через `===` / `Set.has`)
- `joinFsPath("D:/…")` — смешанные separators

## Следующий этап

**ЭК-3 / П-12** — Задачи и консоль

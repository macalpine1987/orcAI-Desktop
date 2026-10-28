# ЭК-2 / П-15 — отчёт (подготовка к портам · NFR-15/16)

**Дата:** 2026-08-31  
**Этап:** ЭК-2 · **П-15** (реализация)  
**Макет:** `docs/cursor-handoff/mockups/d02-porting.png`  
**Версия Desktop:** не бампалась (остаётся **0.1.8**)

## Вердикт

| Часть | Статус |
|-------|--------|
| FS path joins → `joinFsPath` | **PASS** |
| Accelerator abstraction (metal/cuda/cpu/unknown) | **PASS** — без `platform === "darwin"` в UI |
| Hide-on-close → shell `window_close_policy` | **PASS** |
| Full Screen / DPI stubs | **PASS** (API заложено; платформы — П-17/П-18) |
| Font fallbacks без `-apple-system` в scientific axes | **PASS** |
| Case-sensitive recording names | **PASS** |
| `paths.py` Windows deny prep | **PASS** (Unix не сломан) |
| Linux/Windows packaging | **не начиналось** (П-17 / П-18) |
| Linux container build | **optional / out of full packaging** — не требовался для критерия П-15 в этом сеансе |

## Что изменено

### 1. Пути UI

- `apps/ui/src/workspace/project.ts` — `defaultRecordingTablePath`, `defaultRecordingsDir` → `joinFsPath`
- `apps/ui/src/workspace/predictSettings.ts` — `projectCallDurationLimitsPath` → `joinFsPath` + basename через split `/` и `\`
- `apps/ui/src/pages/PipelinePage.tsx` — spectrograms / recording_data / tvt_data / models
- `apps/ui/src/pages/ResultsPage.tsx` — models dir

### 2. Ускоритель

- `apps/ui/src/lib/sidecarCapabilities.ts` — `resolveAcceleratorBackend` из `gpu_backend` / `accelerator_hint` / `metal_plugin_installed`
- Metal-сообщения только при backend === `metal`
- Linux + `metal_plugin_installed=false` → `computeAccelCpuOnly` (не MetalMissing)
- `SettingsPage` `gpuLabel`: metal → `computeGpuMetal`, иначе `computeGpu`

### 3. Оболочка

- `src-tauri/src/lib.rs`: `window_close_policy`, `window_set_fullscreen`, `window_is_fullscreen`, `ui_get_scale`, `ui_set_scale`
- `SidecarContext` вызывает `window_close_policy` вместо `platform() === "macos"`
- `apps/ui/src/platform/windowChrome.ts` — тонкая TS-обёртка

### 4. Шрифты

- `analysis-lab.css`: `ui-sans-serif, system-ui, "Segoe UI", sans-serif`
- `tokens.css`: `--font-sans: "Inter", system-ui, "Segoe UI", sans-serif;`

### 5. Sidecar paths

- Windows NT prefixes (`\\?\`, `\\.\,` и `//?/` формы)
- `SystemRoot` / `WINDIR` env
- Drive-letter `C:/Windows` … без поломки Unix blocklist

### 6. Тесты

- `apps/ui/src/lib/joinFsPath.test.ts`
- `apps/ui/src/lib/sidecarCapabilities.test.ts` (+ linux MetalMissing regression)
- `apps/ui/src/workspace/caseSensitivePaths.test.ts` + `namesMatchExact` в `predictQueue.ts`
- `apps/sidecar/tests/test_p15_portability.py`

## Оставшиеся platform-if (намеренно)

| Место | Зачем |
|-------|--------|
| `src-tauri/src/lib.rs` `#[cfg(target_os = "macos")]` | hide-on-close в Rust, Reopen, Opened URLs, `window_close_policy` |
| `engine_worker.py` `sys.platform == "darwin"` | probe hint / metal plugin discovery (сервисный слой; UI не ветвится) |
| Capabilities `platform` field | информационное поле API; UI accelerator text не опирается на него |

## Тесты (сеанс)

```text
cd apps/ui && npm test -- --run sidecarCapabilities joinFsPath caseSensitivePaths
→ 3 files, 13 tests PASS

cd apps/sidecar && PYTHONPATH=src python3 -m unittest tests.test_p15_portability tests.test_paths -v
→ 11 tests PASS
```

## Следующий этап

**ЭК-3** — Задачи и консоль · **П-12 → Т-12**

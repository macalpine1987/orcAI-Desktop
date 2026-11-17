# Инвентарь кодовых оптимизаций macOS → Windows (после 1.0.3 → поведение 1.0.4)

Сопровождает `WINDOWS-CHANGES-AFTER-1.0.3.md` (§1–§66).  
Там — **поведение и UI**. Здесь — **полный инвентарь façade-сплитов, perf/stability и session-store** (residual audit #3–#13 + поздние правки LCD/session).

Версию Desktop на Windows **не** бампать в 1.0.4. Скрипты сборки macOS **не** копировать.

---

## Как пользоваться

1. Сначала перенести поведение по `WINDOWS-CHANGES-AFTER-1.0.3.md`.
2. Затем сверить дерево файлов с таблицами ниже (façade должен существовать; домены — рядом).
3. Блок **«Не переносить»** соблюдать строго (WKWebView / macOS-only).

Источник истины по Open-находкам: canvases `technical-audit-v1.0.4-reaudit-{3…13}.canvas.tsx` (на macOS-копии). На момент упаковки Open High/Medium/Low = **0**.

---

## Не переносить (macOS-only)

| Путь / тема | Почему |
|-------------|--------|
| `src-tauri/src/ui_http/` (`mod`, `framing`, `exchange`, `pool`, `codec`) | Мост WKWebView; на Windows — обычный `fetch` |
| `sidecar_http_exchange` в `lib.rs` / permissions / `apps/ui/src/api/sidecarFetch.ts` / `installSidecarFetchProxy()` | То же |
| `macos_reveal_open_args` | На Windows свой «показать в папке» |
| `scripts/build-macos-release.sh` и остальные macOS build/embed/verify | Автономия macOS `.app` |
| Bump `version` → 1.0.4 в package/Cargo/tauri | Только macOS-штамп |

Примечание: в старых формулировках «Не делать» ещё фигурируют монолиты `ui_http.rs` / `sidecar.rs`. На текущей macOS-копии они **уже разбиты на каталоги**; смысл запрета тот же — не тащить WKWebView-путь на Windows. Сплит `src-tauri/src/sidecar/` (port/launch/curl) **можно** переносить, если на Windows ещё монолит и это не тянет ui_http.

---

## A. Residual audit — закрытые façade-сплиты

### A1. Rust · Tauri shell (#7–#9)

| Было | Стало (façade + домены) | Перенос на Windows |
|------|-------------------------|--------------------|
| `sidecar.rs` ~991 | `src-tauri/src/sidecar/{mod,port,curl_http,launch}.rs` | Да (без ui_http) |
| `ui_http.rs` ~893 | `src-tauri/src/ui_http/{mod,framing,exchange,pool,codec}.rs` | **Нет** |
| Толстый `lib.rs` handlers | `src-tauri/src/commands/{mod,sidecar_cmds,window_cmds,shell_cmds}.rs` + `pub use` / `generate_handler` | Да |
| Port retry 48×250ms | `8×100ms` (~0.8s) под mutex при `begin_sidecar_start` | Да |

### A2. Sidecar · HTTP routers (#5–#7)

| Façade | Домены | Примечание |
|--------|--------|------------|
| `routes/projects.py` | `project_routes_{crud,recordings,studio,train}.py` | 27 endpoints; flat include |
| `routes/media.py` (~32) | `media_{labels,results,spectrogram,audio,maintenance}.py` | OpenAPI media paths |
| `routes/jobs.py` | `job_create_route.py` | create body вынесен |
| sync→`asyncio.to_thread` | import/init recordings, `spectrogram_meta` | Не блокировать event loop |

### A3. Sidecar · mid-size domains (#9–#11)

| Façade | Домены |
|--------|--------|
| `store.py` | `store_db.py`, `store_jobs.py`, `store_projects.py` — сохранить `_APP_DIR` на façade для patch-тестов |
| `project_studio_table.py` | `project_studio_table_{io,status,ops}.py` |
| `adapters/spectrogram_render.py` | `spectrogram_render_{color,audio}.py` |
| `train_monitor.py` | `train_monitor_helpers.py` |
| `pipeline_inspect_*` | `pipeline_inspect_{assemble,inventory,payload,steps}.py` |
| `project_annotation_stats.py` | `project_annotation_{counts,readiness,stats}.py` |
| `model_studio.py` | `model_studio_{list,detail,io}.py` |
| `project_studio.py` | `project_studio_{annotations,artifacts,helpers,table*}.py` |

Дополнительно (#11): linear→dB через **numpy** (обход битого librosa/numba на host).

### A4. UI · pages / hooks / prefs (#3–#10, #13)

| Тема | Файлы |
|------|-------|
| Thin page façades | `pages/{Predict,Pipeline,Projects}Page.tsx` → hooks |
| Predict composer | `usePredictPageState.ts` + `usePredict{Queue,QueueImport,BatchRun,Filter*,Analysis*,TabsNav,LocationNav,ShellMetaBridge,WorkspaceModelSync,SettingsProfiles,RecordingTable,PageActions,PageLocalState,RunDerived}.ts` |
| Pipeline | `usePipelineBoard.ts` + `usePipelineBoard{Actions,Poll}.ts` |
| Projects | `useProjectsPageModel.ts` + `useProject{Studio*,NavActions,Dialogs,WizardFlow,RegistryActions,RecordingActions,ParametersActions,TableSync,Summary,ClassColors}.ts` |
| Runtime / SidecarContext | `sidecar/useRuntimeLifecycle.ts`, `useSidecarHealthPolling.ts`, `useSidecarTauriListeners.ts`, `useMainShellClosePolicy.ts`, `applyHealthSnapshot.ts`, `startEngineViaHost.ts`, `runtimeWait.ts`, `useSidecarPortAndCapabilities.ts`, `useSidecarProcessControl.ts`, `useSidecarProgressHelpers.ts` |
| Preferences | `preferences/{PreferencesContext,usePreferencesControllers,preferencesHydration,preferencesStore,storage}.ts(x)` |
| projectsStudio barrel | `lib/projectsStudio.ts` + `projectsStudio{Readiness,WizardPaths}.ts` |
| Spectrogram viewer | `useSpectrogramViewerModel.tsx` + sub-hooks (`AudioPlayback`, `Colormap`, `FocusSelection`, `OverlayState`, `ViewerDerived`, `ViewerHover`, `ViewerNodes`, transport zoom/pan/loop) |
| Glyphs | `components/SpectrogramIcons.tsx` → `spectrogramIconGlyphs/{index,navIcons,zoomIcons,toolIcons,transportIcons,iconBase,markOpacityIcon}.tsx` — **не** возвращать `spectrogramIcons` (case-collision APFS) |
| CSS barrel | `styles/analysis-lab.css` → `analysis-lab-{base,predict,filter,jobs}.css` |

### A5. UI · Predict session + keep-alive (#13 + post)

| Тема | Файлы / контракт |
|------|------------------|
| Session SoT | `predict/PredictSessionContext.tsx` (+test) — queue, activeProject, hydrate, server load, `WORKSPACE_CHANGED` |
| Queue façade | `hooks/usePredictQueue.ts` — тонкий слой + import helpers; **нет** `queueRefreshAt` / page-local lifecycle |
| openPredict | `useProjectNavActions` → `hydrateFromProject({ project, queue })` затем `navigate({ tab })` |
| ERR-30 | `navAppliedKeyRef` + `predictSessionNavHandoffKey(projectId, state)` — один handoff один раз |
| PERF-31 | focus/visibility soft-refresh только при `engineReady && isPredictPath(pathname)` |
| TEST-01 | gates в `PredictSessionContext.test.tsx`; Projects CTA → hydrate затем navigate |
| Keep-alive | `layout/LabKeepAliveHost.tsx`, `labKeepAlivePaths.ts` (`isPredictPath`, `isResultsPath`) — только Predict + Results |
| Focus redirect | `usePredictPageState`: `predictNavInactive` → Home **только** на `isPredictPath` (иначе смена цели на Projects уводит shell). `useProjectStudioLifecycle`: не пушить stale `summaryFocus` поверх `detail.focus`. См. §72 `WINDOWS-CHANGES-AFTER-1.0.3.md` |
| App wrap | `App.tsx`: `PredictSessionProvider` снаружи Lab; Outlet placeholder для keep-alive |

---

## B. Perf / memory / stability (не только сплиты)

| ID / тема | Что сделано | Где |
|-----------|-------------|-----|
| Tile abort | Меньше работы после abort тайла | §57 WINDOWS-CHANGES; `SpectrogramViewer` / tile fetch |
| Tile LRU + singleflight | Общий in-flight, prefetch, warm соседей | §60; `spectrogramTileCache.ts`, `spectrogramNeighborWarm.ts` |
| Sidecar Maps prune | LRU `_jobs` logs, `_pipeline_cache`, `_build_locks` | sidecar jobs/pipeline |
| Results snapshot | Map capped (keep-alive; ~16) | Results keep-alive path |
| `formatUserFacingError*` | Без сырых stack в тостах | `lib/userFacingError.ts` + runtime/jobs hooks |
| `start_fn` fail | Job → **FAILED**, не вечный `running`; `_cancelled` подрезается | sidecar queue |
| Import-audio | Общий `register_thread` / worker path | sidecar |
| Port retries | 8×100ms | Rust sidecar begin |
| BODY_CAP | 32 MiB (ui_http — macOS only) | не для Windows WebView2 |
| NUMBA_CACHE_DIR | Для sidecar unittest на грязном host | §28 |
| Soft-skip | Тесты orcAI/librosa при битом numba на host | sidecar tests |
| LCD play/pause | Глиф у **Позиция**, absolute overlay | §56/§66; `SpectrogramLogicLcd.tsx` |

---

## C. Соответствие § WINDOWS-CHANGES

| Inventory | Разделы handoff |
|-----------|-----------------|
| Поведение Lab / Анализ / монитор / фильтр / советы / manual | §1–§61 |
| Thin façades + CSS + glyphs | §62 |
| user-facing errors + LRU/prune + start_fn | §63 |
| Keep-alive | §64 |
| Predict session + ERR-30/PERF-31 | §65 |
| LCD Position финал | §66 |
| Tile LRU/prefetch | §57, §60 |

Если расхождение: **поведение** правит WINDOWS-CHANGES; **дерево файлов** — этот инвентарь.

---

## D. Чеклист сверки дерева (Windows)

Отметить после merge:

- [ ] `commands/{sidecar,window,shell}_cmds.rs` есть; `lib.rs` тонкий
- [ ] `sidecar/{mod,port,curl_http,launch}.rs` (если переносили сплит)
- [ ] **Нет** зависимости UI от `sidecar_http_exchange` / `sidecarFetch` proxy
- [ ] `routes/media_*.py` + thin `media.py`; `project_routes_*.py` + thin `projects.py`
- [ ] `store_{db,jobs,projects}.py` + façade `store.py` (`_APP_DIR`)
- [ ] `project_studio_table_{io,status,ops}.py`
- [ ] `spectrogram_render_{color,audio}.py`
- [ ] `PredictSessionContext` + `LabKeepAliveHost` + `labKeepAlivePaths`
- [ ] `usePredictQueue` без `queueRefreshAt`
- [ ] `SpectrogramIcons` → `spectrogramIconGlyphs/`
- [ ] `analysis-lab.css` barrel из 4 фрагментов
- [ ] `userFacingError.ts` на runtime/jobs путях
- [ ] `SpectrogramLogicLcd` — глиф у Position
- [ ] Тесты: `PredictSessionContext`, `SpectrogramLogicLcd`, `userFacingError`, `spectrogramTileCache`, `spectrogramNeighborWarm`, `manualCopyGate`

---

## E. Связанные документы в этом пакете

| Файл | Роль |
|------|------|
| `WINDOWS-CHANGES-AFTER-1.0.3.md` | Пошаговый перенос поведения §1–§66 |
| `WINDOWS-CODE-OPTIMIZATION-INVENTORY.md` | Этот файл |
| `WINDOWS-SPECTROGRAM-COLORMAPS.md` | Палитры (macOS 1.0.2) |
| `WINDOWS-FILTER-ALIGNMENT.md` | Выравнивание фильтра (macOS 1.0.3) |
| `README-WINDOWS-HANDOFF.md` | Как читать пакет |

Руководство приложения (`docs/manual/{ru,en}/`) переносить из рабочей копии macOS вместе с §61 (клавиши оболочки уже адаптированы под Windows в тексте).

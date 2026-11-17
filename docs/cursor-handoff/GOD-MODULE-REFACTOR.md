# God-module refactor (move-only, UI unchanged)

## Rules

- Move-only: cut/paste logic; no JSX/CSS/selector/i18n/runtime/API behavior changes.
- Façade re-exports keep old import paths (`project_registry`, `train_pipeline`, …).
- Update string-gate tests when symbols move files.
- Per sub-phase: `npm test` (UI) + `npm run sidecar:test`.

## Snapshot (before)

| File | LOC |
|------|-----|
| project_registry.py | 1771 |
| train_pipeline.py | 1409 |
| project_studio.py | 1169 |
| TrainWizard.tsx | 1483 |
| ProjectsPage.tsx | 1314 |
| PredictPage.tsx | 1225 |
| SpectrogramViewer.tsx | 1194 |
| analysis-lab.css | 6875 |
| SidecarContext.tsx | 806 |
| SpectrogramAudioPlayer.tsx | 808 |
| PipelinePage.tsx | 980 |

Target: page shells ≤ ~400–600 LOC; sidecar domain modules ≤ ~500–700 LOC.

## Progress

### Phase 0
- This checklist; move-only / façade rules above.

### Phase 1 (sidecar) — done
| Module | After |
|--------|-------|
| `project_registry.py` | façade (~206) + `project_paths` / `project_focus_settings` / `project_crud` / `project_recordings_io` / `project_table_sync` / `project_annotation_stats` |
| `train_pipeline.py` | façade (~778) + `pipeline_readiness` / `pipeline_artifacts` / `pipeline_param_fps` / `pipeline_annotations` / `pipeline_jobs` |
| `project_studio.py` | façade (~87) + `project_studio_helpers` / `project_studio_table` / `project_studio_annotations` / `project_studio_artifacts` |

Public imports stay `from orcai_desktop_sidecar.project_registry|train_pipeline|project_studio import …`.
`npm run sidecar:test` green after 1c (478).


### Phase 2 (UI) — done
| Module | After |
|--------|-------|
| TrainWizard.tsx | ~412 + `useTrainWizardDraft` / `Launch` / `FinetuneCatalog` + `wizardHelpers` |
| ProjectsPage.tsx | ~447 + `useProjectsPageModel` (+ named loader/action façades) |
| PredictPage.tsx | ~512 + `usePredictPageState` / `usePredictAnalysisNav` |
| PipelinePage.tsx | ~578 + `usePipelineBoard` |
| SpectrogramAudioPlayer | markup kept; `useSpectrogramAudioTransport` boundary + shared player helpers |
| SpectrogramViewer | existing tile/plot/label/transport hooks; `useSpectrogramViewer` barrel |
| SidecarContext | `useRuntimeLifecycle` + `useSidecarProgressHelpers` / `useSidecarCapabilities` |

### Phase 3 (CSS) — done
`analysis-lab.css` barrel `@import`s: base → predict → filter → jobs (cascade order preserved).
Gate helper: `readAnalysisLabCss()`.

### Phase 4
String gates updated for moved symbols; UI + sidecar tests green.

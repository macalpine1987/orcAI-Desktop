# Runtime contract (orcAI Desktop)

Canonical behaviour for Sidecar + orcAI engine. **Do not change UX** without an explicit product request and a new baseline.

Related code: `apps/ui/src/sidecar/SidecarContext.tsx`, `src-tauri/src/lib.rs`, `apps/sidecar/src/orcai_desktop_sidecar/main.py`.

## Defaults

| Rule | Behaviour |
|------|-----------|
| Manual start | App opens with progress **0%**; Sidecar and engine are **stopped** until the user starts them |
| Start control | Primary path: **Start** on Home → `startAll` (Sidecar then engine) |
| Opt-in autostart | Settings `runtimeAutostart` may call `startAll` once prefs are ready — **off by default**; not required for Lab use |
| Dynamic port | Host allocates a free localhost port; UI binds `runtimeBase` via `setSidecarBaseFromPort` |
| Health / capabilities | Only against the session `runtimeBase` — never assume default port `8741` when unbound |
| `engineReady` | True only when sidecar phase is `running`, engine phase is `running`, status `ready`, and orcAI is installed |
| macOS close (X / ⌘W) | **Hide** main window; Sidecar + engine keep running (`hide_on_close_enabled` on macOS) |
| Quit (⌘Q / Quit menu) | `RunEvent::Exit` → `stop_sidecar_process` (engine stop + sidecar) |
| Child windows | Train monitor and other labels are **not** hide-on-close; they close/destroy normally without stopping runtime |
| Sidecar process restart | New process cancels leftover pending/running jobs; brief offline / window hide does **not** cancel a live queue |

## Event matrix

| Event | UI / shell | Sidecar / engine |
|-------|------------|------------------|
| App launch | No automatic Start (unless opt-in autostart) | Not started by shell |
| Home **Start** (`startAll`) | Orchestrates Sidecar → engine | Spawn + `sidecar_engine_start` (host HTTP) |
| Home **Stop** (`stopAll`) | Clears user-started flag | Stop Sidecar (and engine via host path) |
| Home **Restart** | `stopAll` then `startAll` with live `invokeSidecarIsRunning` | Full recycle |
| macOS X / ⌘W (main) | `preventDefault` + `hide()` | Unchanged |
| ⌘Q / Quit | Window exits | `stop_sidecar_process` on `RunEvent::Exit` |
| Sidecar `startup` | — | Bootstrap jobs; cancel orphan pending/running |
| Sidecar `shutdown` | — | Cancel active jobs; shut down spectrogram thread pool |

## Non-goals (keep out of drive-by refactors)

- Autostart Sidecar/engine for every launch as the only path
- Full quit on the red traffic-light (X) on macOS
- Fixed sidecar port `8741` for production sessions
- Treating hide / brief offline as a full runtime stop

## Gate

Source assertions: `apps/ui/src/lib/runtimeContractGate.test.ts` (plus related checks in `p13aSettingsGate`, `ek14TrainMonitorGate`).

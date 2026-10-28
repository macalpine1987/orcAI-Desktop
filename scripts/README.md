# Scripts

## `generate-icons.sh`

Generate Tauri app icons (`src-tauri/icons/icon.icns`, PNG sizes) for the `.app` bundle only.

macOS: `prepare-app-icon-master.py` makes a 1024×1024 RGBA master with transparent
corners (Finder/Dock squircle) and ~16% transparent margin (`CONTENT_SCALE=0.84`)
so the plate matches stock macOS optical size. Do not center-crop the landscape
source — that clips the rounding and leaves an opaque square.

Default source (first found):

1. `assets/icon.png` in the repo
2. `../assets/orcai-icon-a-fin-body-v2.png` (workspace icon draft)

Override: `bash scripts/generate-icons.sh /path/to/icon.png`

## Bundled Python (auto-heal)

| Script | Role |
|--------|------|
| `resolve-bundled-python.sh` | Find a valid bundle in resources, cache, or `ORCAI_BUNDLED_PYTHON_DIR` |
| `ensure-bundled-python.sh` | Auto-fix for dev/CI: use cache, link, or run `bundle-python.sh` |
| `link-bundled-python.sh` | Symlink `src-tauri/resources/python` → cache root |
| `materialize-bundled-python.sh` | Copy cache into `resources/python` before release build |
| `tauri-dev.sh` | `npm run dev` wrapper (exports `ORCAI_BUNDLED_PYTHON_DIR`) |

Cache default: `~/.cache/orcai-desktop/python-bundle-<OS>/<arch>` (also checks `/tmp/orcai-desktop-python-rebuild`).

## `ensure-ui-deps.sh`

Installs `happy-dom` for UI component tests when `apps/ui/node_modules/happy-dom` is missing (cache: `/tmp/orcai-ui-test-deps`). Wired into `pretest` / `prebuild` and `prepare-production.sh`.

## `check-bundled-python.sh`

Validates any resolved bundle root (not only in-repo venv). Used by `npm run check:sidecar`.

## `make-python-venv-portable.sh`

Replaces venv symlinks that point outside the tree (required for a self-contained `.app`).

## `verify-app-python.sh`

**Обязательный autonomy gate** после каждой macOS-сборки:

```bash
bash scripts/verify-app-python.sh "/tmp/orcAI-Desktop_<ver>_aarch64.app"
# ожидать: AUTONOMY GATE PASSED
```

Проверяет: embedded `Python.framework`, vendored dylibs, отсутствие Homebrew load paths, `import ssl`/`orcai` с `PATH=/usr/bin:/bin`.

## `vendor-python-dylibs.sh`

Копирует Homebrew OpenSSL/sqlite/xz/mpdecimal внутрь `.app` и переписывает `@loader_path`. Вызывается из `embed-python-in-built-app.sh`.

## `bundle-python.sh`
Builds into the cache directory, then links into `src-tauri/resources/python` when possible.

## `prepare-production.sh`

Called by Tauri `beforeBuildCommand`: ensure bundle + materialize into resources + UI build.

## Release

```bash
npm run build   # prepare:sidecar + tauri build
```


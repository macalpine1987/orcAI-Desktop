# orcAI Desktop — релизы / baseline

Текущий эталон: **v1.0.4** (2026-11-13). Правило: `orcai-baseline-v1.0.4.mdc`.

## v1.0.4 (текущий)

- **.app:** `/tmp/orcAI Desktop.app`
- **Архив .app:** `/tmp/orcai-desktop-baseline-v1.0.4-app`
- **Снимок исходников:** `/tmp/orcai-desktop-baseline-v1.0.4-src`
- **orcAI в бандле:** 3.0.4
- **AUTONOMY GATE:** PASSED

### Что вошло (кратко)

- Как v1.0.3 + единый `formatUserFacingError*`, LRU/prune, thin façades, `analysis-lab.css` barrel
- Residual audit #6–#12 закрыт (façade-сплиты sidecar/UI/Rust)
- Glyphs спектрограммы: `spectrogramIconGlyphs/` + façade `SpectrogramIcons.tsx` (без case-collision на macOS)
- Удалён подтверждённо мёртвый UI/alias-код; string gates и sidecar-тесты актуализированы
- Soft-skip тестов orcAI/librosa при сломанном numba/librosa в бандле хоста

### Откат исходников

```bash
rsync -a --delete \
  --exclude '.cursor' \
  --exclude 'src-tauri/target' \
  --exclude 'apps/ui/node_modules' \
  --exclude 'node_modules' \
  --exclude 'src-tauri/resources/python' \
  /tmp/orcai-desktop-baseline-v1.0.4-src/ \
  /Users/vadimromanov/.cursor/projects/empty-window/orcai-desktop/
```

Приложение: `ditto /tmp/orcai-desktop-baseline-v1.0.4-app "/tmp/orcAI Desktop.app"` (или открыть архив напрямую).

DMG: `bash scripts/create-dmg.sh "/tmp/orcAI Desktop.app" "/tmp/orcAI-Desktop_1.0.4_aarch64.dmg"`

## Предыдущие

| Версия | Правило | Архивы `/tmp` |
|--------|---------|----------------|
| v1.0.3 | `orcai-baseline-v1.0.3.mdc` | `orcai-desktop-baseline-v1.0.3-{src,app}` |
| v1.0.2 | `orcai-baseline-v1.0.2.mdc` | `orcai-desktop-baseline-v1.0.2-{src,app}` |
| v1.0.1 | `orcai-baseline-v1.0.1.mdc` | `orcai-desktop-baseline-v1.0.1-{src,app}` |
| v1.0.0 | `orcai-baseline-v1.0.0.mdc` | `orcai-desktop-baseline-v1.0.0-{src,app}` |
| v0.1.32 … | соответствующие `orcai-baseline-v0.1.*.mdc` | `orcai-desktop-baseline-v0.1.*-{src,app}` |

Снимки в `/tmp` могут пропасть после reboot — перед очисткой диска копируйте `{src,app}` в постоянное место.

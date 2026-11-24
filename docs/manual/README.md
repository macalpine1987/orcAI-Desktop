# orcAI Desktop User Manual

Bilingual guide (RU/EN) — the single Help source for **Help → Manual** (EN sidebar: **Help & About**).

## Layout

| Folder | Purpose |
|--------|---------|
| `ru/` | Russian chapters (UI language RU) |
| `en/` | English chapters (UI language EN) |
| `manifest.json` | Table of contents, anchors, and screen **Help** button mapping |

## Translation rules

- Translate headings, paragraphs, scenario steps, and parameter explanations.
- **Do not translate:** class names (`WHISTLE`, `BUZZ`…), file names (`predicted.txt`), CLI commands (`orcai predict`…), paths, DOIs, or author names.

## Coverage (focus)

Chapters cover every Lab section. EN menu names: **Jobs**, **Training Pipeline**, **Help & About**; the predictions section is **Predictions** (not “recognition” in the section title). The Parameters run button in the EN locale is **Start recognition** (as in the UI). **Training** (`04-train`) is the most detailed: 8-step pipeline, wizard, spectrogram/model parameter tables, hpsearch, finetune, monitor, snippets/`n_batch`. It targets orcAI 3.0.4 / Desktop 1.0.4.

## App integration (FR-11.12–11.14)

1. At startup, chapters load from bundled `docs/manual/{locale}/` (`import.meta.glob` in the UI).
2. The **Manual** tab shows the chapter tree, Predictions and Training sub-items, and the reading pane.
3. The **Help** button on screens opens the same tab with an anchor (see `manifest.json` → `help_topics`).
4. Chapter language follows the UI language, with no restart required.

## Build

Markdown is part of the UI bundle; rebuild the `.app` after edits to see the text in a release.

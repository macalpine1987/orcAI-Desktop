# m16 · Layer spec (source: `mockups/m16-tasks.png`)

**Эталон:** PNG `m16-tasks.png` (orcAI Desktop **v0.2.0**), не canvas и не skeuo v0.1.8.

---

## Z-order (сверху вниз)

| Z | Слой | Hex / token | Компонент app |
|---|------|-------------|---------------|
| 0 | Viewport canvas | `#131415` `--mat-canvas` | `.mat-shell-main`, `.lab-dock-root` |
| 1 | Sidebar | `#0d0e0f` `--mat-sidebar` | `.mat-shell-sidebar` |
| 2 | Shell header | `--mat-canvas` | `.mat-shell-header` (same as Home / all sections) |
| 2a | Header bottom rule | `#111213` `--border` | header `border-bottom` |
| 3 | **Work panel** (outer) | `#0e0f10` + rim | `.studio-panel.jobs-work-panel` |
| 3a | Page title + subtitle | inside panel | `.jobs-page-header` |
| 3b | Toolbar row | inside panel | `.jobs-toolbar` |
| 4 | **Table inset** | thead `#131415`, rim inset | `.jobs-table-body` (inset well inside panel) |
| 4b | tbody row A / B | `#101112` / `#0f1011` | `.jobs-table-row` alternating |
| 4c | **tbody row selected** | `#20262b` `--m16-row-selected` | `.jobs-table-row-selected` |
| 4d | select dot | `#61a2e2` `--m16-action-link` | `.jobs-row-select-dot` |
| 5 | **Dock outer frame** | `#0e0f10` `--mat-face` | `.studio-panel.lab-dock-frame` |
| 5a | Dock header | `#0e0f10` | `.lab-dock-header` |
| 5b | Dock body well | `#0e0f10` | `.lab-dock-body` |
| 5c | **Log inset** | `#171819` `--mat-log-well` | `.lab-dock-inner-pane` (log) |
| 5d | **Inspector inset** | `#111213` `--mat-inspector-well` | `.lab-dock-inner-pane` (inspector) |

---

## Skeuomorphism (PNG)

**Chrome (header, sidebar):** тёмные правила `#111213` / `#191a1b`, **без** белого outer glow.

**Raised panel** (table, dock outer):
```
border: 1px #111213
box-shadow: inset 0 1px 0 #3d3e40   ← inner top highlight
```

**Raised button / pill** (filter, toolbar):
```
background: #20262b (flat) | #2e3338 (toolbar) | #293035 (primary)
border: 1px #20262b
box-shadow: inset 0 1px 0 #3a4045, inset 0 -1px 0 #171c21
```

**Active filter pill:**
```
background: #33404c
color: #e3e3e4
border: #20262b
box-shadow: inset 0 1px 0 #3f4f5d, inset 0 -1px 0 #243040
```

**Inset well** (log, inspector):
```
border: 1px #0b0c0d
box-shadow: inset 0 2px 8px rgb(0 0 0 / 0.55)
background: log #171819 | inspector #111213
```

**Nav / dock tab active pill:**
```
background: #f4f4f4
color: #141414
border-radius: 4px
box-shadow: inset 0 1px 0 #fefefe, inset 0 -1px 0 #d0d0d0
```

**Meta frame** (header):
```
fill: #2f3033
border: #343538
(no white rim)
```

---

## Palette (sampled)

| Token | Hex | Use |
|-------|-----|-----|
| `--text` | `#ffffff` | title, active labels |
| `--text-muted` | `#848588` | nav inactive, secondary |
| `--text-faint` | `#5f5f64` | page description |
| `--m16-thead-text` | `#bcbcbd` | table column headers |
| `--m16-action-link` | `#61a2e2` | row actions (Отменить…), select dot |
| `--m16-row-selected` | `#20262b` | selected table row bg |
| `--m16-filter-active` | `#33404c` | active filter pill bg |
| `--m16-btn-bg` | `#20262b` | filter / pill base |
| `--m16-btn-face` | `#2e3338` | toolbar button |
| `--m16-btn-primary` | `#293035` | toolbar primary |

---

## Кнопки (density)

| Element | padding | font-size | radius |
|---------|---------|-----------|--------|
| Filter pill | 4px 12px | 11px | **pill** (`9999px`) |
| Toolbar btn | 4px 10px | 11px | 6px |
| Status pill | 0 8px 0 5px | 10px | **pill** (`9999px`, h 16px) |
| Nav active | 4px 8px | 11px | **4px** |
| Dock tab | 4px 10px | 11px | **pill** (`9999px`) |
| Table frame | — | — | **8px** |

---

## Scale (sampled · 1280×800)

| Token / element | px | CSS var |
|-----------------|-----|---------|
| Sidebar width | 162 | `--m16-sidebar-width` |
| Shell header | standard `min-h-14` | `.mat-shell-header` — **same as Home** |
| Main padding | 10 | `--m16-pad-main` |
| Page section gap | 10 | `--m16-gap-page` |
| Page title | 18 | `--m16-fs-18` |
| Subtitle | 12 | `--m16-fs-12` |
| Table row height | 34 | `--m16-row-h` |
| th padding | 6×12 | `--m16-th-pad-y` / `--m16-cell-pad-x` |
| td padding | 9×12 | `--m16-td-pad-y` / `--m16-cell-pad-x` |
| Dock panel height | 280px fixed | `--m16-dock-h` (17.5rem; table flex:1) |

---

## Work panel (верхний блок)

```
┌─ studio-panel jobs-work-panel ────────────────────────────┐
│ jobs-page-header: Задачи + описание + Справка             │
│ jobs-toolbar: [Все][Активные]…     Очистить | Экспорт    │
│ ┌─ jobs-table-body (inset #131415) ─────────────────────┐ │
│ │ thead + tbody rows (#101112 / #0f1011)                 │ │
│ └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## Консоль (split log | inspector)

```
┌─ studio-panel lab-dock-frame ─────────────────────────────┐
│ lab-dock-header: [Лог][Инспектор][Ошибки][Команда] … Copy │
├─ lab-dock-body (mat-face, padding, gap) ──────────────────┤
│ ┌─ inner-pane log (#171819) ─┐ │ ┌─ inspector (#111213) ┐ │
│ │ pre lab-dock-log-pre       │ │ │ ПАРАМЕТРЫ + JSON      │ │
│ └────────────────────────────┘ │ └──────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- Gap между inset-box ~6px + resize handle.

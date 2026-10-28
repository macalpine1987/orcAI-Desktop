# orcAI Desktop — Design System

Monochrome **Instrument / DAW** UI: tactile panels, inset wells, bezeled spectrogram chrome. Strict black & white materials (no chroma). Light and dark themes share the same material model via CSS tokens.

## Brand

| Item | Value |
|------|--------|
| Product name | **orcAI Desktop** |
| Wordmark | `orc` regular + `AI` semibold; `Desktop` light, smaller |
| Tagline (optional) | Acoustic intelligence for killer whale research |
| Logo | Monochrome waveform mark only; no color logo |

## Visual DNA — Instrument / DAW (monochrome)

- Matte metal / plastic faces, light bevel (top highlight + bottom edge)
- Recessed wells for inputs, tables, main content, LCD
- Raised tactile buttons and segment rails
- Bezel frames around spectrogram / dock instruments
- **No** warm wood, leather, blue LCD, or iOS-6 plastic gloss
- **No chroma** in chrome; annotation overlays on spectrogram may use scientific colors

Relief is moderate: Lab density and WCAG AA text contrast must remain readable.

## Color — strict monochrome

UI uses **no chroma**. Spectrogram heatmap is **grayscale only** (not theme accent colors).

### Light theme

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#FFFFFF` | App viewport fallback |
| `--bg-subtle` | `#F5F5F5` | Legacy subtle fill |
| `--bg-muted` | `#EBEBEB` | Hover |
| `--border` | `#D4D4D4` | Dividers |
| `--border-strong` | `#A3A3A3` | Focus / strong edge |
| `--text` | `#0A0A0A` | Primary text |
| `--text-muted` | `#525252` | Secondary |
| `--text-faint` | `#737373` | Hints |
| `--accent` | `#000000` | Primary buttons, active nav |
| `--accent-fg` | `#FFFFFF` | Text on primary |
| `--destructive` | `#171717` | Delete (outline, not red) |

### Dark theme

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#0A0A0A` | App viewport |
| `--bg-subtle` | `#141414` | Legacy subtle |
| `--bg-muted` | `#1F1F1F` | Hover |
| `--border` | `#2E2E2E` | Dividers |
| `--border-strong` | `#525252` | Focus |
| `--text` | `#FAFAFA` | Primary |
| `--text-muted` | `#A3A3A3` | Secondary |
| `--text-faint` | `#737373` | Hints |
| `--accent` | `#FFFFFF` | Primary buttons |
| `--accent-fg` | `#0A0A0A` | On primary |

### Material tokens (both themes)

| Token | Use |
|-------|-----|
| `--mat-face` | Header, sidebar, cards (face plate) |
| `--mat-recess` | Inset wells (main, inputs, tables) |
| `--mat-raised` | Raised controls |
| `--edge-hi` / `--edge-lo` | Bevel highlight / low edge |
| `--shadow-out` / `--shadow-in` | Outset / inset shadows |
| `--bezel` | Instrument frame |
| `--lcd-bg` / `--lcd-fg` | Monochrome LCD (gray on gray, never blue) |
| `--scrim` | Modal backdrop |

Dark theme inverts lighting: weaker highlight, deeper inset.

### CSS primitives (`styles/instrument.css`)

| Class | Role |
|-------|------|
| `.mat-panel` / `.mat-card` | Raised face panel |
| `.mat-inset` / `.mat-card-inset` | Recessed well |
| `.mat-raised` | Raised plate |
| `.mat-bezel` | Spectrogram / instrument frame |
| `.mat-lcd` | Time / transport LCD |
| `.mat-rail` | Segmented control |
| `.mat-btn` / `.mat-btn-primary` | Tactile buttons |
| `.mat-input` | Recessed field |
| `.mat-table-wrap` | Inset table + raised header |
| `.mat-shell-*` / `.mat-dock*` | App chrome |

### Spectrogram colormap

- UI theme: B&W Instrument
- Spectrogram pixels: grayscale `#000000` → `#FFFFFF` (configurable invert)
- Playhead: 2px solid `--accent`
- Frame: `.mat-bezel` / `--bezel`
- Annotation overlays: scientific colors allowed on plot only (not chrome)

## Typography

| Role | Font | Size / weight |
|------|------|----------------|
| UI | **Inter** | 14px body, 12px caption |
| Mono (logs, paths, JSON, LCD) | **IBM Plex Mono** | 13px |
| Display | Inter | 24px / 600 |

No decorative fonts.

## Spacing & shape

- Base unit: **4px**
- Radius: **4px** (Lab)
- Button height: **32px** (Lab)
- Sidebar width: `--sidebar-width` (Lab ~11.5rem)

## Layout — Lab only

- Header: `.mat-shell-header`
- Sidebar: `.mat-shell-sidebar` + tactile nav items
- Main: `.mat-shell-main` (recessed content well)
- Bottom dock: `.mat-dock` + inset log/inspector sections
- Theme: `light` \| `dark` (user preference in Settings)

## Navigation (sidebar)

1. Home  
2. Projects  
3. Recordings  
4. Predict  
5. Training Pipeline  
6. Models  
7. Spectrogram  
8. Results & Reports  
9. Jobs  
10. Settings  
11. Help & About  

Lab: Command palette (⌘K).

## Key screens

### Home

Instrument status panel + project tiles as `.mat-card`.

### Predict + Spectrogram / Results Studio

```
┌────────────────────────────────────────────────────────────┐
│ page toolbar · file strip · transport (LCD) · segment/zoom │
├────────────────────────────────────────────────────────────┤
│ bezeled spectrogram (grayscale) + overlays                 │
├────────────────────────────────────────────────────────────┤
│ detections table (mat-table-wrap)                          │
└────────────────────────────────────────────────────────────┘
```

### Pipeline

Monochrome DAG nodes: pending outline, running pulse border, done filled.

## Components

- **Button:** `.mat-btn` / `.mat-btn-primary` (tactile; primary = filled accent)
- **Input:** `.mat-input` (inset, strong border on focus — no colored glow)
- **Table:** `.mat-table-wrap` (inset + raised header)
- **Modal:** `.mat-modal` on `.mat-modal-backdrop`
- **Badge:** outline; `Running` = grayscale border pulse

## Motion

- Subtle: 150ms ease on hover/press
- No bounce, no chroma transitions

## Accessibility

- WCAG AA contrast on all text pairs
- Patterns + labels for annotation classes where pattern-coded
- Keyboard: transport (space), seek (←→), zoom (+/-)

## Assets

- App icon: white waveform on black (and inverse for macOS)
- Empty states: simple line illustrations, 1px stroke

## Internationalization

- Languages: **Russian** (`ru`) and **English** (`en`)
- Library: i18next + react-i18next; bundles in `apps/ui/public/locales/{ru,en}/`
- OS language auto; Settings → Language for manual override
- Fallback: `en`
- RU: predict → «распознавание»; EN: «predictions»

## Implementation

- Tokens: `apps/ui/src/styles/tokens.css`
- Primitives: `apps/ui/src/styles/instrument.css`
- Analysis chrome: `apps/ui/src/styles/analysis-lab.css` (maps to material tokens)
- Tailwind maps surface/mat-* colors
- `theme`: `light` | `dark` via `data-theme` on root
- `data-layout="lab"`

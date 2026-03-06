# Layout Tiers Contract

This document defines the canonical viewport tiers for structural layout behavior in DND Tools.

## Tier Definitions

- `compact`: viewport width `< 640px`
  - Primary use: phones and narrow windows
  - Layout: single-pane content, bottom navigation, local-nav bottom sheet
  - Local panel entry points: persistent `Browse` pill + left-edge swipe-right
  - Top bar: title context + command palette trigger + overflow utilities
  - No persistent local navigation panel
- `medium`: viewport width `640px` to `1099px`
  - Primary use: tablets and medium desktop windows
  - Layout: icon rail (`60px`) + content shell
  - Primary rail behavior:
    - Tapping a non-active section icon navigates to that section root route.
    - Tapping the active section icon opens a temporary local-navigation overlay anchored to the rail edge.
  - Local panel is temporary/overlay-driven (`300px` overlay width, dismissed via backdrop or `Escape`).
  - Knowledge section uses a non-resizable split-view pattern:
    - list pane at ~`38%`
    - detail pane at ~`62%`
    - empty detail state copy: `Select a note to read it`.
  - Keyboard discoverability is modality-aware:
    - touch-first medium hides shortcut hints
    - first keyboard interaction enables shortcut hints, `Ctrl+P`, and `?` shortcut overlay.
- `expanded`: viewport width `>= 1100px`
  - Primary use: large desktop windows
  - Layout: permanent icon rail (`60px`) + persistent local panel (`240px` default)
  - Local panel can be collapsed with `Ctrl+B` (state persisted in `localStorage`)
  - Local panel is resizable (`200px` to `320px`) with drag and keyboard (`ArrowLeft`/`ArrowRight`)
  - Optional right detail panel (`300px`) toggled with `Ctrl+Shift+R` when context is available
  - Zen mode (`F11`) collapses shell chrome to breadcrumb + exit control

## Source Of Truth

- Runtime tier detection lives in [`src/lib/state/layout.svelte.ts`](../../src/lib/state/layout.svelte.ts).
- Tier mapping is derived from `window` viewport observation via `ResizeObserver` with a 100ms debounce.
- SSR default tier is `expanded`.

## Structural Token Contract

Structural dimensions are defined in `src/app.css` `@theme` tokens and consumed by layout components:

- `--layout-rail-width`
- `--layout-panel-width`
- `--layout-panel-width-narrow`
- `--layout-panel-width-wide`
- `--layout-detail-width`
- `--layout-topbar-height`
- `--layout-bottomnav-height`

Breakpoint tokens are also defined in `src/app.css`:

- `--layout-breakpoint-compact-max`
- `--layout-breakpoint-medium-max`
- `--layout-breakpoint-expanded-min`

## Rules

- Structural layout decisions must be derived from the `layoutState` tier contract (`compact`, `medium`, `expanded`).
- Do not add new structural breakpoints directly in components.
- Do not read `window.innerWidth` directly in component layout logic.
- Tailwind responsive breakpoint utilities (`sm:`, `md:`, `lg:`) are allowed for content-level adaptation, not shell structure.

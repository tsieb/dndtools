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
  - Layout: icon rail (`60px`) + content
  - Local panel is temporary/overlay-driven
- `expanded`: viewport width `>= 1100px`
  - Primary use: large desktop windows
  - Layout: navigation rail + persistent local panel
  - Optional right detail panel

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

# Layout Tiers Contract

This document defines the viewport tiers that drive the React app shell's structural
layout. The shell is `apps/gm-react/src/app/AppShell.tsx`; shared page/panel primitives
live in `apps/gm-react/src/app/screen-kit.tsx`; tokens live in
`apps/gm-react/src/styles/tokens`.

## Tier Definitions

Tier is a single `Viewport` value (`'desktop' | 'rail' | 'phone'`) computed in
`AppShell.tsx` (`computeViewport` / `useViewport`). The IA is identical across all three —
only the presentation of the navigation changes.

- **`phone`** — viewport width `<= 640px`
  - Bottom navigation (`BottomTabBar`) of four hot destinations (Command Center, Session,
    Characters, Atlas) plus a **More** bottom `Sheet` listing the rest of the IA.
  - Single-pane content; the sidebar is not rendered.
- **`rail`** — viewport width `641px`–`1024px`
  - The design-system `NavRail` (icon-only, width `64`), labels move to the accessible
    name / tooltip. Same sections as the desktop sidebar, flattened.
- **`desktop`** — viewport width `> 1024px`
  - The full sidebar (`Sidebar`, width `264px`): brand, campaign chip, grouped nav
    (Run the table / Scenes / Library / More), Recent scenes, and the player/settings/
    account footer.

## Source Of Truth

- Tier detection lives in `AppShell.tsx` and is driven by `window.matchMedia`
  (`(max-width: 640px)` and `(max-width: 1024px)`) with `change` listeners — no resize
  polling. On the server / before hydration the tier defaults to `desktop`.
- The breakpoint values are literal in `computeViewport`; they are **not** token-driven.
  If a breakpoint changes, it changes there.

## Density

Density is orthogonal to the viewport tier and is applied at the document root via the
`data-density` attribute (`standard` default, `comfortable`, `compact`). The density
sizing sets are defined in `apps/gm-react/src/styles/tokens/spacing.css`
(`--density-*` tokens: nav height, card padding, list gap, icon size, input/button
height, touch/focus targets). Touch profiles lock to comfortable (>=44px targets).

## Page-level layout primitives

`screen-kit.tsx` provides the recurring building blocks used by every screen:

- `Page` — centered content column (default `max-width: 1180px`).
- `Panel` — a titled surface card.
- `Seg`, `SetRow`, `BackBar` — segmented control, settings row, and breadcrumb back link.
- `T` — the token shorthand map (resolves to the `var(--color-*)` / `var(--font-*)` /
  shadow tokens); components reference `T.*`, never raw hex.

## Rules

- Structural layout must branch on the `Viewport` tier from `AppShell`, not on ad-hoc
  `window.innerWidth` reads inside screens.
- Screens adapt their *content* with normal CSS (flex/grid, relative units); they must not
  introduce competing shell-structure breakpoints.
- The navigation IA is the same in every tier — a tier change is a presentation change,
  never an IA change (see `NAVIGATION_CONTRACT.md`).

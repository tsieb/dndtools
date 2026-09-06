# Layout Tiers Contract

This document defines the viewport tiers that drive the React app shell's structural
layout. The shell is `apps/gm-react/src/app/AppShell.tsx`; shared page/panel primitives
live in `apps/gm-react/src/app/screen-kit.tsx`; tokens live in
`apps/gm-react/src/styles/tokens`.

## Tier Definitions

Tier is a single `Viewport` value (`'desktop' | 'rail' | 'phone'`) computed in
`src/app/useViewport.ts` (`computeViewport` / `useViewport`). The IA is identical across all three —
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
  - While the Core's `session.workflow` is `active`, a right rail (`SessionRail`, width
    `272px`) opens itself on the far side of the shell and can be collapsed to a narrow
    reopen control (RC-SES-1.1). It renders nothing on any other workflow state and is
    never mounted below `desktop` — the narrower tiers carry the same posture as a rail dot
    (`rail`) or a 16px accent status strip above the tab bar (`phone`), so no tier loses a
    destination to the panel.

## Source Of Truth

- Tier detection lives in `src/app/useViewport.ts` and is driven by `window.matchMedia`
  (`(max-width: 640px)` and `(max-width: 1024px)`) with `change` listeners — no resize
  polling. On the server / before hydration the tier defaults to `desktop`.
- The breakpoint values are literal in `computeViewport`; they are **not** token-driven.
  If a breakpoint changes, it changes there.

## Density

Density is orthogonal to the viewport tier and is applied at the document root via the
`data-density` attribute (`standard` default, `comfortable`, `compact`). The density
sizing sets are defined in `apps/gm-react/src/styles/tokens/spacing.css`
(`--density-*` tokens: nav height, card padding, list gap, icon size, input/button
height, touch/focus targets). Touch profiles lock to comfortable; Android raises every interactive
hit target to at least 48dp.

## Android edge-to-edge and keyboard behavior

- Top and bottom chrome may paint behind transparent system bars. Interactive content uses
  `env(safe-area-inset-top/right/bottom/left)` so cutouts and gesture areas never cover controls.
- `useViewportHeight` centralizes `VisualViewport` height changes for software-keyboard-sized layouts.
  Focused fields and sticky confirmation actions remain reachable while the keyboard is open.
- Rotation, resizing, split screen, and tablet/foldable widths continue to select the tier from
  available width; Android does not lock orientation.
- Sheets and dialogs bound their scrolling to the usable viewport, include bottom safe-area padding,
  and register with the native Back stack.

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
- Screens adapt their _content_ with normal CSS (flex/grid, relative units); they must not
  introduce competing shell-structure breakpoints.
- The navigation IA is the same in every tier — a tier change is a presentation change,
  never an IA change (see `NAVIGATION_CONTRACT.md`).
- Platform-specific availability comes from `src/platform/capabilities.ts`; viewport tiers never
  infer that a renderer is Android, Electron, or web.

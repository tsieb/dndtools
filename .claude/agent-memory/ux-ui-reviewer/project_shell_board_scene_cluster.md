---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, CommandPalette, Board, SceneEditor, SceneBoardCanvas, ProjectionControl, widget-bodies); re-audited 2026-07-29 run #4
metadata:
  type: project
---

Audit of the app-shell + board/scene canvas cluster in `apps/gm-react`. Re-verified after commits
ade99dc1 / 5274a5f9 / fc40e764.

## Structural classes (still true)

1. **The bounded canvas policy is an auto-fit SCALE, not a scroll.** `SceneBoardCanvas`
   `boundedScale = clamp((wrapWidth-16)/extent, 0.4, 1)` with `overflowX:'hidden'`. The seeded home
   board's extent is exactly **792px** (`defaultLayout` in
   `packages/core/src/state/command-center-state.ts`: 3 cols × 240 + 24 gutters), so a 393px phone
   renders /board at **~0.47** — 13px titles at ~6px, 32px hit targets at ~15px. The 0.4 floor is
   NOT what bites (it never engages at 792/393); the scale itself is. Raising the floor REQUIRES
   flipping `overflowX` to `auto`, because `responsive.spec.ts`'s `clippedControls()` only forgives an
   off-viewport control when an ancestor owns a real scroll range on that axis. And the zoom cluster
   is gated `policy === 'canvas'`, so bounded has no escape hatch and no pan.
   The scale-compensation var `--scene-board-touch-target` (SceneBoardCanvas:452) is consumed ONLY
   under `html[data-android]` (`styles/index.css:84-86`) — iOS/mobile-web never gets it. Nothing
   auto-sets `data-density='comfortable'` on phone either (only Settings does), so the phone default
   target is 32px, not 44px.
2. **`/board` and `/scene/:id` bypass `Page`** (`src/app/screen-kit.tsx`) — the only source of route
   gutters. Their bail-out states (`Board.tsx` non-DM, `SceneEditor.tsx` denied/missing) bypass it
   too → flush to both phone edges. STILL OPEN.
3. **Both screens hard-code their own height with magic numbers**
   (`calc(var(--app-viewport-height) - 164px)` phone / `- var(--space-8)` = 32px desktop) instead of
   `height:'100%'` of the already-bounded `<main>`. Desktop top bar is ~52–67px, so `-32px` makes the
   canvas OVERFLOW main by ~20–35px and pushes the `/scene` zoom cluster (`bottom:16`) below the
   fold — the exact thing the code comment claims to fix. Phone over-subtracts (~102px of real chrome
   vs 164) leaving ~60px dead. STILL OPEN.
4. **Side panels close on Escape via a `Card onKeyDown` only** — nothing focuses the panel on open,
   no click-outside. `canvas.spec.ts` documents the defect by focusing "Close" *before* pressing
   Escape. Applies to Board Add, SceneEditor Add/Meta/Inspector. **Board's "Layouts" panel
   (`Board.tsx:466-554`) is worse: no close button AND no Escape handler at all**, and it renders
   unconditionally whenever `editing && !addOpen`, absolutely positioned over the phone canvas → an
   undismissable 280px overlay on a 393px screen for the whole edit session.
5. **`profileId: 'desktop'` still hard-coded** in both widget-library calls (Board:96,
   SceneEditor:94) with `useViewport()` in scope. STILL OPEN.
6. **AppShell's global hotkeys have no input guard.** `Ctrl/Cmd+ArrowRight`
   (`AppShell.tsx:1016-1031`) preventDefaults word-navigation in any text field whenever a scene card
   is queued. The `aria-modal` overlay guard runs after the ⌘K close special-case (that part is fixed).
7. **`scene.destroy-widget` has no restore command.** SceneEditor now stages both entry points
   through a `Dialog` (run #3) — `Board.tsx:126 remove()` / `:364 onRemove={remove}` is STILL
   ungated. /board has no Inspector at all, so keyboard Delete/Backspace is the *only* widget
   lifecycle op there, with no confirm, no toast, no undo, and it also destroys configuration.
8. **`SceneBoardCanvas`'s empty state is also its loading state** (`:515` `widgets.length === 0`), so
   first paint of /board reads "An empty scene / Preparing your GM Screen…". Only `emptyHint` is
   parameterized, not the headline.
9. **Hard-coded warm rgba bypasses tokens** — SceneBoardCanvas:440 `rgba(224,176,111,.07)` and
   widget-bodies:542 `rgba(224,176,111,.10)` + `rgba(20,16,11,.20)`. There ARE light themes
   (`[data-theme='parchment']`, `high-contrast` in `styles/tokens/colors.css`), so these are real.
10. **`Board.tsx` styles REJECTIONS as neutral info** (`role="status"`, `info` icon,
    `--color-text-secondary`) in the same region as successes. SceneEditor uses `role="alert"` +
    `--color-status-error-text`. Prefer SceneEditor's shape.

## Verified NON-defects (don't re-flag)
- ⌘K toggle-off — FIXED (AppShell:988-995 handles the close direction before the overlay guard).
- Bounded edit-mode grid overlay phantom scroll — FIXED (`inset:0` under bounded) + spec'd.
- `--operation-touch-target` fallback chain in `widget-bodies.tsx:125` is wired correctly.
- `BottomTabBar` is in flex flow, not `position:fixed` — `main` does not extend under it.
- `ZoomBtn` 28×28 clears the 24px WCAG 2.5.8 floor. The 14×14 **resize handle**
  (SceneBoardCanvas:762-778) does not.
- OpChip / ZoomBtn both `stopPropagation` on pointerdown, so background deselect doesn't eat them.

## Spec map for this cluster
`apps/gm-react/tests/e2e/canvas.spec.ts` (board mount/move/reload, phone `touch-action: pan-y`
assertion at ~:47 — any horizontal-scroll fix must update it; edit-mode scrollHeight; destroy-confirm
for /scene ONLY; panel-Escape-after-focusing-Close), `responsive.spec.ts` (/board in ROUTES + the
`clippedControls` scroll-path rule), `a11y-axe-gate.spec.ts` (/board + opened command palette),
`ux-audit.spec.ts` + `command-palette.spec.ts` (palette).

See [[completion-pass-ux-patterns]] and [[beta-readiness-audit]] for the destructive-op and
Page/empty-state classes these overlap with.

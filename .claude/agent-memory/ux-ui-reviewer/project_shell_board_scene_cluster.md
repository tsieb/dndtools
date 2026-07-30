---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, Board, SceneEditor, SceneBoardCanvas, SceneCardsPanel, widget-bodies); re-audited 2026-07-30 run #9 at c93c5206
metadata:
  type: project
---

Audit of the app-shell + board/scene canvas cluster in `apps/gm-react`. Re-verified 2026-07-30 at
`c93c5206` (line numbers below are from that commit).

## CONFIRMED FIXED — do not re-report
- Widget operate chips DO gate on the live session now: `widget-bodies.tsx:156-161`
  (`SESSION_ONLY_REASON` + `useSessionOnlyReason`) soft-disables Roll/Start/Pause/Resume/Reset when
  `session.workflow !== 'active'`, and `app/widget-rejection.ts` maps `invalid-state` /
  `package-disabled` / `revision-conflict` to human copy. **Verified the mapping is SOUND**: the only
  `invalid-state` rejections reachable from these two screens are the two session gates
  (`commands/widget-command.ts:181`, `commands/dice.ts:70-77`). Don't re-flag it as over-broad.
- `SceneEditor` now resets ALL per-scene state on `[id]` (`:81-88`) AND keys `SceneMetaPanel`
  (`:442`). The cross-scene metadata-overwrite bug is dead.
- Board Layouts panel as a peer of Add; both screens `height:'100%'`; `/board` Delete confirm;
  `widgetProfileForRuntime()`; AppShell hotkey `typing` guard; ToastViewport phone offset;
  hard-coded warm rgba gone; Board `role="alert"` split from `role="status"`; Board `status` cleared
  on every dispatch (`:118`,`:127`); Board non-DM bail-out via `<Page>`; `emptyTitle` parameterized;
  `<h2>` present on both screens; `aria-expanded` on Board Add/Layouts AND SceneEditor meta/Add;
  SceneBoardCanvas Delete no longer moves focus before the confirm resolves (`:341-350`).
- `--map-*`/`--layer-*` ARE cut for parchment + forced-colors. Global `:focus-visible` ring exists
  (`styles/tokens/base.css`), so bare `tabIndex` divs DO get a ring.
- Dialog is `position:fixed` at `var(--z-modal)` and the phone side panels are `zIndex:4` in the same
  (non-)stacking context, so **the panels do NOT cover the destroy confirm** — verified non-issue.
- `OpChip` min target now resolves: `var(--operation-touch-target, var(--density-touch-target, auto))`
  and `--density-touch-target` IS a `:root` token (`styles/tokens/spacing.css:107`, 32px; comfortable
  44px). Only the `--operation-touch-target` *transform compensation* is Android-gated
  (`styles/index.css:84-86`). My old "resolves to auto on iOS" note was WRONG.

## STILL OPEN — carried forward (re-verified at c93c5206)
1. `SceneEditor.tsx:842-861` Inspector Size S/M/L resizes canvas-LOCKED system-tier widgets
   (`SceneBoardCanvas:385` `canResize` default `w.tier !== 'system'`, lock glyph at `:767`); core has
   no system-tier resize gate. Shift+Arrow on the same widget returns silently (`:359-360`).
2. `SceneBoardCanvas.tsx:279-298` `onWheel` never `preventDefault`s and React binds `wheel` PASSIVE,
   so Ctrl+wheel zooms canvas AND page; needs a native `{passive:false}` listener.
3. `SceneBoardCanvas.tsx:746-770` selection chip at `top:-26` clips inside the bounded
   `overflowY:auto` container. `:771-788` resize handle is a real 14px (< WCAG 2.5.8 24px).
4. Side panels never move focus IN and have no click-outside dismissal (`Board.tsx:481`,`:576`;
   `SceneEditor.tsx:435`,`:452`,`:487`). See NEW-5 for the worse focus-OUT half.
5. `SceneCardsPanel.tsx:745-751` per-card Edit is an unannounced disclosure (no `aria-expanded`/
   `aria-controls`, label never changes, focus never enters, Cancel never restores).
6. `SceneCardsPanel.tsx:722-733` Queue IconButton uses NATIVE `disabled` with its reason in the label.
7. Create-intent gaps: `CommandPalette.tsx` "New scene"/"Build encounter" and `AppShell.tsx:536-542`
   sidebar "New scene" all navigate bare; `/scenes` and `/session` have no `location.state` consumer.
8. `/board` prints "GM Screen" twice (topbar `<h1>` from `nav.ts:18` + the screen `<h2>` at
   `Board.tsx:310`), ~60px apart.
9. `SceneEditor.tsx:227-269` denied/missing bail-out is still a bare `maxWidth:720` div, NOT `<Page>`
   — flush against both phone edges. (Board's equivalent was fixed.)
10. Bounded canvas is an auto-fit SCALE not a scroll (`:187-193`), so a phone paints /board at ~0.47
    and every in-canvas target shrinks with it. See the "phone fit" verdict below — NOT one change.
11. `widget-bodies.tsx:113-117` inert `OpChip` variant is `aria-hidden` (unavailable package ⇒
    visible, unpressable, invisible to AT). Mitigated by the frame `statusNote`, so LOW.

## NEW this pass (run #9)
1. **Zero page gutters on /board + /scene/:id.** `Board.tsx:267-282` and `SceneEditor.tsx:271-286`
   are bare flex columns; `<main>` (`AppShell.tsx:1112-1130`) only pads safe areas, and `<Page>`
   (`app/screen-kit.tsx:121-145`, 24/28px desktop · 16/14px phone) is bypassed. These are the ONLY
   two screens without gutters — the canvas's `radius-lg` border is flush to the pane edge. Fix:
   `boxSizing:'border-box'` + viewport-conditional padding on both roots (keeps `height:'100%'`).
   Spec-safe: canvas.spec.ts measures `scene-board-*`, not the wrapper.
2. **VIEW mode: any pointerdown inside a widget starts a canvas PAN.** `SceneBoardCanvas:223-228`
   `onBgDown` is on the wrapper; the drag overlay that `stopPropagation`s (`:734-744`) only exists in
   EDIT mode, so on `/scene/:id` a pointerdown on note text / stats / the map thumbnail pans and sets
   `document.body.style.userSelect='none'` → note text is UNSELECTABLE and `cursor:'grab'` (`:430`)
   is inherited over readable content. Only `OpChip` guards itself (`widget-bodies.tsx:132`).
   Fix: bail out of the pan branch when the target isn't the wrapper itself.
3. **Persist failures are silent on both screens.** `runtime/SceneRuntime.ts:475-482` RETHROWS after a
   failed `persistFullState`; neither `Board.tsx:113-129` nor `SceneEditor.tsx:118-126` has a `catch`,
   and every caller is fire-and-forget (`void onMove` at `SceneBoardCanvas:265/268/361/367`,
   `onClick={savePreset}`/`applyPreset`). ⇒ unhandled rejection, no alert text, and the optimistic
   draft is dropped (`:136-161`) so the widget snaps back unexplained. HIGHEST-VALUE find this pass.
4. `Board.tsx:389-405` the success region is conditionally MOUNTED with its text already inside —
   `role="status"` needs to pre-exist to announce (the `role="alert"` sibling at `:407` is fine).
5. **Focus drops to `<body>` when a side panel closes itself.** `SceneEditor.tsx:149` (addWidget),
   `:197` (saveMetadata), `:498` (Inspector onClose) and `Board.tsx:198` all unmount the panel while
   focus is inside it. Distinct from carried-item 4 (focus-IN) and worse. Fix: ref the toolbar toggle
   that opened it and `.focus()` in the same handler.
6. `AppShell.tsx:594-628` the "More · audio, graph & extensions" header is a DEAD toggle whenever a
   PLATFORM section is active: `moreExpanded = moreOpen || platformActive` (`:418`), so on /audio,
   /graph, /extensions, /community, /upgrade clicking it changes nothing and `aria-expanded` is
   pinned `true`.
7. **No hover state on five bare inline-styled buttons** (there is NO global `button:hover` anywhere
   in `src/styles/`, and inline styles can't do `:hover`): the widget-library rows
   (`Board.tsx:533-570`, `SceneEditor.tsx:664-701`), the campaign chip (`AppShell.tsx:472-499`), the
   All-scenes toggle (`:563-586`) and the More header (`:595-622`). `SideRow`/`SceneSideRow` in the
   same file already use the repo's `onMouseEnter/Leave` + `T.hover` pattern.
8. `SceneEditor.tsx:865-889` "Keyboard order" readout lies: `focusOrder` is an unclamped relative sort
   key (`core/commands/widget.ts:444-457`; `queries/focus-order.ts:69-73` only compares it) but the
   panel prints `Position ${focusOrder+1}` and "Later" has no upper bound → "Position 4" on a
   3-widget scene. From Auto, "Earlier" pins to 0 = FIRST, not one step earlier.
9. `Board.tsx:185` `if (ok) setStatus(null)` is dead code (the helper already cleared it at `:118`
   and `:127`), and a SUCCESSFUL board widget op announces nothing — the dice total is a plain
   `<span>` with `aria-label` but no live region (`widget-bodies.tsx:283-293`).
10. `SceneCardsPanel.tsx:162-177` "Second screen" Button uses hard `disabled` + `title`/`aria-label`
    reason — the anti-pattern `ProjectionControl.tsx:92-100` documents the fix for in the same app.
    LOW only because `:186-189` duplicates the reason in adjacent text.

## Reusable facts learned here
- `ds/components/core/Button.jsx:20-26` is the canonical soft-disable doc comment: truthy
  `aria-disabled` ⇒ stays focusable, `onClick` swallowed, `opacity .5`. `disabled` ⇒ hard.
- `Button`'s `onMouseLeave` resets `background`/`color` to the VARIANT value, so any caller that
  overrides background via `style` loses it after the first hover.
- `ds/components/forms/Field.jsx` AUTO-associates its label with a single child (generated `useId`)
  and wires `help`/`error` as `aria-describedby`. Do NOT flag a `<Field label>` with no `htmlFor`.
- `SceneRuntime.dispatchNow` rejects (returns `{status:'rejected'}`) for policy refusals but THROWS
  for persist failures. Any `await runtime.dispatch()` without a `catch` is a silent-failure site.

## The "raise the phone fit floor" question — verdict: NOT one coherent change
Four coupled edits + a state-model change: (a) raise the `boundedScale` floor (`:187-190`);
(b) `overflowX:'hidden'`→`'auto'` (`:428`) because `responsive.spec.ts` `clippedControls()` only
forgives an off-viewport control when an ancestor owns a real scroll range on that axis;
(c) `touchAction` `'pan-y'`→`'pan-x pan-y'` (`:434`), which breaks `canvas.spec.ts:47`'s
`toHaveCSS('touch-action','pan-y')`; (d) the zoom cluster is gated `policy==='canvas'` (`:485`) and
reads `view.scale` while bounded uses the DERIVED `boundedScale`. Recommend instead: a bounded-only
"Fit / 100%" toggle behind one override state, as its own change.

## Spec map / coupling for this cluster
- `canvas.spec.ts` — `:47` phone `touch-action: pan-y`; `:41-56` + `:83-88` measure
  `getByTestId('scene-board-bounded')`'s own scrollHeight/clientHeight (wrapper padding is safe);
  `getByRole('button', {name:/Edit layout/i})`; `{name:'Add', exact:true}` / `{name:'Layouts',
  exact:true}`; **`getByTestId('scene-add-widget-panel').getByRole('button').nth(1)` assumes Close is
  button index 0** — any AddWidgetPanel header change breaks it; focus "Close layouts"/"Close" then
  Escape; destroy-confirm for /scene.
- `scene-cards.spec.ts` — `{name:'Queue {title}'}`; `{name:'Show', exact:true}`; asserts the queue
  Move up/down arrows `toBeDisabled()`, so those must stay NATIVELY disabled.
- `responsive.spec.ts` — `/board` in ROUTES + the `clippedControls` scroll-path rule.
- `a11y-axe-gate.spec.ts` — `/board` + the opened command palette. `ux-audit.spec.ts` +
  `command-palette.spec.ts` — the palette.

See [[completion-pass-ux-patterns]] and [[beta-readiness-audit]] for the destructive-op / Page /
empty-state classes these overlap with.

---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, Board, SceneEditor, SceneBoardCanvas, SceneCardsPanel, widget-bodies); re-audited 2026-07-30 run #13 at 7bdf2908
metadata:
  type: project
---

Audit of the app-shell + board/scene canvas cluster in `apps/gm-react`. Re-verified 2026-07-30 at
`7bdf2908` (all line numbers below are from that commit). **`SceneEditor.tsx` lives in
`src/screens/`, NOT `src/app/`** — the agent brief keeps getting this wrong.

## CONFIRMED FIXED — do not re-report
- **Run #9's whole NEW list is mostly gone.** Fixed since c93c5206:
  - Desktop page gutters on `/board` + `/scene/:id` (`Board.tsx:307-308`, `SceneEditor.tsx:307-308`
    — `boxSizing:'border-box'` + `padding: viewport==='phone' ? 0 : '16px 28px'`). Phone is exempt
    BY DESIGN (bounded fit scale is width-derived); do NOT "finish the job" there.
  - VIEW-mode pointerdown no longer pans from widget content (`SceneBoardCanvas.tsx:231`
    `if (e.target !== e.currentTarget) return`).
  - Both `dispatch()` helpers now `try/catch` the persist rethrow (`Board.tsx:124-147`,
    `SceneEditor.tsx:130-144`, shared `PERSIST_FAILED` copy). See OPEN-4/5 for the two callers that
    still BYPASS these helpers.
  - Board's `role="status"` host is permanent + `display`-collapsed (`Board.tsx:422-439`).
  - Focus return on self-closing panels: `app/usePanelFocusReturn.ts`, wired at `Board.tsx:55` and
    `SceneEditor.tsx:121-122`.
  - AppShell "More · audio, graph & extensions" is a REAL disclosure again (`:419-423` —
    `moreExpanded = moreOpen`, with an effect that only OPENS it on a platform route).
- Older fixed items still fixed: `SceneMetaPanel` `key={id}` + the `[id]` reset effect
  (`SceneEditor.tsx:82-89`, `:466`); bounded `height:'100%'`; Layouts as a peer of Add; `/board`
  Delete confirm + `SceneBoardCanvas:347-356` not moving focus before the confirm resolves;
  `<h2>`s in `<main>`; `aria-expanded` on all four toolbar disclosures; `widgetProfileForRuntime()`;
  `widget-rejection.ts` + `SESSION_ONLY_REASON` soft-disable (`widget-bodies.tsx:156-161`).
- Verified NON-issues: `Field` auto-associates its label with a single child
  (`ds/components/forms/Field.jsx:12-20`) — never flag a `<Field label>` with no `htmlFor`. Phone
  panels are `zIndex:4` in the same non-stacking context as the `position:fixed` Dialog, so they do
  NOT cover the destroy confirm. `--operation-touch-target` compensation is Android-only by design
  (`styles/index.css:84-86`); `--density-touch-target` (32px) is the real floor elsewhere.
  `/board` NOT being a phone bottom tab is CONTRACT-COMPLIANT (`docs/architecture/LAYOUT_TIERS.md:15`
  names the four hot destinations).

## STILL OPEN — ranked (run #13 line numbers)
1. **`SceneBoardCanvas.tsx:195-222` + `:264-283` — drags never terminate on `pointercancel` and never
   capture the pointer.** Only `pointermove`/`pointerup` are bound on `window`. On phone `/board`
   edit mode `touch-action:'pan-y'` (`:440`) lets the browser take a vertical drag → `pointercancel`,
   no `pointerup` → `dragRef.current` stays set, `document.body.style.userSelect` stays `'none'`
   APP-WIDE, and every later pointermove keeps dragging with no button down. Same on desktop when the
   button is released outside the window. `MapBuilder.tsx:559` and `map/canvas/EditorCanvas.tsx:448`
   already use `setPointerCapture` — copy that. Zero spec blast radius (canvas.spec drives moves
   through `rt.dispatch`, never a real drag). LOW RISK + HIGH VALUE.
2. **`SceneEditor.tsx:852-864` — the Inspector Visibility `<Select>` has NO accessible name.**
   `ds/components/forms/Select.jsx` is a bare `<select>`; `Section` (`:931-955`) renders its label as
   an unassociated `<span>`. The only control that sets DM-only/Shared/Player-visible announces just
   its value. `a11y-axe-gate.spec.ts:25-26` covers `/board` and `/scenes` ONLY — `/scene/:id` is not
   scanned, so this is uncaught. Fix: `aria-label="Widget visibility"`. LOW RISK + HIGH VALUE.
3. **`SceneEditor.tsx` has ZERO polite live regions** (grep: only `role="alert"` at `:416`). Add
   widget / save details / change visibility / S-M-L resize / keyboard move / remove all apply
   silently, while `/board` has a permanent status host. WCAG 4.1.3.
4. **`Board.tsx:236-238` `snapshotSafePoint()` bypasses the new catch** — raw `runtime.dispatch`.
   It is `await`ed FIRST inside `applyPreset` (`:240`), so on a persist failure "Apply a saved layout"
   throws before its own guarded dispatch runs: dead button, no message, unhandled rejection.
   `:406 void snapshotSafePoint()` same.
5. **`SceneCardsPanel.tsx:104-110 `run()` has no `catch`; `createCard`'s `try/finally` (`:76-101`) has
   no `catch`.** Every scene-card action routes through `run()`, so a persist failure kills
   Show/Queue/Dequeue/Reorder/Next card/visibility/Delete/Save-edit/transition with no toast, and
   `deleteCard` (`:112-128`) never shows its Undo.
6. **parchment contrast: `--color-text-tertiary` on `--color-surface-sunken` = 3.54:1 at 10px**
   (`--text-2xs`, `typography.css:18`). Hits `SceneBoardCanvas.tsx:690-707` — the DM-only visibility
   chip on EVERY widget frame on BOTH routes — and `SceneEditor.tsx:826-839` (the binding lock note).
   Measured: tavern 6.11 PASS · parchment 3.54 FAIL · high-contrast PASS. Marginal siblings:
   `--color-accent` on `--color-accent-subtle` = 4.43 (the "Players" chip + `widget-bodies.tsx:64-79`
   dice formula chips); `--color-text-tertiary` on `--color-bg` = 4.01 (both screens' 10px subtitles,
   `Board.tsx:347-354`, `SceneEditor.tsx:345-352`). Use `--color-text-secondary` (6.28 on parchment
   sunken). `scripts/a11y-nontext-contrast-lint.ts` is NON-TEXT only, so this pair is unlinted.
7. **forced-colors: the selection ring is a `box-shadow`** (`SceneBoardCanvas.tsx:654`). Forced-colors
   forces `box-shadow:none`, and the fallback cue — the `top:-26` selection chip (`:752-776`) — is
   already clipped inside the bounded `overflowY:auto`. So on `/board` in Windows HC, edit-mode
   selection is INVISIBLE. Fix: `outline` + `outline-offset` (outline survives forced colors).
8. **`SceneEditor.tsx:511` — selecting a widget does nothing while Scene details / Add is open.**
   `onSelect` (`:446`) always sets `selectedId` but the Inspector is gated `&& !addOpen && !metaOpen`,
   and the Edit layout/Done toggle (`:403-407`) closes `addOpen` but NOT `metaOpen`. Ring + chip
   paint, no editor opens.
9. `SceneBoardCanvas.tsx:405` — the frame `ariaLabel` appends pixel geometry unconditionally, so in
   VIEW mode every frame announces "…position 48, 48, size 300 by 200".
10. Widget-library rows fire an unguarded async add (`Board.tsx:566-605`, `SceneEditor.tsx:687-726`)
    — no busy state, `scene.add-widget` has no idempotency key ⇒ a double-tap adds two widgets.
11. `AppShell.tsx:568-592` the "All scenes (N)" / "Show fewer" disclosure has no `aria-expanded`/
    `aria-controls` (the More header at `:600-604` now has both). Mitigated by the label change.
12. **Still open from run #9, unchanged:** no hover on the five bare inline-styled buttons
    (`Board.tsx:566-605`, `SceneEditor.tsx:687-726`, `AppShell.tsx:477-504`, `:568-592`, `:600-628`)
    — there is NO global `button:hover` and inline styles can't express it; `SideRow`/`SceneSideRow`
    already use the `onMouseEnter/Leave` + `T.hover` pattern. "Keyboard order" readout lies
    (`SceneEditor.tsx:889-913`). `Board.tsx:203 if (ok) setStatus(null)` is dead code and a successful
    board widget op announces nothing. `SceneCardsPanel.tsx:162-177` Second screen uses hard
    `disabled` + reason-in-label.
13. **Carried deferred backlog** (own pass each, don't re-litigate): bounded `/board` scaling to ~0.47
    on a phone; Inspector S/M/L resizing canvas-LOCKED system-tier widgets (`SceneEditor.tsx:866-885`
    vs `SceneBoardCanvas:391` `canResize`); `SceneBoardCanvas:285-304` `onWheel` never
    `preventDefault`s (needs a native `{passive:false}` listener); the `top:-26` chip clipping and the
    14px resize handle (`:752-794`); side panels never moving focus IN and having no click-outside;
    `SceneCardsPanel.tsx:745-751` unannounced per-card edit disclosure; `widget-bodies.tsx:112-118`
    the `aria-hidden` inert OpChip; `/board` printing "GM Screen" twice (topbar `<h1>` from
    `nav.ts:18` + `Board.tsx:338`); `SceneEditor.tsx:245-287` denied/missing bail-out still a bare
    `maxWidth:720` div instead of `<Page>`; `AppShell.tsx` create-intent gaps + the hotkey-only
    fullscreen scene display.

## Reusable facts learned here
- `SceneRuntime.dispatchNow` (`runtime/SceneRuntime.ts:437`, rethrow at `:475-482`) REJECTS for policy
  refusals but THROWS for persist failures. Any `await runtime.dispatch()` without a `catch` is a
  silent-failure site — `try/finally` is NOT enough.
- `ds/components/forms/Select.jsx` is a bare `<select>` with NO auto-label. Only `Field` names it.
- `ds/components/core/Button.jsx:20-26` is the canonical soft-disable doc comment (truthy
  `aria-disabled` ⇒ focusable, click swallowed, opacity .5). `Button`'s `onMouseLeave` resets
  background/color to the VARIANT value, so a `style` background override dies after one hover.
- Parchment's `--color-text-tertiary` (#837057) is tuned for `--color-surface-raised` (#fff, 4.75:1)
  ONLY. It fails on sunken (3.54), surface-alt (3.84), bg (4.01) and is borderline on surface (4.49).
  Tavern's tertiary passes everywhere in this cluster.
- `--scene-board-touch-target` (`SceneBoardCanvas.tsx:464`) has exactly ONE consumer:
  `styles/index.css:84-86`, gated `html[data-android]`.

## Spec map / coupling for this cluster
- `canvas.spec.ts` — phone `touch-action: pan-y`; `getByTestId('scene-board-bounded')`
  scrollHeight/clientHeight (wrapper padding is safe); `{name:/Edit layout/i}`; `{name:'Add',
  exact:true}`; **`getByTestId('scene-add-widget-panel').getByRole('button').nth(1)` assumes Close is
  button index 0** — any AddWidgetPanel header change breaks it; a strict
  `getByRole('button',{name:'Remove widget'})` that must stay unambiguous (Inspector vs Dialog);
  `getByTestId('widget-<id>').focus()` + Enter/Delete.
- `responsive.spec.ts:218-275` — `/board` AND `/scene/:id` must fill `#main-content` exactly
  (`scrollHeight <= clientHeight+2` AND `#main-content > div` height >= clientHeight-2). Any new
  always-visible row on either root risks this; a `display:none` live-region host does not.
- `a11y-axe-gate.spec.ts:25-26` — `/board` + `/scenes` only. `/scene/:id` is NEVER axe-scanned.
- `scene-cards.spec.ts` — `{name:'Queue {title}'}`; `{name:'Show', exact:true}`; asserts the queue
  Move up/down arrows `toBeDisabled()`, so those must stay NATIVELY disabled.

See [[completion-pass-ux-patterns]], [[ds-layer-audit]] and [[beta-readiness-audit]] for the
destructive-op / Page / token classes this overlaps with.
